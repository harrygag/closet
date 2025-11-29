/**
 * Vendoo CSV Import Script for Firebase
 *
 * Imports Vendoo CSV data to Firestore items collection
 * User: Harrison Kennedy (uid: 5wcAqKZyNNhlUIALqYWv0FSeZyN2)
 *
 * Run: npx tsx scripts/import-vendoo.ts
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

// Initialize Firebase Admin
const app = initializeApp({
  projectId: 'closet-da8f2',
});

const db = getFirestore(app);

// CSV parsing function
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
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

  return values.map(v => v.trim().replace(/^"/, '').replace(/"$/, ''));
}

// Parse price string to number
function parsePrice(priceStr: string): number {
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

// Parse date string to ISO format (handles various date formats)
function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

// Generate barcode/SKU if missing
function generateSKU(): string {
  return randomUUID();
}

// Map Vendoo row to Firestore item document
function mapVendooRowToItem(row: Record<string, string>, userId: string) {
  const title = row['Title'] || 'Untitled Item';
  const description = row['Description'] || '';
  const brand = row['Brand'] || '';
  const condition = row['Condition'] || '';
  const color = row['Primary Color'] || '';
  const sku = row['Sku'] ? row['Sku'].trim() : generateSKU();
  const category = row['Category'] || '';

  // Parse price
  const price = parsePrice(row['Price']);

  // Parse status
  const vendooStatus = row['Status'] || '';
  const status = vendooStatus.toLowerCase() === 'sold' ? 'sold' : 'active';

  // Parse dates
  const listed_date = parseDate(row['Listed Date']);
  const sold_date = parseDate(row['Sold Date']);

  // Parse images (could be comma-separated or single URL)
  const imageStr = row['Images'] || '';
  const images = imageStr.split(',').map(img => img.trim()).filter(img => img);

  // Parse listing platforms
  const listing_platforms = row['Listing Platforms'] || '';

  // Parse quantity
  const quantityStr = row['Quantity Left'] || '1';
  const quantity = parseInt(quantityStr) || 1;

  // Parse cost
  const cost = parsePrice(row['Cost of Goods']);

  // Current timestamp
  const now = Timestamp.now();

  return {
    user_id: userId,
    title,
    description,
    brand,
    condition,
    color,
    sku,
    category,
    price,
    status,
    listed_date,
    sold_date,
    images,
    ebay_url: '',
    poshmark_url: '',
    depop_url: '',
    listing_platforms,
    quantity,
    cost,
    created_at: now,
    updated_at: now,
  };
}

async function importVendooCSV(csvPath: string, userId: string) {
  console.log('📋 Vendoo CSV Import Script for Firebase');
  console.log('=========================================\n');

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

  // Show sample of first row for verification
  console.log('📝 Sample data from first row:');
  console.log(`   Title: ${rows[0]['Title']}`);
  console.log(`   Brand: ${rows[0]['Brand']}`);
  console.log(`   Price: ${rows[0]['Price']}`);
  console.log(`   Status: ${rows[0]['Status']}\n`);

  // Step 2: Transform items
  console.log('🔄 Transforming items...');
  const items = rows.map(row => mapVendooRowToItem(row, userId));
  console.log(`✅ Transformed ${items.length} items\n`);

  // Step 3: Import to Firestore
  console.log('📦 Importing to Firestore...');
  console.log(`   Collection: items`);
  console.log(`   User ID: ${userId}\n`);

  // Insert in batches of 500 (Firestore limit)
  const batchSize = 500;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = db.batch();
    const batchItems = items.slice(i, i + batchSize);

    batchItems.forEach(item => {
      const docRef = db.collection('items').doc();
      batch.set(docRef, item);
    });

    try {
      await batch.commit();
      successCount += batchItems.length;
      console.log(`✅ Batch ${Math.floor(i / batchSize) + 1}: Imported ${batchItems.length} items (total: ${successCount}/${items.length})`);
    } catch (error) {
      errorCount += batchItems.length;
      console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, error);
    }
  }

  // Step 4: Summary
  console.log('\n=========================================');
  console.log('📊 Import Summary');
  console.log('=========================================');
  console.log(`✅ Successfully imported: ${successCount} items`);
  if (errorCount > 0) {
    console.log(`❌ Failed to import: ${errorCount} items`);
  }
  console.log(`📈 Total processed: ${rows.length} items`);
  console.log('\n✨ Import complete!');

  // Step 5: Verify count
  console.log('\n🔍 Verifying import...');
  try {
    const verifySnapshot = await db
      .collection('items')
      .where('user_id', '==', userId)
      .count()
      .get();
    console.log(`✅ Found ${verifySnapshot.data().count} items in database for user ${userId}`);
  } catch (error) {
    console.warn('⚠️  Could not verify count:', error);
  }
}

// Main execution
const csvPath = process.argv[2] || 'C:\\Users\\mickk\\Downloads\\vendoo-full-2025-11-26.csv';
const userId = process.argv[3] || '5wcAqKZyNNhlUIALqYWv0FSeZyN2';

console.log('Starting import...');
console.log(`CSV Path: ${csvPath}`);
console.log(`User ID: ${userId}\n`);

importVendooCSV(csvPath, userId)
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
