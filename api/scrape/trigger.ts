/**
 * API: POST /api/scrape/trigger
 * 
 * Triggers ScrapyFly scraping for an item to find comparable sales
 */

import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_CLIENT_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY!
const scrapyflyKey = process.env.SCRAPYFLY_API_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface TriggerRequest {
  item_id: string
  marketplaces?: string[] // ['ebay', 'poshmark', 'mercari']
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

function buildSearchUrl(marketplace: string, item: any): string {
  const query = encodeURIComponent(`${item.brand || ''} ${item.title || ''} ${item.size || ''}`.trim())
  
  switch (marketplace) {
    case 'ebay':
      return `https://www.ebay.com/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1`
    case 'poshmark':
      return `https://poshmark.com/search?query=${query}&availability=sold_out`
    case 'mercari':
      return `https://www.mercari.com/search/?keyword=${query}&status=sold_out`
    default:
      return `https://www.ebay.com/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1`
  }
}

export async function POST(request: Request) {
  try {
    const body: TriggerRequest = await request.json()
    const { item_id, marketplaces = ['ebay', 'poshmark', 'mercari'] } = body

    if (!item_id) {
      return new Response(JSON.stringify({ error: 'item_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 1. Get item details from Supabase
    const { data: item, error: itemError } = await (supabase as any)
      .from('Item')
      .select('*')
      .eq('id', item_id)
      .single()

    if (itemError || !item) {
      logError('api/scrape/trigger', 'Item not found', { item_id, error: itemError?.message })
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 2. Create scrape jobs for each marketplace
    const jobs: any[] = []
    for (const marketplace of marketplaces) {
      const searchUrl = buildSearchUrl(marketplace, item)
      
      // Create job record in Supabase
      const { data: job, error: jobError } = await (supabase as any)
        .from('scrape_jobs')
        .insert({
          card_id: item_id,
          metadata_hash: `${item.brand}-${item.title}-${item.size}`.toLowerCase(),
          spider_name: marketplace,
          url_list: [searchUrl],
          state: 'PENDING'
        })
        .select()
        .single()

      if (jobError) {
        logError('api/scrape/trigger', 'Failed to create scrape job', {
          marketplace,
          item_id,
          error: jobError.message
        })
        continue
      }

      jobs.push(job)

      // 3. Trigger ScrapyFly API (if key available)
      if (scrapyflyKey) {
        try {
          const response = await axios.post(
            'https://api.scrapyfly.io/scrape',
            {
              key: scrapyflyKey,
              url: searchUrl,
              render_js: true,
              asp: true, // Anti-scraping protection bypass
              country: 'US',
              format: 'json',
              webhook: `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/scrape/callback?job_id=${job.id}`
            },
            {
              headers: { 'Content-Type': 'application/json' }
            }
          )

          // Update job with ScrapyFly request ID
          await (supabase as any)
            .from('scrape_jobs')
            .update({
              state: 'PROCESSING',
              started_at: new Date().toISOString()
            })
            .eq('id', job.id)

          console.log(`✅ Triggered ScrapyFly for ${marketplace}: ${response.data.request_id}`)
        } catch (scrapyError: any) {
          logError('api/scrape/trigger', 'ScrapyFly API failed', {
            marketplace,
            job_id: job.id,
            error: scrapyError.message
          })
          
          // Mark job as failed
          await (supabase as any)
            .from('scrape_jobs')
            .update({
              state: 'FAILED',
              error_message: scrapyError.message,
              finished_at: new Date().toISOString()
            })
            .eq('id', job.id)
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobs_created: jobs.length,
        jobs,
        message: 'Scrape jobs queued successfully'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )

  } catch (error: any) {
    console.error('Trigger scrape error:', error)
    logError('api/scrape/trigger', 'Unhandled error', { error: error.message })
    
    return new Response(
      JSON.stringify({ error: 'Failed to trigger scrape' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

