// Generate barcodes for all items without them - RUN THIS NOW
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hqmujfbifgpcyqmpuwil.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbXVqZmJpZmdwY3lxbXB1d2lsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDQ2NjQ3NiwiZXhwIjoyMDc2MDQyNDc2fQ.z-HPpEXneiERG3GzLqNcHRHu9L3Y-GcxKzRdsUBYI1o'
);

async function generateBarcode() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `INV-${dateStr}-`;
  
  const { data } = await supabase
    .from('Item')
    .select('barcode')
    .like('barcode', `${prefix}%`)
    .order('barcode', { ascending: false })
    .limit(1);
  
  let nextNumber = 1;
  if (data && data.length > 0 && data[0].barcode) {
    const lastNumber = parseInt(data[0].barcode.split('-')[2]);
    nextNumber = lastNumber + 1;
  }
  
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
}

async function fixAllBarcodes() {
  console.log('🔍 Finding items without barcodes...');
  
  const { data: items, error } = await supabase
    .from('Item')
    .select('id, title')
    .is('barcode', null);
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log(`📦 Found ${items.length} items without barcodes\n`);
  
  let fixed = 0;
  for (const item of items) {
    const barcode = await generateBarcode();
    
    const { error: updateError } = await supabase
      .from('Item')
      .update({ barcode })
      .eq('id', item.id);
    
    if (updateError) {
      console.error(`❌ Failed: ${item.title}`);
    } else {
      console.log(`✅ ${item.title.substring(0, 50)} → ${barcode}`);
      fixed++;
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n✅ DONE! Fixed ${fixed}/${items.length} items`);
}

fixAllBarcodes();

