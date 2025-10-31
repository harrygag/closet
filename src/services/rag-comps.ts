import { supabase } from '../lib/supabase/client'

/**
 * RAG-powered comp search for ItemForm
 * Uses OpenAI embeddings + vector similarity
 */

export interface RAGCompResult {
  id: string
  title: string
  brand: string | null
  size: string | null
  category: string | null
  price: number
  url: string
  image_urls: string[] | null
  similarity: number
  source_marketplace: string
}

export interface FindCompsParams {
  itemName: string
  brand?: string
  size?: string
  category?: string
  minSimilarity?: number
  limit?: number
}

/**
 * Find comps using RAG (called from ItemForm "Find Comparable Sales" button)
 */
export async function findCompsWithRAG(params: FindCompsParams): Promise<RAGCompResult[]> {
  try {
    // 1. Build query text for embedding
    const queryParts = [
      params.itemName,
      params.brand ? `Brand: ${params.brand}` : '',
      params.category ? `Category: ${params.category}` : '',
      params.size ? `Size: ${params.size}` : ''
    ].filter(Boolean)

    const queryText = queryParts.join(' | ')
    console.log('🔍 RAG Query:', queryText)

    // 2. Generate embedding on backend (we'll need an API endpoint for this)
    // For now, use simple text search as fallback
    const { data, error } = await supabase
      .from('clothing_comps')
      .select('*')
      .ilike('title', `%${params.itemName}%`)
      .order('scraped_at', { ascending: false })
      .limit(params.limit || 10)

    if (error) {
      console.error('Error fetching comps:', error)
      return []
    }

    // Map to RAG result format
    return (data || []).map((comp: any) => ({
      id: comp.id,
      title: comp.title,
      brand: comp.brand,
      size: comp.size,
      category: comp.category,
      price: comp.price,
      url: comp.url,
      image_urls: comp.image_urls,
      similarity: 0.8, // Placeholder until we have real embeddings
      source_marketplace: comp.source_marketplace
    }))

  } catch (error) {
    console.error('Failed to find comps with RAG:', error)
    return []
  }
}

/**
 * Get pricing stats from comp results
 */
export function getCompStats(comps: RAGCompResult[]) {
  if (comps.length === 0) {
    return {
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      medianPrice: 0,
      count: 0
    }
  }

  const prices = comps
    .map(c => c.price)
    .filter((p): p is number => p !== null && p !== undefined)
    .sort((a, b) => a - b)

  if (prices.length === 0) {
    return {
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      medianPrice: 0,
      count: 0
    }
  }

  return {
    avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
    minPrice: prices[0],
    maxPrice: prices[prices.length - 1],
    medianPrice: prices[Math.floor(prices.length / 2)],
    count: comps.length
  }
}
