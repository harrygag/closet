/**
 * platformListingFirstSeen — set PlatformListing.firstSeenAt exactly once on doc create.
 *
 * The client `upsertListings` in src/services/inventory/platformListing.ts intentionally
 * never writes firstSeenAt — that lets us preserve the calibration baseline timestamp
 * across all subsequent Sync Stock / Calibrate runs. Firestore's onCreate trigger fires
 * exactly once per doc lifecycle, which is exactly what we want for "first observed".
 *
 * Idempotency: if firstSeenAt is somehow already set (race / migration), we leave it.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const onPlatformListingCreate = functions
  .firestore
  .document('PlatformListing/{listingKey}')
  .onCreate(async (snap) => {
    const data = snap.data();
    if (data?.firstSeenAt) return; // already set; nothing to do
    try {
      await snap.ref.set(
        { firstSeenAt: new Date().toISOString() },
        { merge: true },
      );
    } catch (err) {
      console.warn('[platformListingFirstSeen] failed to set firstSeenAt for', snap.id, err);
    }
  });
