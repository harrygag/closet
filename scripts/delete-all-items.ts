// Run with: npx tsx scripts/delete-all-items.ts
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin with Application Default Credentials
try {
  admin.initializeApp({
    projectId: 'closet-da8f2',
  });
} catch (e) {
  // Already initialized
}

const db = getFirestore();

async function deleteAllItems() {
  console.log('🗑️ Starting delete of ALL items...');

  // Get all items
  const snapshot = await db.collection('Item').get();
  console.log(`📊 Found ${snapshot.size} items to delete`);

  if (snapshot.size === 0) {
    console.log('✅ No items to delete!');
    return;
  }

  let batch = db.batch();
  let count = 0;
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count++;
    batchCount++;

    if (batchCount >= 500) {
      await batch.commit();
      console.log(`🗑️ Deleted ${count} items...`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`✅ Complete! Deleted ${count} total items.`);
}

deleteAllItems()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
