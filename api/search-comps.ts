/**
 * API Endpoint: POST /api/search-comps
 *
 * RAG-powered comp search endpoint for ItemForm
 * Generates OpenAI embeddings and queries vector DB
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_CLIENT_SERVICE_KEY!
const openaiKey = process.env.OPENAI_API_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const openai = new OpenAI({ apiKey: openaiKey })

interface SearchCompsRequest {
  itemName: string
  brand?: string
  size?: string
  category?: string
  minSimilarity?: number
  limit?: number
}

export async function POST(request: Request) {
  try {
    const body: SearchCompsRequest = await request.json()

    // 1. Build query text
    const queryParts = [
      body.itemName,
      body.brand ? `Brand: ${body.brand}` : '',
      body.category ? `Category: ${body.category}` : '',
      body.size ? `Size: ${body.size}` : ''
    ].filter(Boolean)

    const queryText = queryParts.join(' | ')

    // 2. Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: queryText
    })

    const queryEmbedding = embeddingResponse.data[0].embedding

    // 3. Vector similarity search
    const { data, error } = await supabase.rpc('match_comp_sections', {
      query_embedding: queryEmbedding,
      match_threshold: body.minSimilarity || 0.5,
      match_count: body.limit || 10,
      filter_category: body.category || null,
      filter_brand: body.brand || null,
      filter_size: body.size || null
    })

    if (error) {
      console.error('Vector search error:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ comps: data || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Search comps error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to search comps' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
