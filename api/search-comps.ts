/**
 * API Endpoint: POST /api/search-comps
 * Simple fallback using existing match_comp_sections RPC
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_CLIENT_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY!
const openaiKey = process.env.OPENAI_API_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

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

    // If no OpenAI key, return empty results
    if (!openaiKey) {
      return new Response(JSON.stringify({ comps: [], stats: { count: 0 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    // Build simple query text
    const queryText = [body.brand, body.category, body.size, body.itemName]
      .filter(Boolean)
      .join(' ')

    // Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: queryText
    })
    const queryEmbedding = embeddingResponse.data[0].embedding

    // Use existing RPC function
    const { data, error } = await supabase.rpc('match_comp_sections', {
      query_embedding: queryEmbedding,
      match_threshold: body.minSimilarity || 0.5,
      match_count: body.limit || 10,
      filter_category: body.category || null,
      filter_brand: body.brand || null,
      filter_size: body.size || null
    })

    if (error) {
      console.error('match_comp_sections error:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ comps: data || [], stats: { count: data?.length || 0 } }), {
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
