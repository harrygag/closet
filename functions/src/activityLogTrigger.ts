/**
 * Cloud Function Trigger: Activity Log → Item Cache Updates
 *
 * Keeps Item cache fields (lastScannedDate, lastCheckInDate, scanCount) in sync
 * with the ActivityLog collection (source of truth).
 *
 * Triggers on: ActivityLog document creation
 * Updates: Item document cache fields
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Firestore Trigger: onActivityLogCreate
 *
 * When a new ActivityLog entry is created, update the corresponding Item's cache fields:
 * - SCAN activity → Update lastScannedDate, increment scanCount
 * - CHECK_IN activity → Update lastCheckInDate
 */
export const onActivityLogCreate = functions.firestore
  .document('ActivityLog/{activityId}')
  .onCreate(async (snapshot, context) => {
    const activity = snapshot.data();
    const activityType = activity.activityType;
    const itemId = activity.itemId;

    // Only process SCAN and CHECK_IN activities
    if (activityType !== 'SCAN' && activityType !== 'CHECK_IN') {
      console.log(`[onActivityLogCreate] Skipping non-scan activity: ${activityType}`);
      return null;
    }

    if (!itemId) {
      console.error('[onActivityLogCreate] Activity missing itemId:', snapshot.id);
      return null;
    }

    try {
      const db = admin.firestore();
      const itemRef = db.collection('Item').doc(itemId);
      const itemDoc = await itemRef.get();

      if (!itemDoc.exists) {
        console.error(`[onActivityLogCreate] Item not found: ${itemId}`);
        return null;
      }

      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (activityType === 'SCAN') {
        // Update lastScannedDate and increment scanCount
        const lastScannedDate = activity.timestamp?.toDate?.()?.toISOString?.() || new Date().toISOString();
        updateData.lastScannedDate = lastScannedDate;

        const currentScanCount = itemDoc.data()?.scanCount || 0;
        updateData.scanCount = currentScanCount + 1;

        updateData.verificationStatus = calculateVerificationStatus(lastScannedDate);

        console.log(`[onActivityLogCreate] Updating scan cache for item ${itemId}: scanCount=${updateData.scanCount}`);
      } else if (activityType === 'CHECK_IN') {
        // Update lastCheckInDate
        updateData.lastCheckInDate = activity.timestamp?.toDate?.()?.toISOString?.() || new Date().toISOString();

        console.log(`[onActivityLogCreate] Updating check-in cache for item ${itemId}`);
      }

      await itemRef.update(updateData);

      console.log(`[onActivityLogCreate] Successfully updated Item cache for ${itemId}`);
      return null;
    } catch (error) {
      console.error(`[onActivityLogCreate] Error updating Item cache for ${itemId}:`, error);
      return null;
    }
  });

/**
 * Helper function to calculate verification status based on last scan date
 * Can be called from other functions or HTTPS endpoints
 */
export function calculateVerificationStatus(lastScannedDate: string | null | undefined): 'verified' | 'needs-verification' | 'overdue' {
  if (!lastScannedDate) {
    return 'needs-verification';
  }

  const lastScan = new Date(lastScannedDate);
  const now = new Date();
  const daysSince = (now.getTime() - lastScan.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSince <= 1) {
    return 'verified';
  } else if (daysSince <= 7) {
    return 'needs-verification';
  } else {
    return 'overdue';
  }
}

/**
 * HTTPS Callable: Bulk recalculate verification status for all items
 * Can be called manually to backfill verification status
 */
export const recalculateVerificationStatus = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = data.userId || context.auth.uid;

  try {
    console.log(`[recalculateVerificationStatus] Starting for user ${userId}`);

    const db = admin.firestore();
    const itemsSnapshot = await db.collection('Item')
      .where('user_uuid', '==', userId)
      .get();

    const batch = db.batch();
    let updateCount = 0;

    itemsSnapshot.forEach((doc) => {
      const item = doc.data();
      const verificationStatus = calculateVerificationStatus(item.lastScannedDate);

      batch.update(doc.ref, {
        verificationStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      updateCount++;
    });

    await batch.commit();

    console.log(`[recalculateVerificationStatus] Updated ${updateCount} items for user ${userId}`);

    return {
      success: true,
      updatedCount: updateCount,
    };
  } catch (error) {
    console.error('[recalculateVerificationStatus] Error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to recalculate verification status');
  }
});

/**
 * HTTPS Callable: Get inventory scan statistics
 */
export const getInventoryScanStats = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = data.userId || context.auth.uid;

  try {
    const db = admin.firestore();
    const itemsSnapshot = await db.collection('Item')
      .where('userId', '==', userId)
      .get();

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalItems = 0;
    let neverScanned = 0;
    let scannedToday = 0;
    let overdueScans = 0;

    itemsSnapshot.forEach((doc) => {
      const item = doc.data();
      totalItems++;

      if (!item.lastScannedDate) {
        neverScanned++;
      } else {
        const lastScan = new Date(item.lastScannedDate);

        if (lastScan >= oneDayAgo) {
          scannedToday++;
        }

        const daysSince = (now.getTime() - lastScan.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) {
          overdueScans++;
        }
      }
    });

    return {
      totalItems,
      neverScanned,
      scannedToday,
      overdueScans,
      completionPercent: totalItems > 0 ? (scannedToday / totalItems) * 100 : 0,
    };
  } catch (error) {
    console.error('[getInventoryScanStats] Error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get scan statistics');
  }
});
