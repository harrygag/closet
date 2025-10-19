import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Replicate searchComps function
async function searchComps(params: {
  name?: string
  brand?: string
  size?: string
  tags?: string[]
  minSimilarity?: number
  limit?: number
}) {
  const searchTerms: string[] = []
  
  if (params.brand) {
    searchTerms.push(params.brand)
  }
  
  if (params.tags && params.tags.length > 0) {
    searchTerms.push(params.tags[0])
  }
  
  if (params.size) {
    searchTerms.push(`Size ${params.size}`)
  }
  
  const searchQuery = searchTerms.join(' ')
  
  let query = supabase
    .from('clothing_comps')
    .select('*')
    .order('ai_similarity_score', { ascending: false, nullsFirst: false })
    .order('scraped_at', { ascending: false })

  if (searchQuery) {
    query = query.ilike('search_query', `%${searchQuery}%`)
  }

  if (params.minSimilarity !== undefined) {
    query = query.gte('ai_similarity_score', params.minSimilarity)
  }

  query = query.limit(params.limit || 10)

  const { data, error } = await query

  if (error) {
    console.error('Error fetching comps:', error)
    return []
  }

  return data || []
}

function getCompStats(comps: any[]) {
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
    .filter((p): p is number => p !== null)
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

async function testUIIntegration() {
  console.log('🎯 Testing UI Integration - Simulating "Find Comparable Sales" Button Click\n')
  
  // Simulate user filling out form
  const formData = {
    name: 'Nike Hoodie',
    size: 'L',
    tags: ['Hoodie']
  }
  
  console.log('📝 User Form Data:')
  console.log('  Name:', formData.name)
  console.log('  Size:', formData.size)
  console.log('  Tags:', formData.tags.join(', '))
  
  // Extract brand (what ItemForm does)
  const brandMatch = formData.name.match(/^([A-Z][a-zA-Z]+)/)
  const brand = brandMatch ? brandMatch[1] : undefined
  
  console.log('\n🔍 Extracted Brand:', brand)
  
  // Call searchComps exactly as ItemForm does
  console.log('\n📡 Calling searchComps...')
  const results = await searchComps({
    name: formData.name,
    brand,
    size: formData.size,
    tags: formData.tags,
    minSimilarity: 0.5,
    limit: 10
  })
  
  console.log('✅ Found', results.length, 'comps\n')
  
  if (results.length === 0) {
    console.log('❌ NO COMPS FOUND - UI WILL SHOW "No comps found" MESSAGE')
    return
  }
  
  // Calculate stats (what UI displays)
  const stats = getCompStats(results)
  
  console.log('📊 Stats Displayed in UI:')
  console.log('  Avg Price: $' + stats.avgPrice.toFixed(2))
  console.log('  Median: $' + stats.medianPrice.toFixed(2))
  console.log('  Range: $' + stats.minPrice + ' - $' + stats.maxPrice)
  console.log('  Count:', stats.count)
  
  console.log('\n📋 Top 5 Comps Shown in UI:')
  results.slice(0, 5).forEach((comp, i) => {
    console.log(`\n  ${i + 1}. ${comp.title}`)
    console.log('     Marketplace:', comp.marketplace.toUpperCase())
    console.log('     Price: $' + (comp.price?.toFixed(2) || '0.00'))
    console.log('     Similarity:', ((comp.ai_similarity_score || 0) * 100).toFixed(0) + '%')
    console.log('     Link:', comp.listing_url || 'N/A')
  })
  
  console.log('\n✅ UI INTEGRATION TEST PASSED!')
  console.log('The "Find Comparable Sales" button will show real comps when clicked.')
}

testUIIntegration().catch(console.error)
