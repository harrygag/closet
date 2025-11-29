/**
 * Vendoo CSV Import Script for Firebase
 *
 * Run this in the browser console after logging in, or use with ts-node and Firebase Admin SDK
 */

import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
const app = initializeApp({
  projectId: 'closet-da8f2',
});

const db = getFirestore(app);
const auth = getAuth(app);

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

  return values.map(v => v.trim());
}

// Map Vendoo category to app tags
function mapCategoryToTags(category: string): string[] {
  const categoryLower = category.toLowerCase();

  const tags: string[] = [];

  if (categoryLower.includes('hoodie') || categoryLower.includes('sweatshirt')) {
    tags.push('Hoodie');
  }
  if (categoryLower.includes('jersey')) {
    tags.push('Jersey');
  }
  if (categoryLower.includes('polo')) {
    tags.push('polo');
  }
  if (categoryLower.includes('jacket') || categoryLower.includes('pullover') || categoryLower.includes('coat')) {
    tags.push('Pullover/Jackets');
  }
  if (categoryLower.includes('t-shirt') || categoryLower.includes('tshirt') || categoryLower.includes('shirt')) {
    tags.push('T-shirts');
  }
  if (categoryLower.includes('bottom') || categoryLower.includes('pant') || categoryLower.includes('short')) {
    tags.push('Bottoms');
  }

  if (tags.length === 0) {
    tags.push('T-shirts');
  }

  return tags;
}

// Map Vendoo row to Item database schema
function mapVendooRowToItem(row: Record<string, string>, userId: string) {
  const title = row['Title'] || 'Untitled Item';
  const status = row['Status'] === 'Sold' ? 'SOLD' : 'IN_STOCK';
  const tags = mapCategoryToTags(row['Category'] || '');

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

  const listedDate = row['Listed Date'] || null;
  const soldDate = row['Sold Date'] || null;

  const brand = row['Brand'] || '';
  const condition = row['Condition'] || '';
  const description = row['Description'] || '';
  const internalNotes = row['Internal Notes'] || '';
  const sku = row['Sku'] || '';

  let notes = '';
  if (brand) notes += `Brand: ${brand}. `;
  if (condition) notes += `Condition: ${condition}. `;
  if (sku) notes += `SKU: ${sku}. `;
  if (internalNotes) notes += `Notes: ${internalNotes}. `;

  return {
    user_uuid: userId,
    title,
    size: row['Primary Color'] || '',
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
    brand: brand || 'Unknown',
    category: row['Category'] || 'Clothing',
    imported_from: 'vendoo',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

async function importVendooCSV(csvPath: string, userEmail: string) {
  console.log('📋 Vendoo CSV Import Script (Firebase)');
  console.log('================================\n');

  // Step 1: Read CSV file
  console.log(`📂 Reading CSV file: ${csvPath}`);
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  console.log(`✅ Found ${rows.length} items in CSV\n`);

  if (rows.length === 0) {
    console.error('❌ No items found in CSV');
    process.exit(1);
  }

  // Step 2: Get user by email
  console.log(`🔐 Looking up user: ${userEmail}`);
  let targetUserId: string;

  try {
    const userRecord = await auth.getUserByEmail(userEmail);
    targetUserId = userRecord.uid;
    console.log(`✅ Found user: ${userRecord.email} (${targetUserId})\n`);
  } catch (error) {
    console.error(`❌ User not found: ${userEmail}`);
    console.log('Please sign in with this email first, then run the import again.');
    process.exit(1);
  }

  // Step 3: Delete existing items for this user (optional)
  console.log('🗑️  Deleting existing items...');
  const existingItems = await db.collection('Item').where('user_uuid', '==', targetUserId).get();

  const deletePromises: Promise<any>[] = [];
  existingItems.forEach(doc => {
    deletePromises.push(doc.ref.delete());
  });

  await Promise.all(deletePromises);
  console.log(`✅ Deleted ${existingItems.size} existing items\n`);

  // Step 4: Transform and insert items
  console.log('📦 Transforming and inserting items...');
  const items = rows.map(row => mapVendooRowToItem(row, targetUserId));

  // Insert in batches of 500 (Firestore limit)
  const batchSize = 500;
  let successCount = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = db.batch();
    const batchItems = items.slice(i, i + batchSize);

    batchItems.forEach(item => {
      const docRef = db.collection('Item').doc();
      batch.set(docRef, item);
    });

    await batch.commit();
    successCount += batchItems.length;
    console.log(`✅ Inserted batch ${Math.floor(i / batchSize) + 1}: ${batchItems.length} items (total: ${successCount})`);
  }

  // Step 5: Summary
  console.log('\n================================');
  console.log('📊 Import Summary');
  console.log('================================');
  console.log(`✅ Successfully imported: ${successCount} items`);
  console.log(`📈 Total processed: ${rows.length} items`);
  console.log('\n✨ Import complete!');

  // Step 6: Verify
  const verifySnapshot = await db.collection('Item').where('user_uuid', '==', targetUserId).count().get();
  console.log(`\n🔍 Verification: ${verifySnapshot.data().count} items now in database`);
}

// Direct import with known UID
async function importVendooCSVDirect(csvPath: string, userId: string) {
  console.log('📋 Vendoo CSV Import Script (Firebase)');
  console.log('================================\n');

  // Step 1: Read CSV file
  console.log(`📂 Reading CSV file: ${csvPath}`);
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  console.log(`✅ Found ${rows.length} items in CSV\n`);

  if (rows.length === 0) {
    console.error('❌ No items found in CSV');
    process.exit(1);
  }

  // Step 2: Delete existing items for this user (optional)
  console.log('🗑️  Checking existing items...');
  const existingItems = await db.collection('Item').where('user_uuid', '==', userId).get();
  console.log(`Found ${existingItems.size} existing items (keeping them)\n`);

  // Step 3: Transform and insert items
  console.log('📦 Transforming and inserting items...');
  const items = rows.map(row => mapVendooRowToItem(row, userId));

  // Insert in batches of 500 (Firestore limit)
  const batchSize = 500;
  let successCount = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = db.batch();
    const batchItems = items.slice(i, i + batchSize);

    batchItems.forEach(item => {
      const docRef = db.collection('Item').doc();
      batch.set(docRef, item);
    });

    await batch.commit();
    successCount += batchItems.length;
    console.log(`✅ Inserted batch ${Math.floor(i / batchSize) + 1}: ${batchItems.length} items (total: ${successCount})`);
  }

  // Step 4: Summary
  console.log('\n================================');
  console.log('📊 Import Summary');
  console.log('================================');
  console.log(`✅ Successfully imported: ${successCount} items`);
  console.log(`📈 Total processed: ${rows.length} items`);
  console.log('\n✨ Import complete!');

  // Step 5: Verify
  const verifySnapshot = await db.collection('Item').where('user_uuid', '==', userId).count().get();
  console.log(`\n🔍 Verification: ${verifySnapshot.data().count} items now in database`);
}

// Main execution
const csvPath = process.argv[2] || 'C:\\Users\\mickk\\Downloads\\vendoo-full-2025-11-26.csv';
const userId = process.argv[3] || '5wcAqKZyNNhlUIALqYWv0FSeZyN2'; // Harrison Kennedy's UID

importVendooCSVDirect(csvPath, userId)
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
