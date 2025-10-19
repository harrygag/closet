import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = 'https://hqmujfbifgpcyqmpuwil.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_CLIENT_SERVICE_KEY || ''

console.log('🔍 Checking RAG Pipeline Setup...\n')

// Check 1: Environment variables
console.log('=== 1. Environment Variables ===')
const checks = {
  supabaseUrl: !!supabaseUrl,
  supabaseServiceKey: !!supabaseServiceKey,
  openaiKey: !!process.env.OPENAI_API_KEY
}

console.log('SUPABASE_URL:', checks.supabaseUrl ? '✅ Set' : '❌ Missing')
console.log('SUPABASE_CLIENT_SERVICE_KEY:', checks.supabaseServiceKey ? '✅ Set' : '❌ Missing')
console.log('OPENAI_API_KEY:', checks.openaiKey ? '✅ Set' : '❌ Missing')

if (!checks.supabaseServiceKey) {
  console.log('\n❌ CRITICAL: Missing SUPABASE_CLIENT_SERVICE_KEY')
  console.log('Add this to your .env file:')
  console.log('SUPABASE_CLIENT_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Check 2: Tables exist
console.log('\n=== 2. Database Tables ===')

async function checkTables() {
  // Check clothing_comps
  const { error: compsError } = await supabase
    .from('clothing_comps')
    .select('id')
    .limit(1)

  console.log('clothing_comps table:', compsError ? '❌ Does not exist' : '✅ Exists')

  if (compsError) {
    console.log('  Error:', compsError.message)
    console.log('\n  📝 Run SQL from: supabase/SETUP_INSTRUCTIONS.md')
    console.log('  🔗 https://supabase.com/dashboard/project/hqmujfbifgpcyqmpuwil/sql')
    return false
  }

  // Check comp_sections
  const { error: sectionsError } = await supabase
    .from('comp_sections')
    .select('id')
    .limit(1)

  console.log('comp_sections table:', sectionsError ? '❌ Does not exist' : '✅ Exists')

  if (sectionsError) {
    console.log('  Error:', sectionsError.message)
    return false
  }

  return true
}

// Check 3: Data exists
async function checkData() {
  console.log('\n=== 3. Data Status ===')

  const { data: comps, error: compsError } = await supabase
    .from('clothing_comps')
    .select('*')

  if (compsError) {
    console.log('clothing_comps:', '❌ Cannot query')
    return false
  }

  console.log(`clothing_comps: ${comps?.length || 0} records`)

  if ((comps?.length || 0) === 0) {
    console.log('\n  📝 Add test data with:')
    console.log('  python workers/scrapy/add-test-comps.py')
    return false
  }

  const { data: sections, error: sectionsError } = await supabase
    .from('comp_sections')
    .select('*')

  if (sectionsError) {
    console.log('comp_sections:', '❌ Cannot query')
    return false
  }

  console.log(`comp_sections: ${sections?.length || 0} embeddings`)

  if ((sections?.length || 0) === 0) {
    console.log('\n  📝 Generate embeddings with:')
    console.log('  npx tsx workers/scrapy/test-embedding-pipeline.ts')
    return false
  }

  return true
}

// Check 4: Vector function exists
async function checkFunction() {
  console.log('\n=== 4. Vector Search Function ===')

  try {
    // Try to call the function with dummy data
    const { error } = await supabase.rpc('match_comp_sections', {
      query_embedding: new Array(1536).fill(0),
      match_threshold: 0.5,
      match_count: 1
    })

    if (error) {
      if (error.message.includes('function') || error.message.includes('does not exist')) {
        console.log('match_comp_sections():', '❌ Does not exist')
        console.log('\n  📝 Create function from: supabase/SETUP_INSTRUCTIONS.md')
        return false
      }
    }

    console.log('match_comp_sections():', '✅ Exists')
    return true
  } catch (error) {
    console.log('match_comp_sections():', '❌ Error checking')
    return false
  }
}

// Run all checks
async function runChecks() {
  const tablesOk = await checkTables()

  if (!tablesOk) {
    console.log('\n❌ SETUP INCOMPLETE: Tables not created')
    console.log('\n📋 Next Steps:')
    console.log('1. Go to: https://supabase.com/dashboard/project/hqmujfbifgpcyqmpuwil/sql')
    console.log('2. Run ALL SQL from: supabase/SETUP_INSTRUCTIONS.md')
    console.log('3. Run this script again: npx tsx check-setup.ts')
    return
  }

  const dataOk = await checkData()
  const functionOk = await checkFunction()

  console.log('\n=== Summary ===')

  if (tablesOk && dataOk && functionOk) {
    console.log('✅ SETUP COMPLETE!')
    console.log('\nYou can now:')
    console.log('1. Run: npm run dev')
    console.log('2. Open ItemForm')
    console.log('3. Click "Find Comparable Sales"')
    console.log('4. See real comps with similarity scores!')
  } else {
    console.log('⚠️  SETUP INCOMPLETE')
    console.log('\nMissing:')
    if (!tablesOk) console.log('  - Database tables')
    if (!dataOk) console.log('  - Test data / embeddings')
    if (!functionOk) console.log('  - Vector search function')
    console.log('\nSee: QUICKSTART.md for step-by-step guide')
  }
}

runChecks().catch(console.error)
