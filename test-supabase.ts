import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testSupabase() {
  console.log('🔍 Testing Supabase Connection...')
  console.log('URL:', supabaseUrl)
  
  // Test 1: Check if table exists and has data
  console.log('\n📊 Test 1: Query clothing_comps table')
  const { data, error } = await supabase
    .from('clothing_comps')
    .select('*')
    .limit(5)
  
  if (error) {
    console.error('❌ Error:', error)
  } else {
    console.log('✅ Success! Found', data?.length || 0, 'records')
    console.log('Data:', JSON.stringify(data, null, 2))
  }
  
  // Test 2: Test the actual search query
  console.log('\n🔍 Test 2: Search for Nike Hoodie Size L')
  const { data: searchData, error: searchError } = await supabase
    .from('clothing_comps')
    .select('*')
    .ilike('search_query', '%Nike Hoodie%')
    .limit(5)
  
  if (searchError) {
    console.error('❌ Search Error:', searchError)
  } else {
    console.log('✅ Search Success! Found', searchData?.length || 0, 'results')
    console.log('Results:', JSON.stringify(searchData, null, 2))
  }
}

testSupabase().catch(console.error)
