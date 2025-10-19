import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = 'https://hqmujfbifgpcyqmpuwil.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_CLIENT_SERVICE_KEY!
const openaiKey = process.env.OPENAI_API_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const openai = new OpenAI({ apiKey: openaiKey })

export interface ClothingComp {
  source_marketplace: string
  listing_id?: string
  url: string
  title: string
  brand?: string
  size?: string
  category?: string
  condition?: string
  price: number
  shipping_cost?: number
  image_urls?: string[]
}

/**
 * Generate text content for embedding from comp data
 */
function createEmbeddingContent(comp: ClothingComp): string {
  const parts = [
    comp.title,
    comp.brand ? `Brand: ${comp.brand}` : '',
    comp.category ? `Category: ${comp.category}` : '',
    comp.size ? `Size: ${comp.size}` : '',
    comp.condition ? `Condition: ${comp.condition}` : '',
    `Price: $${comp.price}`,
    comp.source_marketplace ? `Marketplace: ${comp.source_marketplace}` : ''
  ].filter(Boolean)

  return parts.join(' | ')
}

/**
 * Generate OpenAI embedding for text content
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    })
    return response.data[0].embedding
  } catch (error) {
    console.error('Error generating embedding:', error)
    throw error
  }
}

/**
 * Save comp with embeddings to Supabase
 */
export async function saveCompWithEmbedding(comp: ClothingComp): Promise<void> {
  try {
    // 1. Insert the comp
    const { data: savedComp, error: compError } = await supabase
      .from('clothing_comps')
      .insert({
        source_marketplace: comp.source_marketplace,
        listing_id: comp.listing_id,
        url: comp.url,
        title: comp.title,
        brand: comp.brand,
        size: comp.size,
        category: comp.category,
        condition: comp.condition,
        price: comp.price,
        shipping_cost: comp.shipping_cost || 0,
        image_urls: comp.image_urls || []
      })
      .select('id')
      .single()

    if (compError) {
      console.error('Error saving comp:', compError)
      throw compError
    }

    console.log(`✅ Saved comp: ${comp.title} (ID: ${savedComp.id})`)

    // 2. Create embedding content
    const embeddingText = createEmbeddingContent(comp)
    console.log(`📝 Embedding text: ${embeddingText}`)

    // 3. Generate embedding
    console.log('🤖 Generating OpenAI embedding...')
    const embedding = await generateEmbedding(embeddingText)

    // 4. Save comp section with embedding
    const { error: sectionError } = await supabase
      .from('comp_sections')
      .insert({
        comp_id: savedComp.id,
        content: embeddingText,
        embedding: embedding,
        section_order: 1
      })

    if (sectionError) {
      console.error('Error saving comp section:', sectionError)
      throw sectionError
    }

    console.log('✅ Saved embedding to comp_sections')
  } catch (error) {
    console.error('Failed to save comp with embedding:', error)
    throw error
  }
}

/**
 * RAG Query: Find similar comps using vector similarity
 */
export interface CompSearchParams {
  queryText: string
  matchThreshold?: number
  matchCount?: number
  filterCategory?: string
  filterBrand?: string
  filterSize?: string
}

export async function findSimilarComps(params: CompSearchParams) {
  try {
    // 1. Generate query embedding
    console.log('🔍 Generating query embedding...')
    const queryEmbedding = await generateEmbedding(params.queryText)

    // 2. Call vector similarity search function
    console.log('🎯 Searching for similar comps...')
    const { data, error } = await supabase.rpc('match_comp_sections', {
      query_embedding: queryEmbedding,
      match_threshold: params.matchThreshold || 0.5,
      match_count: params.matchCount || 10,
      filter_category: params.filterCategory || null,
      filter_brand: params.filterBrand || null,
      filter_size: params.filterSize || null
    })

    if (error) {
      console.error('Error searching comps:', error)
      throw error
    }

    console.log(`✅ Found ${data?.length || 0} similar comps`)
    return data || []
  } catch (error) {
    console.error('Failed to find similar comps:', error)
    throw error
  }
}

/**
 * Batch save multiple comps with embeddings
 */
export async function batchSaveComps(comps: ClothingComp[]): Promise<void> {
  console.log(`📦 Batch saving ${comps.length} comps...`)

  for (let i = 0; i < comps.length; i++) {
    console.log(`\n[${i + 1}/${comps.length}]`)
    try {
      await saveCompWithEmbedding(comps[i])
    } catch (error) {
      console.error(`Failed to save comp ${i + 1}:`, error)
      // Continue with next comp
    }
  }

  console.log('\n✅ Batch save complete')
}
