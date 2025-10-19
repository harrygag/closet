import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hqmujfbifgpcyqmpuwil.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbXVqZmJpZmdwY3lxbXB1d2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NjY0NzYsImV4cCI6MjA3NjA0MjQ3Nn0._1HulRiQ3wxfzgDCBRruiJIl4QjXnnhKkuWQOTIa7SQ'

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  console.log('Testing clothing_comps table...')
  
  const { data, error } = await supabase
    .from('clothing_comps')
    .select('*')
    .limit(1)
  
  if (error) {
    console.log('❌ Error:', error.message)
    console.log('Table probably doesn\'t exist yet')
  } else {
    console.log('✅ Table exists!')
    console.log('Data:', data)
  }
}

test()
