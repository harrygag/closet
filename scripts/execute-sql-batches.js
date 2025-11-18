/**
 * Execute SQL batch files using raw SQL with Supabase
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'public' },
  auth: { autoRefreshToken: false, persistSession: false }
});

async function executeSQLFile(filePath) {
  console.log(`\n📄 Executing: ${filePath}`);
  
  const sql = fs.readFileSync(filePath, 'utf-8');
  
  // Use rpc to execute raw SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
  
  console.log(`✅ Success`);
  return true;
}

async function main() {
  console.log('📋 Executing SQL Batches');
  console.log('================================');
  
  // Execute all batches
  for (let i = 1; i <= 10; i++) {
    const filePath = `scripts/vendoo-import-batch-${i}.sql`;
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Skipping missing file: ${filePath}`);
      continue;
    }
    
    const success = await executeSQLFile(filePath);
    
    if (!success && i === 1) {
      console.error('\n❌ Failed on first batch - stopping');
      break;
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n================================');
  console.log('✨ Done!');
  
  // Verify count
  const { count } = await supabase
    .from('Item')
    .select('*', { count: 'exact', head: true })
    .eq('user_uuid', '1836a66f-5c39-4fb5-9a88-4ec14c93aa97');
  
  console.log(`\n🔍 Total items in database: ${count}`);
}

main().catch(console.error);


