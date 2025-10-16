import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

// Load environment variables from .env file
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env file')
  console.log('Make sure your .env file has:')
  console.log('- VITE_SUPABASE_URL')
  console.log('- VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function setupCompsTable() {
  console.log('🚀 Setting up clothing_comps table and test data...')

  // First, check if table exists
  const { error: checkError } = await supabase
    .from('clothing_comps' as any)
    .select('id')
    .limit(1)

  if (checkError && checkError.code === '42P01') {
    console.log('❌ Table does not exist!')
    console.log('\n📋 Please create it manually:')
    console.log('1. Go to: https://supabase.com/dashboard/project/eejitkinuluzihwxojny/sql')
    console.log('2. Copy the SQL from: workers/scrapy/schema.sql')
    console.log('3. Paste and run it')
    console.log('\nOR run this SQL:')
    console.log(`
CREATE TABLE IF NOT EXISTS clothing_comps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  search_query TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  title TEXT NOT NULL,
  price DECIMAL(10,2),
  sold_date TIMESTAMP WITH TIME ZONE,
  shipping_cost DECIMAL(10,2),
  image_url TEXT,
  listing_url TEXT,
  brand TEXT,
  size TEXT,
  color TEXT,
  condition TEXT,
  ai_similarity_score DECIMAL(3,2),
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comps_search ON clothing_comps(search_query);
CREATE INDEX IF NOT EXISTS idx_comps_marketplace ON clothing_comps(marketplace);
CREATE INDEX IF NOT EXISTS idx_comps_similarity ON clothing_comps(ai_similarity_score);
    `)
    return
  } else if (checkError) {
    console.error('❌ Error checking table:', checkError)
    return
  }

  console.log('✅ Table exists!')
  console.log('📝 Adding test comps...')
  
  const testComps = [
    {
      search_query: 'Nike Hoodie Size L',
      marketplace: 'ebay',
      title: 'Nike Sportswear Club Pullover Hoodie Mens Large Black',
      price: 45.99,
      sold_date: new Date('2024-10-15').toISOString(),
      shipping_cost: 0,
      image_url: 'https://i.ebayimg.com/images/g/nike-hoodie.jpg',
      listing_url: 'https://www.ebay.com/itm/nike-hoodie-123',
      brand: 'Nike',
      size: 'L',
      color: 'Black',
      condition: 'Used',
      ai_similarity_score: 0.95
    },
    {
      search_query: 'Nike Hoodie Size L',
      marketplace: 'poshmark',
      title: 'Nike Mens Hoodie Large Gray Swoosh Logo',
      price: 52.00,
      sold_date: new Date('2024-10-14').toISOString(),
      shipping_cost: 7.99,
      image_url: 'https://poshmark.com/nike-gray.jpg',
      listing_url: 'https://poshmark.com/listing/nike-hoodie-456',
      brand: 'Nike',
      size: 'L',
      color: 'Gray',
      condition: 'Good',
      ai_similarity_score: 0.88
    },
    {
      search_query: 'Nike Hoodie Size L',
      marketplace: 'mercari',
      title: 'Nike Tech Fleece Hoodie Size Large Blue',
      price: 78.00,
      sold_date: new Date('2024-10-13').toISOString(),
      shipping_cost: 0,
      image_url: 'https://mercari.com/nike-tech.jpg',
      listing_url: 'https://www.mercari.com/us/item/nike-tech-789',
      brand: 'Nike',
      size: 'L',
      color: 'Blue',
      condition: 'Like New',
      ai_similarity_score: 0.82
    },
    {
      search_query: 'Nike Hoodie Size L',
      marketplace: 'ebay',
      title: 'Vintage Nike Hoodie Large Red 90s',
      price: 65.00,
      sold_date: new Date('2024-10-12').toISOString(),
      shipping_cost: 8.50,
      image_url: 'https://i.ebayimg.com/images/g/vintage-nike.jpg',
      listing_url: 'https://www.ebay.com/itm/vintage-nike-321',
      brand: 'Nike',
      size: 'L',
      color: 'Red',
      condition: 'Used',
      ai_similarity_score: 0.75
    },
    {
      search_query: 'Nike Hoodie Size L',
      marketplace: 'poshmark',
      title: 'Nike Dri-FIT Hoodie Mens Large Black',
      price: 42.00,
      sold_date: new Date('2024-10-11').toISOString(),
      shipping_cost: 7.99,
      image_url: 'https://poshmark.com/nike-dri.jpg',
      listing_url: 'https://poshmark.com/listing/nike-dri-654',
      brand: 'Nike',
      size: 'L',
      color: 'Black',
      condition: 'Fair',
      ai_similarity_score: 0.71
    }
  ]

  const { error: insertError } = await (supabase as any)
    .from('clothing_comps')
    .insert(testComps)

  if (insertError) {
    console.error('❌ Error adding test data:', insertError)
  } else {
    console.log('✅ Added 5 test comps successfully!')
    console.log('\n🎉 Setup complete! Try the "Find Comparable Sales" button in your app.')
    console.log('\nTest it with:')
    console.log('- Name: Nike Hoodie')
    console.log('- Size: L')
    console.log('- Tags: Hoodie')
  }
}

setupCompsTable().catch(console.error)
