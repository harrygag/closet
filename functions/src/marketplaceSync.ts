/**
 * Marketplace Sync Cloud Function
 * Receives listings extracted by the OpenClaw bot (called from the browser)
 * and stores them in Firestore under the authenticated user's document.
 *
 * Note: admin.initializeApp() is called in index.ts — do not call it here.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const getDb = () => admin.firestore();

export const saveMarketplaceSync = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to sync marketplace data.');
  }

  const { platform, username, listings } = data as {
    platform: string;
    username: string;
    listings: unknown[];
  };

  if (!platform || !username || !Array.isArray(listings)) {
    throw new functions.https.HttpsError('invalid-argument', 'platform, username, and listings are required.');
  }

  const userId = context.auth.uid;
  const db = getDb();

  await db.collection('marketplaceData').doc(userId).set(
    {
      platform,
      username,
      listings,
      userId,
      lastSync: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  functions.logger.info(`[MarketplaceSync] Saved ${listings.length} ${platform} listings for user ${userId}`);

  return { success: true, count: listings.length };
});
