/**
 * Setup Barcode System - Run this ONCE to:
 * 1. Add barcode column to Item table if it doesn't exist
 * 2. Generate barcodes for all existing items
 * 
 * Usage: node scripts/setup-barcodes.js
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Generate barcode in format: INV-YYYYMMDD-XXXXX
 */
async function generateBarcode(userId) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
  
  // Get max number for today
  const prefix = `INV-${dateStr}-`;
  const { data: existingBarcodes } = await supabase
    .from('Item')
    .select('barcode')
    .like('barcode', `${prefix}%`)
    .order('barcode', { ascending: false })
    .limit(1);
  
  let nextNumber = 1;
  if (existingBarcodes && existingBarcodes.length > 0) {
    const lastBarcode = existingBarcodes[0].barcode;
    const lastNumber = parseInt(lastBarcode.split('-')[2]);
    nextNumber = lastNumber + 1;
  }
  
  const numberStr = nextNumber.toString().padStart(5, '0');
  return `${prefix}${numberStr}`;
}

/**
 * Check if barcode column exists
 */
async function checkBarcodeColumn() {
  try {
    const { error } = await supabase
      .from('Item')
      .select('barcode')
      .limit(1);
    
    return !error;
  } catch (err) {
    return false;
  }
}

/**
 * Add barcode column if it doesn't exist
 */
async function addBarcodeColumn() {
  console.log('🔧 Checking barcode column...');
  
  const exists = await checkBarcodeColumn();
  
  if (exists) {
    console.log('✅ Barcode column already exists');
    return true;
  }
  
  console.log('⚠️  Barcode column missing!');
  console.log('📝 You need to run this SQL in Supabase SQL Editor:');
  console.log('');
  console.log('ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS barcode TEXT;');
  console.log('CREATE UNIQUE INDEX IF NOT EXISTS idx_item_barcode_unique ON "Item"(barcode) WHERE barcode IS NOT NULL;');
  console.log('');
  console.log('Or run: npx supabase db push');
  console.log('');
  
  return false;
}

/**
 * Generate barcodes for all items that don't have one
 */
async function backfillBarcodes() {
  console.log('\n🏷️  Starting barcode backfill...');
  
  // Get all items without barcodes
  const { data: items, error } = await supabase
    .from('Item')
    .select('id, title, barcode, user_uuid')
    .or('barcode.is.null,barcode.eq.')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('❌ Failed to fetch items:', error.message);
    return;
  }
  
  if (!items || items.length === 0) {
    console.log('✅ All items already have barcodes!');
    return;
  }
  
  console.log(`📦 Found ${items.length} items without barcodes`);
  
  let updated = 0;
  let failed = 0;
  
  for (const item of items) {
    try {
      const barcode = await generateBarcode(item.user_uuid);
      
      const { error: updateError } = await supabase
        .from('Item')
        .update({ barcode })
        .eq('id', item.id);
      
      if (updateError) {
        console.error(`  ❌ Failed to update ${item.title}: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✅ ${item.title.substring(0, 40)} -> ${barcode}`);
        updated++;
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`  ❌ Error processing ${item.title}:`, err.message);
      failed++;
    }
  }
  
  console.log(`\n📊 Summary: ${updated} updated, ${failed} failed`);
  
  if (updated > 0) {
    console.log('✅ Barcode backfill complete!');
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Barcode System Setup\n');
  
  // Step 1: Check/add column
  const columnExists = await addBarcodeColumn();
  
  if (!columnExists) {
    console.log('⚠️  Please add the barcode column first, then re-run this script.');
    process.exit(1);
  }
  
  // Step 2: Backfill barcodes
  await backfillBarcodes();
  
  console.log('\n✅ Setup complete! Your items now have barcodes.');
  console.log('   Refresh your app to see them.');
}

main().catch(err => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});

