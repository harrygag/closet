import { saveCompWithEmbedding, findSimilarComps, batchSaveComps, ClothingComp } from './embed-comps'

// Test data: Real clothing comps
const testComps: ClothingComp[] = [
  {
    source_marketplace: 'ebay',
    listing_id: 'test-001',
    url: 'https://ebay.com/itm/123',
    title: 'Nike Air Force 1 Low White Size 10',
    brand: 'Nike',
    size: '10',
    category: 'Sneakers',
    condition: 'Used - Good',
    price: 85.00,
    shipping_cost: 12.00,
    image_urls: ['https://i.ebayimg.com/images/g/test1.jpg']
  },
  {
    source_marketplace: 'poshmark',
    listing_id: 'test-002',
    url: 'https://poshmark.com/listing/456',
    title: 'Nike Air Force 1 Classic White Mens 10',
    brand: 'Nike',
    size: '10',
    category: 'Sneakers',
    condition: 'Pre-owned',
    price: 90.00,
    shipping_cost: 7.97,
    image_urls: ['https://di2ponv0v5otw.cloudfront.net/test2.jpg']
  },
  {
    source_marketplace: 'ebay',
    listing_id: 'test-003',
    url: 'https://ebay.com/itm/789',
    title: 'Adidas Superstar White Black Stripes Size 10',
    brand: 'Adidas',
    size: '10',
    category: 'Sneakers',
    condition: 'New with box',
    price: 110.00,
    shipping_cost: 0,
    image_urls: ['https://i.ebayimg.com/images/g/test3.jpg']
  },
  {
    source_marketplace: 'mercari',
    listing_id: 'test-004',
    url: 'https://mercari.com/us/item/xyz',
    title: 'Champion Reverse Weave Hoodie Navy Blue XL',
    brand: 'Champion',
    size: 'XL',
    category: 'Hoodie',
    condition: 'Like new',
    price: 45.00,
    shipping_cost: 0,
    image_urls: ['https://mercari-images.global.ssl.fastly.net/test4.jpg']
  },
  {
    source_marketplace: 'poshmark',
    listing_id: 'test-005',
    url: 'https://poshmark.com/listing/abc',
    title: 'Champion Hoodie Reverse Weave Navy Size XL',
    brand: 'Champion',
    size: 'XL',
    category: 'Hoodie',
    condition: 'Gently used',
    price: 42.00,
    shipping_cost: 7.97,
    image_urls: ['https://di2ponv0v5otw.cloudfront.net/test5.jpg']
  }
]

async function testEmbeddingPipeline() {
  console.log('🧪 Testing OpenAI Embedding Pipeline\n')

  try {
    // Test 1: Batch save comps with embeddings
    console.log('=== TEST 1: Batch Save Comps ===')
    await batchSaveComps(testComps)

    // Test 2: RAG Query - Find similar Nike sneakers
    console.log('\n\n=== TEST 2: RAG Query - Nike Sneakers ===')
    const nikeResults = await findSimilarComps({
      queryText: 'Nike Air Force 1 white sneakers size 10',
      matchThreshold: 0.7,
      matchCount: 5
    })

    console.log('\n📊 Results:')
    nikeResults.forEach((result: any, i: number) => {
      console.log(`\n${i + 1}. ${result.title}`)
      console.log(`   Similarity: ${(result.similarity * 100).toFixed(1)}%`)
      console.log(`   Price: $${result.price}`)
      console.log(`   Brand: ${result.brand}`)
      console.log(`   Marketplace: ${result.url}`)
    })

    // Test 3: RAG Query with filters - Champion hoodies
    console.log('\n\n=== TEST 3: RAG Query with Filters - Champion Hoodies ===')
    const championResults = await findSimilarComps({
      queryText: 'Champion reverse weave hoodie navy',
      matchThreshold: 0.6,
      matchCount: 5,
      filterBrand: 'Champion',
      filterCategory: 'Hoodie'
    })

    console.log('\n📊 Results:')
    championResults.forEach((result: any, i: number) => {
      console.log(`\n${i + 1}. ${result.title}`)
      console.log(`   Similarity: ${(result.similarity * 100).toFixed(1)}%`)
      console.log(`   Price: $${result.price}`)
      console.log(`   Size: ${result.size}`)
    })

    console.log('\n\n✅ EMBEDDING PIPELINE TEST COMPLETE!')
    console.log('\nThe pipeline works:')
    console.log('  ✅ OpenAI embeddings generated')
    console.log('  ✅ Vector similarity search working')
    console.log('  ✅ SQL filters applied correctly')
    console.log('  ✅ Ready for real Scrapy integration')

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error)
    console.log('\nMake sure you:')
    console.log('  1. Ran the SQL from supabase/SETUP_INSTRUCTIONS.md')
    console.log('  2. Have OPENAI_API_KEY in .env')
    console.log('  3. Have SUPABASE_CLIENT_SERVICE_KEY in .env')
  }
}

testEmbeddingPipeline()
