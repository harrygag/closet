/**
 * Firestore Data Fix Script
 *
 * Fixes:
 * 1. polo -> Polo tag case sensitivity
 * 2. Adds barcodes to items missing them
 * 3. Removes duplicate items
 *
 * Run: npx tsx scripts/fix-firestore-data.ts
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin
const app = initializeApp({
  projectId: 'closet-da8f2',
});

const db = getFirestore(app);

// Target user ID
const TARGET_USER_ID = '5wcAqKZyNNhlUIALqYWv0FSeZyN2';

// Valid tags with correct casing
const VALID_TAGS = ['Hoodie', 'Jersey', 'Polo', 'Pullover/Jackets', 'T-shirts', 'Bottoms'];

// Tag normalization map
const TAG_NORMALIZATION: Record<string, string> = {
  'polo': 'Polo',
  'Polo': 'Polo',
  'hoodie': 'Hoodie',
  'Hoodie': 'Hoodie',
  'jersey': 'Jersey',
  'Jersey': 'Jersey',
  't-shirts': 'T-shirts',
  'T-shirts': 'T-shirts',
  'tshirts': 'T-shirts',
  'bottoms': 'Bottoms',
  'Bottoms': 'Bottoms',
  'pullover/jackets': 'Pullover/Jackets',
  'Pullover/Jackets': 'Pullover/Jackets',
  'pullover': 'Pullover/Jackets',
  'jackets': 'Pullover/Jackets',
  // Invalid tags that need replacement
  'eBay Import': 'NEEDS_RECALC',
  'ebay': 'NEEDS_RECALC',
  'eBay': 'NEEDS_RECALC',
};

// Generate barcode
function generateBarcode(userId: string, index: number): string {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const userPrefix = userId.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '0');
  const numberStr = index.toString().padStart(5, '0');
  return `INV-${dateStr}-${userPrefix}-${numberStr}`;
}

// Normalize title for duplicate detection
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

// Map title to correct tag
function mapTitleToTag(title: string): string {
  const titleLower = title.toLowerCase();

  // JERSEY
  if (titleLower.includes('jersey')) return 'Jersey';

  // HOODIE
  if (titleLower.includes('hoodie') || titleLower.includes('hoody') ||
      (titleLower.includes('sweatshirt') && !titleLower.includes('crewneck'))) {
    return 'Hoodie';
  }

  // POLO
  const isPoloShirt = (
    (titleLower.includes('polo') && titleLower.includes('shirt')) ||
    (titleLower.includes('polo') && !titleLower.includes('ralph lauren') && !titleLower.includes('pullover')) ||
    (titleLower.includes('lacoste') && !titleLower.includes('jacket'))
  );
  if (isPoloShirt) return 'Polo';

  // JACKETS/PULLOVERS
  if (titleLower.includes('jacket') || titleLower.includes('windbreaker') ||
      titleLower.includes('bomber') || titleLower.includes('coat') ||
      titleLower.includes('1/4 zip') || titleLower.includes('quarter zip') ||
      titleLower.includes('quarter-zip') || titleLower.includes('fleece') ||
      (titleLower.includes('pullover') && !titleLower.includes('hoodie')) ||
      titleLower.includes('crewneck') || titleLower.includes('sweater')) {
    return 'Pullover/Jackets';
  }

  // BOTTOMS
  if (titleLower.includes('pant') || titleLower.includes('short') ||
      titleLower.includes('jeans') || titleLower.includes('trouser') ||
      titleLower.includes('bottom')) {
    return 'Bottoms';
  }

  // T-SHIRTS
  if (titleLower.includes('t-shirt') || titleLower.includes('tshirt') ||
      titleLower.includes(' tee ') || titleLower.includes(' tee') ||
      (titleLower.includes('shirt') && !titleLower.includes('polo'))) {
    return 'T-shirts';
  }

  return 'T-shirts'; // Default
}

async function fixFirestoreData() {
  console.log('='.repeat(60));
  console.log('FIRESTORE DATA FIX SCRIPT');
  console.log('='.repeat(60));
  console.log('');

  // Step 1: Fetch all items for the user
  console.log('Step 1: Fetching all items...');
  const snapshot = await db.collection('Item')
    .where('user_uuid', '==', TARGET_USER_ID)
    .get();

  console.log(`Found ${snapshot.size} items\n`);

  const items = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Step 2: Find and remove duplicates
  console.log('Step 2: Finding duplicates...');
  const seen = new Map<string, { id: string; title: string }>();
  const duplicates: { id: string; title: string; reason: string }[] = [];

  for (const item of items) {
    const title = (item as any).title || '';
    const normalizedKey = normalizeTitle(title);

    if (seen.has(normalizedKey)) {
      const original = seen.get(normalizedKey)!;
      duplicates.push({
        id: item.id,
        title: title,
        reason: `Duplicate of "${original.title}" (${original.id})`
      });
    } else {
      seen.set(normalizedKey, { id: item.id, title: title });
    }
  }

  console.log(`Found ${duplicates.length} duplicates to remove:\n`);
  duplicates.slice(0, 10).forEach(dup => {
    console.log(`  - "${dup.title}" (${dup.id})`);
  });
  if (duplicates.length > 10) {
    console.log(`  ... and ${duplicates.length - 10} more`);
  }
  console.log('');

  // Step 3: Calculate fixes needed
  console.log('Step 3: Calculating fixes needed...');

  let tagFixes = 0;
  let barcodeFixes = 0;
  let categoryFixes = 0;

  const uniqueItems = items.filter(item => !duplicates.some(d => d.id === item.id));

  for (const item of uniqueItems) {
    const data = item as any;
    const tags = data.normalizedTags || [];

    // Check if tags need fixing (polo -> Polo)
    if (tags.some((t: string) => t === 'polo')) {
      tagFixes++;
    }

    // Check if barcode is missing
    if (!data.barcode) {
      barcodeFixes++;
    }

    // Check if category needs recalculating
    const correctTag = mapTitleToTag(data.title || '');
    if (tags.length === 0 || (tags[0] !== correctTag && !VALID_TAGS.includes(tags[0]))) {
      categoryFixes++;
    }
  }

  console.log(`  Tag fixes needed (polo -> Polo): ${tagFixes}`);
  console.log(`  Barcode fixes needed: ${barcodeFixes}`);
  console.log(`  Category fixes needed: ${categoryFixes}`);
  console.log('');

  // Step 4: Apply fixes
  console.log('Step 4: Applying fixes...');

  // Delete duplicates
  console.log(`  Deleting ${duplicates.length} duplicates...`);
  for (const dup of duplicates) {
    await db.collection('Item').doc(dup.id).delete();
  }
  console.log(`  Deleted ${duplicates.length} duplicates`);

  // Fix tags, barcodes, and categories
  let barcodeIndex = 1;
  let fixedCount = 0;

  for (const item of uniqueItems) {
    const data = item as any;
    const updates: Record<string, any> = {};
    let needsUpdate = false;

    // Fix tags
    let tags = data.normalizedTags || [];
    let fixedTags = tags.map((t: string) => TAG_NORMALIZATION[t] || t);

    // Replace any NEEDS_RECALC or invalid tags with calculated tag from title
    const correctTag = mapTitleToTag(data.title || '');
    fixedTags = fixedTags.map((t: string) => {
      if (t === 'NEEDS_RECALC' || !VALID_TAGS.includes(t)) {
        return correctTag;
      }
      return t;
    });

    // If no valid tags or empty, set the correct tag
    if (fixedTags.length === 0 || !fixedTags.some((t: string) => VALID_TAGS.includes(t))) {
      fixedTags = [correctTag];
    }

    if (JSON.stringify(tags) !== JSON.stringify(fixedTags)) {
      updates.normalizedTags = fixedTags;
      needsUpdate = true;
    }

    // Fix missing barcode
    if (!data.barcode) {
      updates.barcode = generateBarcode(TARGET_USER_ID, barcodeIndex++);
      needsUpdate = true;
    }

    if (needsUpdate) {
      updates.updatedAt = Timestamp.now();
      await db.collection('Item').doc(item.id).update(updates);
      fixedCount++;
    }
  }

  console.log(`  Fixed ${fixedCount} items\n`);

  // Step 5: Summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total items found: ${items.length}`);
  console.log(`Duplicates removed: ${duplicates.length}`);
  console.log(`Items fixed: ${fixedCount}`);
  console.log(`Remaining items: ${uniqueItems.length}`);
  console.log('');

  // Verify
  const verifySnapshot = await db.collection('Item')
    .where('user_uuid', '==', TARGET_USER_ID)
    .get();
  console.log(`Verification: ${verifySnapshot.size} items now in database`);

  // Count by category
  const categoryCounts: Record<string, number> = {};
  verifySnapshot.docs.forEach(doc => {
    const tags = doc.data().normalizedTags || [];
    const tag = tags[0] || 'Unknown';
    categoryCounts[tag] = (categoryCounts[tag] || 0) + 1;
  });

  console.log('\nItems by category:');
  Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).forEach(([tag, count]) => {
    console.log(`  ${tag}: ${count}`);
  });
}

// Run the fix
fixFirestoreData()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
