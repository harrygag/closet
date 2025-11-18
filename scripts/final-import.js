#!/usr/bin/env node
/**
 * Final CSV Import - Execute all batch SQL files
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Admin client bypassing RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function executeBatch(batchNum) {
  const filename = `scripts/simple-batch-${batchNum}.sql`;
  
  if (!fs.existsSync(filename)) {
    console.log(`⚠️  Skip batch ${batchNum} (file not found)`);
    return 0;
  }
  
  const sql = fs.readFileSync(filename, 'utf-8');
  
  // Extract VALUES and execute
  const match = sql.match(/VALUES\n([\s\S]+);/);
  if (!match) {
    console.error(`❌ Batch ${batchNum}: Could not parse SQL`);
    return 0;
  }
  
  // Execute the full INSERT statement
  const { error } = await supabase.rpc('exec_sql', { query: sql });
  
  if (error) {
    console.error(`❌ Batch ${batchNum} error:`, error.message);
    return 0;
  }
  
  // Count items in batch (count commas + 1)
  const itemCount = (match[1].match(/\),\n\(/g) || []).length + 1;
  console.log(`✅ Batch ${batchNum}: ${itemCount} items`);
  return itemCount;
}

async function main() {
  console.log('📋 Final CSV Import - Executing All Batches');
  console.log('==========================================\n');
  
  let totalImported = 0;
  
  // Execute batches 1-19 (batch 1 items 1-10 already done, so start from 2)
  for (let i = 2; i <= 19; i++) {
    const count = await executeBatch(i);
    totalImported += count;
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log('\n==========================================');
  console.log(`✅ Total imported: ${totalImported} items`);
  console.log('✨ Done!');
  
  // Verify final count
  const { count: finalCount } = await supabase
    .from('Item')
    .select('*', { count: 'exact', head: true })
    .eq('user_uuid', '1836a66f-5c39-4fb5-9a88-4ec14c93aa97');
  
  console.log(`\n🔍 Total items in database: ${finalCount}`);
}

main().catch(console.error);


