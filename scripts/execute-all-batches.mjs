/**
 * Execute all simple batch SQL files via Supabase MCP
 * Run this with: node scripts/execute-all-batches.mjs
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

async function executeBatch(batchNum) {
  const filename = `scripts/simple-batch-${batchNum}.sql`;
  
  if (!fs.existsSync(filename)) {
    console.log(`⚠️  Skip ${filename} (not found)`);
    return false;
  }
  
  const sql = fs.readFileSync(filename, 'utf-8');
  
  // Use Supabase CLI if available, otherwise print for manual execution
  console.log(`\n📄 Batch ${batchNum}:`);
  console.log(`   File: ${filename}`);
  console.log(`   SQL length: ${sql.length} chars`);
  
  // For now, just print - user can copy-paste to Supabase SQL Editor
  console.log(`\n---SQL START---`);
  console.log(sql);
  console.log(`---SQL END---\n`);
  
  return true;
}

async function main() {
  console.log('📋 Executing All Simple Batch Files');
  console.log('====================================\n');
  
  console.log('⚠️  Note: These SQLs need to be executed via Supabase SQL Editor');
  console.log('    or using: supabase db execute --file scripts/simple-batch-X.sql\n');
  
  // Start from batch 2 (batch 1 was partially executed)
  for (let i = 2; i <= 19; i++) {
    await executeBatch(i);
    
    // Pause between batches
    if (i < 19) {
      console.log(`\n⏸️  Press Enter to continue to next batch...`);
      await new Promise(resolve => {
        process.stdin.once('data', () => resolve());
      });
    }
  }
  
  console.log('\n✨ All batches processed!');
  console.log('\n📊 Check your database: SELECT COUNT(*) FROM "Item";');
}

main().catch(console.error);


