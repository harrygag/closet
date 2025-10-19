import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hqmujfbifgpcyqmpuwil.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbXVqZmJpZmdwY3lxbXB1d2lsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDQ2NjQ3NiwiZXhwIjoyMDc2MDQyNDc2fQ.z-HPpEXneiERG3GzLqNcHRHu9L3Y-GcxKzRdsUBYI1o'

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function test() {
  console.log('Testing with SERVICE ROLE KEY...\n')
  
  const { data, error } = await supabase
    .from('clothing_comps')
    .select('*')
    .limit(1)
  
  if (error) {
    console.log('❌ Table does NOT exist or has issues:')
    console.log('Error:', error.message)
    console.log('\nThe SQL may not have run successfully.')
    console.log('Please verify in Supabase SQL Editor.')
  } else {
    console.log('✅ Table EXISTS and is accessible!')
    console.log('Found', data?.length || 0, 'records')
  }
}

test()
