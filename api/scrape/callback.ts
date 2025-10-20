/**
 * API: POST /api/scrape/callback
 * 
 * Webhook called by ScrapyFly when scraping completes
 * Saves snapshots to Supabase and optionally generates embeddings
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as cheerio from 'cheerio'
import { getPineconeIndex } from '../_lib/pinecone'
import { normalizeItemData } from '../_lib/normalize'
import { openai as openaiClient } from '../_lib/openai'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_CLIENT_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY!
const openaiKey = process.env.OPENAI_API_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null

interface ScrapedListing {
  title: string
  price: number
  url: string
  sold_date?: string
  condition?: string
  size?: string
  brand?: string
  image_url?: string
  marketplace: string
  item_identifier?: string
}

function logError(source: string, message: string, details?: Record<string, unknown>) {
  try {
    const queueDir = path.join(process.cwd(), 'ops', 'logging')
    const queueFile = path.join(queueDir, 'notion-queue.jsonl')
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true })
    }
    const safe = {
      type: 'error',
      source,
      message,
      details,
      timestamp: new Date().toISOString(),
    }
    fs.appendFileSync(queueFile, JSON.stringify(safe) + '\n', { encoding: 'utf8' })
  } catch (_) {
    // Ignore logging errors
  }
}

function parseScrapedData(scrapyflyResponse: any): ScrapedListing[] {
  const listings: ScrapedListing[] = []
  try {
    const html = scrapyflyResponse?.result?.content || ''
    const url: string = scrapyflyResponse?.config?.url || ''
    const marketplace = url.includes('ebay') ? 'ebay' : url.includes('poshmark') ? 'poshmark' : 'mercari'
    const $ = cheerio.load(html)

    if (marketplace === 'ebay') {
      $('.s-item').each((_, el) => {
        const title = $(el).find('.s-item__title').text().trim()
        const priceText = $(el).find('.s-item__price').text().trim().replace(/[^0-9.]/g, '')
        const href = $(el).find('.s-item__link').attr('href') || ''
        const img = $(el).find('.s-item__image img').attr('src') || ''
        const condition = $(el).find('.SECONDARY_INFO').text().trim()
        if (!title || !priceText) return
        listings.push({
          title,
          price: parseFloat(priceText) || 0,
          url: href,
          condition,
          marketplace,
          image_url: img
        })
      })
    } else if (marketplace === 'poshmark') {
      $('.tile').each((_, el) => {
        const title = $(el).find('.tile__title').text().trim()
        const priceText = $(el).find('.tile__price').text().trim().replace(/[^0-9.]/g, '')
        const href = $(el).find('a').attr('href') || ''
        const img = $(el).find('img').attr('src') || ''
        const brand = $(el).find('.tile__details__pipe__brand').text().trim()
        const size = $(el).find('.tile__details__pipe__size').text().trim()
        if (!title || !priceText) return
        listings.push({ title, price: parseFloat(priceText) || 0, url: href.startsWith('http') ? href : `https://poshmark.com${href}`, image_url: img, marketplace, brand, size })
      })
    } else {
      // mercari (best-effort selectors)
      $('[data-testid="SearchResults"] a').each((_, el) => {
        const title = $(el).find('[data-testid="ItemName"]').text().trim()
        const priceText = $(el).find('[data-testid="ItemPrice"]').text().trim().replace(/[^0-9.]/g, '')
        const href = $(el).attr('href') || ''
        const img = $(el).find('img').attr('src') || ''
        if (!title || !priceText) return
        listings.push({ title, price: parseFloat(priceText) || 0, url: href.startsWith('http') ? href : `https://www.mercari.com${href}`, image_url: img, marketplace })
      })
    }

    return listings
  } catch (error) {
    logError('api/scrape/callback', 'Failed to parse scraped data', { error })
    return []
  }
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!openai) return null
  
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    })
    return response.data[0].embedding
  } catch (error) {
    logError('api/scrape/callback', 'Failed to generate embedding', { error })
    return null
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const job_id = url.searchParams.get('job_id')
    
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'job_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const scrapyflyResponse = await request.json()

    // 1. Get the scrape job
    const { data: job, error: jobError } = await supabase
      .from('scrape_jobs')
      .select('*')
      .eq('id', job_id)
      .single()

    if (jobError || !job) {
      logError('api/scrape/callback', 'Job not found', { job_id })
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 2. Parse scraped listings
    const listings = parseScrapedData(scrapyflyResponse)
    
    if (listings.length === 0) {
      await supabase
        .from('scrape_jobs')
        .update({
          state: 'completed',
          finished_at: new Date().toISOString(),
          error_message: 'No listings found'
        })
        .eq('id', job_id)

      return new Response(
        JSON.stringify({ success: true, message: 'No listings found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 3. Save snapshots to Supabase
    const savedSnapshots = []
    for (const listing of listings) {
      try {
        const { data: snapshot, error: snapshotError } = await supabase
          .from('marketplace_snapshots')
          .insert({
            item_id: job.item_id,
            source_marketplace: listing.marketplace,
            url: listing.url,
            item_identifier: listing.item_identifier,
            title: listing.title,
            sale_price_cents: Math.round(listing.price * 100),
            sold_date: listing.sold_date,
            condition: listing.condition,
            size: listing.size,
            brand: listing.brand,
            image_url: listing.image_url
          })
          .select()
          .single()

        if (snapshotError) {
          logError('api/scrape/callback', 'Failed to save snapshot', {
            job_id,
            listing: listing.title,
            error: snapshotError.message
          })
          continue
        }

        savedSnapshots.push(snapshot)

        // 4. Generate embedding + push to Pinecone (if configured)
        try {
          const index = getPineconeIndex()
          if (index && openaiClient) {
            const normalized = normalizeItemData({
              brand: listing.brand,
              size: listing.size,
              category: undefined,
              title: listing.title,
              color: undefined,
              condition: listing.condition,
              item_type: 'single'
            })
            const text = [
              normalized.brand_canonical,
              normalized.brand_line,
              normalized.category_subcategory,
              `${normalized.size_gender} ${normalized.size_category}`,
              normalized.color_primary,
              normalized.item_condition
            ].filter(Boolean).join(' | ')
            const emb = await openaiClient.embeddings.create({ model: 'text-embedding-ada-002', input: text })
            const vector = emb.data[0].embedding as unknown as number[]
            await index.upsert([
              {
                id: snapshot.id,
                values: vector,
                metadata: {
                  brand: normalized.brand_canonical,
                  brand_line: normalized.brand_line,
                  size_category: normalized.size_category,
                  size_gender: normalized.size_gender,
                  item_type: normalized.item_type,
                  marketplace: listing.marketplace,
                  price_cents: Math.round((listing.price || 0) * 100),
                  sold_date: listing.sold_date || null,
                  condition: normalized.item_condition,
                  title: listing.title,
                  url: listing.url
                }
              }
            ])

            // Mark embedding generated in Supabase
            await supabase
              .from('marketplace_snapshots')
              .update({ pinecone_vector_id: snapshot.id, embedding_generated: true })
              .eq('id', snapshot.id)
          }
        } catch (e: any) {
          logError('api/scrape/callback', 'Embedding/Pinecone upsert failed', { id: snapshot.id, error: e?.message })
        }
      } catch (error: any) {
        logError('api/scrape/callback', 'Failed to process listing', {
          job_id,
          listing: listing.title,
          error: error.message
        })
      }
    }

    // 5. Update job status
    await supabase
      .from('scrape_jobs')
      .update({
        state: 'completed',
        finished_at: new Date().toISOString()
      })
      .eq('id', job_id)

    console.log(`✅ Processed ${savedSnapshots.length} listings for job ${job_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        snapshots_saved: savedSnapshots.length,
        job_id
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )

  } catch (error: any) {
    console.error('Callback error:', error)
    logError('api/scrape/callback', 'Unhandled error', { error: error.message })
    
    return new Response(
      JSON.stringify({ error: 'Failed to process callback' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

