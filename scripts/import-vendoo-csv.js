/**
 * Vendoo CSV Import Script (JavaScript version)
 * 
 * This script imports items from a Vendoo CSV export and maps them to the Item schema.
 * It will DELETE all existing items and replace them with the CSV data.
 * 
 * Usage: node scripts/import-vendoo-csv.js [csv-path] [user-id]
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Supabase configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://hqmujfbifgpcyqmpuwil.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY environment variable is required');
  console.error('   Add it to your .env file or pass it as an environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// CSV parsing function
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

// Map Vendoo category to app tags
function mapCategoryToTags(category) {
  const categoryLower = category.toLowerCase();
  
  const tags = [];
  
  if (categoryLower.includes('hoodie') || categoryLower.includes('sweatshirt')) {
    tags.push('Hoodie');
  }
  if (categoryLower.includes('jersey')) {
    tags.push('Jersey');
  }
  if (categoryLower.includes('polo')) {
    tags.push('polo');
  }
  if (categoryLower.includes('jacket') || categoryLower.includes('pullover') || categoryLower.includes('coat') || categoryLower.includes('vest')) {
    tags.push('Pullover/Jackets');
  }
  if (categoryLower.includes('t-shirt') || categoryLower.includes('tshirt') || categoryLower.includes('shirt')) {
    tags.push('T-shirts');
  }
  if (categoryLower.includes('bottom') || categoryLower.includes('pant') || categoryLower.includes('short')) {
    tags.push('Bottoms');
  }

  // Default to T-shirts if no match
  if (tags.length === 0) {
    tags.push('T-shirts');
  }

  return tags;
}

// Parse marketplace platforms from listing
function parseMarketplacePlatforms(platforms) {
  const platformsLower = platforms.toLowerCase();
  return {
    ebay: platformsLower.includes('ebay'),
    poshmark: platformsLower.includes('poshmark'),
    mercari: platformsLower.includes('mercari'),
    depop: platformsLower.includes('depop'),
    grailed: platformsLower.includes('grailed'),
  };
}

// Extract size from title (common patterns)
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
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return 'M'; // Default size
}

// Map Vendoo row to Item database schema
function mapVendooRowToItem(row, userId) {
  const title = row['Title'] || 'Untitled Item';
  const status = row['Status'] === 'Sold' ? 'SOLD' : 'IN_STOCK';
  const tags = mapCategoryToTags(row['Category'] || '');
  const size = extractSizeFromTitle(title);
  
  // Parse price - remove any non-numeric characters except decimal point
  const priceStr = (row['Price'] || '0').replace(/[^0-9.]/g, '');
  const price = parseFloat(priceStr) || 0;
  const priceCents = Math.round(price * 100);
  
  const costStr = (row['Cost of Goods'] || '0').replace(/[^0-9.]/g, '');
  const cost = parseFloat(costStr) || 0;
  const costCents = Math.round(cost * 100);
  
  const soldPriceStr = (row['Price Sold'] || '0').replace(/[^0-9.]/g, '');
  const soldPrice = parseFloat(soldPriceStr) || 0;
  const soldPriceCents = soldPrice > 0 ? Math.round(soldPrice * 100) : null;

  // Image URL
  const imageUrl = row['Images'] || '';
  const imageUrls = imageUrl ? [imageUrl] : [];

  // Parse dates
  const listedDate = row['Listed Date'] || new Date().toISOString().split('T')[0];
  const soldDate = row['Sold Date'] || null;
  
  // Build notes with all relevant metadata
  const brand = row['Brand'] || '';
  const condition = row['Condition'] || '';
  const description = row['Description'] || '';
  const internalNotes = row['Internal Notes'] || '';
  const sku = row['Sku'] || '';
  const primaryColor = row['Primary Color'] || '';
  const secondaryColor = row['Secondary Color'] || '';
  
  let notes = '';
  if (brand) notes += `Brand: ${brand}. `;
  if (condition) notes += `Condition: ${condition}. `;
  if (primaryColor) notes += `Color: ${primaryColor}`;
  if (secondaryColor) notes += ` / ${secondaryColor}`;
  if (primaryColor || secondaryColor) notes += '. ';
  if (sku) notes += `SKU: ${sku}. `;
  if (internalNotes) notes += internalNotes;
  
  // Marketplace links
  const platforms = parseMarketplacePlatforms(row['Listing Platforms'] || '');
  const soldPlatform = row['Sold Platform'] || '';

  // Extract eBay item ID from internal notes or SKU if available
  let ebayItemId = null;
  if (platforms.ebay && sku) {
    ebayItemId = sku;
  }

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
    conditionNotes: description.substring(0, 500), // Limit description length
    brand: brand || 'Unknown',
    category: row['Category'] || 'Clothing',
    imported_from: 'csv',
    ebay_item_id: ebayItemId,
    ebay_imported_at: new Date().toISOString(),
  };
}

async function importVendooCSV(csvPath, userId) {
  console.log('📋 Vendoo CSV Import Script');
  console.log('================================\n');

  // Step 1: Read CSV file
  console.log(`📂 Reading CSV file: ${csvPath}`);
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  console.log(`✅ Found ${rows.length} items in CSV\n`);

  if (rows.length === 0) {
    console.error('❌ No items found in CSV');
    process.exit(1);
  }

  // Show first few headers for verification
  if (rows.length > 0) {
    console.log('📋 CSV Headers detected:');
    console.log(Object.keys(rows[0]).slice(0, 10).join(', ') + '...\n');
  }

  // Step 2: Get user authentication
  console.log('🔐 Verifying user...');
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
  
  if (usersError) {
    console.error('❌ Error fetching users:', usersError.message);
    process.exit(1);
  }

  let targetUserId = userId;
  if (!targetUserId && users && users.length > 0) {
    targetUserId = users[0].id;
    console.log(`✅ Using first user: ${users[0].email} (${targetUserId})\n`);
  } else if (targetUserId) {
    console.log(`✅ Using specified user: ${targetUserId}\n`);
  } else {
    console.error('❌ No users found in database');
    process.exit(1);
  }

  // Step 3: Delete existing items
  console.log('🗑️  Deleting existing items...');
  const { error: deleteError, count: deleteCount } = await supabase
    .from('Item')
    .delete()
    .eq('user_uuid', targetUserId);

  if (deleteError) {
    console.error('❌ Error deleting items:', deleteError.message);
    process.exit(1);
  }
  console.log(`✅ Deleted all existing items\n`);

  // Step 4: Transform and insert items
  console.log('📦 Transforming and inserting items...');
  const items = rows.map(row => mapVendooRowToItem(row, targetUserId));
  
  // Insert in batches of 50
  const batchSize = 50;
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('Item')
      .insert(batch)
      .select();

    if (error) {
      console.error(`❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      errorCount += batch.length;
      errors.push({ batch: Math.floor(i / batchSize) + 1, error: error.message });
    } else {
      successCount += data.length;
      console.log(`✅ Inserted batch ${Math.floor(i / batchSize) + 1}: ${data.length} items`);
    }
  }

  // Step 5: Summary
  console.log('\n================================');
  console.log('📊 Import Summary');
  console.log('================================');
  console.log(`✅ Successfully imported: ${successCount} items`);
  if (errorCount > 0) {
    console.log(`❌ Failed to import: ${errorCount} items`);
    console.log('\nErrors:');
    errors.forEach(e => {
      console.log(`   Batch ${e.batch}: ${e.error}`);
    });
  }
  console.log(`📈 Total processed: ${rows.length} items`);

  // Step 6: Verify
  const { count, error: countError } = await supabase
    .from('Item')
    .select('*', { count: 'exact', head: true })
    .eq('user_uuid', targetUserId);

  if (!countError) {
    console.log(`\n🔍 Verification: ${count} items now in database`);
  }

  console.log('\n✨ Import complete!');
}

// Main execution
const csvPath = process.argv[2] || path.join(process.cwd(), 'vendoo-full-2025-11-17.csv');
const userId = process.argv[3] || '';

importVendooCSV(csvPath, userId)
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    console.error(error);
    process.exit(1);
  });

