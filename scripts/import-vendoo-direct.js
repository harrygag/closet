/**
 * Vendoo CSV Direct Import - Uses Supabase service role with RLS bypass
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Create admin client that bypasses RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Parse CSV
function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values.map(v => v.trim());
}

function mapCategoryToTags(category) {
  const categoryLower = category.toLowerCase();
  const tags = [];
  
  if (categoryLower.includes('hoodie') || categoryLower.includes('sweatshirt')) tags.push('Hoodie');
  if (categoryLower.includes('jersey')) tags.push('Jersey');
  if (categoryLower.includes('polo')) tags.push('polo');
  if (categoryLower.includes('jacket') || categoryLower.includes('pullover') || categoryLower.includes('coat') || categoryLower.includes('vest')) tags.push('Pullover/Jackets');
  if (categoryLower.includes('t-shirt') || categoryLower.includes('tshirt') || categoryLower.includes('shirt')) tags.push('T-shirts');
  if (categoryLower.includes('bottom') || categoryLower.includes('pant') || categoryLower.includes('short')) tags.push('Bottoms');

  if (tags.length === 0) tags.push('T-shirts');
  return tags;
}

function extractSizeFromTitle(title) {
  const sizePatterns = [
    /\bsize\s+([a-z0-9]+)\b/i,
    /\b(small|medium|large|x-?large|xx-?large|xxx-?large)\b/i,
    /\b(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl)\b/i,
    /\bmens?\s+([a-z0-9]+)\b/i,
    /\b(\d+x?\d*)\b/,
  ];

  for (const pattern of sizePatterns) {
    const match = title.match(pattern);
    if (match) return match[1].toUpperCase();
  }

  return 'M';
}

function mapVendooRowToItem(row, userId) {
  const title = (row['Title'] || 'Untitled Item').replace(/'/g, "''");
  const status = row['Status'] === 'Sold' ? 'SOLD' : 'IN_STOCK';
  const tags = mapCategoryToTags(row['Category'] || '');
  const size = extractSizeFromTitle(title);
  
  const priceStr = (row['Price'] || '0').replace(/[^0-9.]/g, '');
  const price = parseFloat(priceStr) || 0;
  const priceCents = Math.round(price * 100);
  
  const costStr = (row['Cost of Goods'] || '0').replace(/[^0-9.]/g, '');
  const cost = parseFloat(costStr) || 0;
  const costCents = Math.round(cost * 100);
  
  const soldPriceStr = (row['Price Sold'] || '0').replace(/[^0-9.]/g, '');
  const soldPrice = parseFloat(soldPriceStr) || 0;
  const soldPriceCents = soldPrice > 0 ? Math.round(soldPrice * 100) : null;

  const imageUrl = row['Images'] || '';
  const imageUrls = imageUrl ? [imageUrl] : [];

  const listedDate = row['Listed Date'] || new Date().toISOString().split('T')[0];
  const soldDate = row['Sold Date'] || null;
  
  const brand = (row['Brand'] || 'Unknown').replace(/'/g, "''");
  const condition = (row['Condition'] || '').replace(/'/g, "''");
  const description = (row['Description'] || '').replace(/'/g, "''").substring(0, 500);
  const internalNotes = (row['Internal Notes'] || '').replace(/'/g, "''");
  const sku = (row['Sku'] || '').replace(/'/g, "''");
  const primaryColor = (row['Primary Color'] || '').replace(/'/g, "''");
  const secondaryColor = (row['Secondary Color'] || '').replace(/'/g, "''");
  const category = (row['Category'] || 'Clothing').replace(/'/g, "''");
  
  let notes = '';
  if (brand && brand !== 'Unknown') notes += `Brand: ${brand}. `;
  if (condition) notes += `Condition: ${condition}. `;
  if (primaryColor) notes += `Color: ${primaryColor}`;
  if (secondaryColor) notes += ` / ${secondaryColor}`;
  if (primaryColor || secondaryColor) notes += '. ';
  if (sku) notes += `SKU: ${sku}. `;
  if (internalNotes) notes += internalNotes;
  
  const platforms = row['Listing Platforms'] || '';
  const soldPlatform = row['Sold Platform'] || '';

  return {
    user_uuid: userId,
    title,
    size,
    status,
    normalizedTags: tags,
    imageUrls,
    manualPriceCents: priceCents > 0 ? priceCents : null,
    purchasePriceCents: costCents > 0 ? costCents : null,
    soldPriceCents: status === 'SOLD' ? soldPriceCents : null,
    soldDate: status === 'SOLD' && soldDate ? soldDate : null,
    purchaseDate: listedDate,
    notes: notes.trim(),
    conditionNotes: description,
    brand,
    category,
    imported_from: 'csv',
    ebay_imported_at: new Date().toISOString(),
  };
}

async function main() {
  console.log('📋 Vendoo CSV Direct Import');
  console.log('================================\n');

  const csvPath = process.argv[2] || 'vendoo-full-2025-11-17.csv';
  console.log(`📂 Reading: ${csvPath}`);
  
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  console.log(`✅ Found ${rows.length} items\n`);

  console.log('🔐 Getting user...');
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const userId = users[0].id;
  console.log(`✅ User: ${users[0].email}\n`);

  console.log('🗑️  Deleting old items...');
  await supabase.from('Item').delete().eq('user_uuid', userId);
  console.log('✅ Deleted\n');

  console.log('📦 Importing items...');
  const items = rows.map(row => mapVendooRowToItem(row, userId));
  
  let successCount = 0;
  const batchSize = 50;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const { data, error } = await supabase.from('Item').insert(batch).select();

    if (error) {
      console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
    } else {
      successCount += data.length;
      console.log(`✅ Batch ${Math.floor(i / batchSize) + 1}: ${data.length} items`);
    }
  }

  console.log('\n================================');
  console.log(`✅ Imported: ${successCount} items`);
  console.log('✨ Done!');
}

main().catch(console.error);


