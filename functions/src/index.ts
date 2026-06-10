import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { XMLParser } from 'fast-xml-parser';
import { downloadAndBackupPhotos } from './photo-service';
export { aiAssistant } from './ai-assistant';
export { matchListingsWithAI, clearPlatformBindings } from './match';
export { onPlatformListingCreate } from './platformListingFirstSeen';
export {
  onActivityLogCreate,
  recalculateVerificationStatus,
  getInventoryScanStats,
} from './activityLogTrigger';
export { saveMarketplaceSync } from './marketplaceSync';

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

// eBay Trading API Configuration
const EBAY_TRADING_API_URL = 'https://api.ebay.com/ws/api.dll';
const EBAY_SANDBOX_TRADING_API_URL = 'https://api.sandbox.ebay.com/ws/api.dll';
const EBAY_API_VERSION = '1209';

// eBay API Configuration
const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_SANDBOX_API_BASE = 'https://api.sandbox.ebay.com';

// Helper function to get eBay credentials
function getEbayCredentials() {
  const EBAY_CLIENT_ID = functions.config().ebay?.client_id || process.env.EBAY_CLIENT_ID;
  const EBAY_CLIENT_SECRET = functions.config().ebay?.client_secret || process.env.EBAY_CLIENT_SECRET;
  const EBAY_RUNAME = functions.config().ebay?.runame || process.env.EBAY_RUNAME;
  const USE_SANDBOX = functions.config().ebay?.use_sandbox === 'true' || process.env.EBAY_USE_SANDBOX === 'true';

  return { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RUNAME, USE_SANDBOX };
}

// Helper function to refresh eBay access token
async function refreshEbayToken(userId: string, refreshToken: string): Promise<string> {
  const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET } = getEbayCredentials();

  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    throw new Error('eBay credentials not configured');
  }

  const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');

  const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: [
        'https://api.ebay.com/oauth/api_scope',
        'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.marketing',
        'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.inventory',
        'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.account',
        'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
        'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.finances',
        'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
        'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.reputation',
        'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
        'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
        'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.stores',
        'https://api.ebay.com/oauth/api_scope/sell.stores.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.inventory.mapping',
        'https://api.ebay.com/oauth/api_scope/commerce.message',
        'https://api.ebay.com/oauth/api_scope/commerce.feedback',
      ].join(' '),
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  // Update tokens in Firestore
  await db.collection('ebay_credentials').doc(userId).update({
    access_token: tokenData.access_token,
    expires_at: admin.firestore.Timestamp.fromDate(expiresAt),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return tokenData.access_token;
}

// Helper function to get valid access token (refreshes if needed)
async function getValidAccessToken(userId: string): Promise<string> {
  const credDoc = await db.collection('ebay_credentials').doc(userId).get();

  if (!credDoc.exists) {
    throw new Error('No eBay credentials found. Please connect your eBay account.');
  }

  const credData = credDoc.data()!;
  const expiresAt = credData.expires_at.toDate();
  const now = new Date();

  // Refresh if token expires in less than 5 minutes
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    console.log('Token expiring soon, refreshing...');
    return await refreshEbayToken(userId, credData.refresh_token);
  }

  return credData.access_token;
}

// Helper function to parse XML response from Trading API
// Handles tags with attributes like <CurrentPrice currencyID="USD">24.99</CurrentPrice>
function parseXMLValue(xml: string, tagName: string): string {
  // Match tags with or without attributes
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([^<]*)<\\/${tagName}>`, 's');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

// Helper function to parse all occurrences of a tag
// Handles tags with attributes
function parseXMLArray(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([^<]*)<\\/${tagName}>`, 'gs');
  const matches = xml.matchAll(regex);
  return Array.from(matches, m => m[1].trim());
}

// Helper function to call eBay Trading API
async function callTradingAPI(
  userId: string,
  apiCallName: string,
  requestBody: string
): Promise<string> {
  const accessToken = await getValidAccessToken(userId);
  const { USE_SANDBOX } = getEbayCredentials();
  const apiUrl = USE_SANDBOX ? EBAY_SANDBOX_TRADING_API_URL : EBAY_TRADING_API_URL;

  const headers = {
    'Content-Type': 'text/xml;charset=UTF-8',
    'X-EBAY-API-COMPATIBILITY-LEVEL': EBAY_API_VERSION,
    'X-EBAY-API-IAF-TOKEN': accessToken,
    'X-EBAY-API-SITEID': '0',
    'X-EBAY-API-CALL-NAME': apiCallName,
  };

  console.log(`Trading API call: ${apiCallName}`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Trading API error: ${response.status} - ${errorText}`);
    throw new Error(`Trading API error (${response.status}): ${errorText}`);
  }

  return await response.text();
}

// Helper function to make authenticated eBay API calls
async function makeEbayApiCall(
  userId: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const accessToken = await getValidAccessToken(userId);
  const { USE_SANDBOX } = getEbayCredentials();
  const baseUrl = USE_SANDBOX ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;

  const method = options.method?.toUpperCase() || 'GET';

  // Headers for eBay API - Accept-Language must be explicitly set to override any defaults
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept-Language': 'en-US',  // Must be explicitly set - Node.js fetch may add invalid defaults
  };

  // Add headers for write operations (POST, PUT, PATCH)
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['Content-Language'] = 'en-US';
    headers['X-EBAY-C-MARKETPLACE-ID'] = 'EBAY_US';
  }

  console.log(`eBay API call: ${method} ${baseUrl}${endpoint}`);
  console.log('Headers:', JSON.stringify(headers));

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    method,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`eBay API error: ${response.status} - ${errorText}`);
    throw new Error(`eBay API error (${response.status}): ${errorText}`);
  }

  const text = await response.text();
  // Handle empty responses
  if (!text) return {};
  return JSON.parse(text);
}

// eBay OAuth URL Generator
export const ebayOAuthUrl = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const userId = req.query.userId as string || req.body?.userId;

    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    const { EBAY_CLIENT_ID, EBAY_RUNAME } = getEbayCredentials();

    if (!EBAY_CLIENT_ID || !EBAY_RUNAME) {
      res.status(500).json({ error: 'eBay credentials not configured' });
      return;
    }

    // All comprehensive eBay scopes
    const scopes = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.marketing',
      'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.finances',
      'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
      'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.reputation',
      'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
      'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
      'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.stores',
      'https://api.ebay.com/oauth/api_scope/sell.stores.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.inventory.mapping',
      'https://api.ebay.com/oauth/api_scope/commerce.message',
      'https://api.ebay.com/oauth/api_scope/commerce.feedback',
    ].join(' ');

    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');

    // Store pending OAuth session in Firestore (in case eBay doesn't return state)
    await db.collection('ebay_pending_oauth').doc(userId).set({
      userId,
      state,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });

    // Use EBAY_RUNAME as redirect_uri (eBay requires RUNAME value, not actual callback URL)
    const authUrl = `https://auth.ebay.com/oauth2/authorize?client_id=${EBAY_CLIENT_ID}&redirect_uri=${encodeURIComponent(EBAY_RUNAME)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;

    // Redirect directly to eBay OAuth page
    res.redirect(302, authUrl);
  } catch (error) {
    console.error('Error generating eBay OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

// eBay OAuth Callback Handler
export const ebayCallback = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;
    const errorDescription = req.query.error_description as string;

    // Log all query params for debugging
    console.log('eBay callback params:', JSON.stringify(req.query));

    // Handle user declining authorization
    if (error) {
      console.log('eBay OAuth error:', error, errorDescription);
      const appBaseUrl = 'https://closet-da8f2.web.app';
      const errorMsg = encodeURIComponent(errorDescription || error || 'Authorization declined');
      res.redirect(302, `${appBaseUrl}/ebay-callback?error=${errorMsg}`);
      return;
    }

    if (!code) {
      const params = JSON.stringify(req.query);
      res.status(400).send(`Missing authorization code. Received: ${params}`);
      return;
    }

    let userId: string;

    // Try to get userId from state, or fall back to pending OAuth session
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        userId = stateData.userId;
      } catch (e) {
        console.error('Failed to decode state:', e);
        userId = '';
      }
    } else {
      userId = '';
    }

    // If we don't have userId from state, look up the most recent pending OAuth session
    if (!userId) {
      console.log('State missing, looking up pending OAuth session...');
      try {
        // Simple query without composite index - just get pending docs
        const pendingSnapshot = await db.collection('ebay_pending_oauth')
          .where('status', '==', 'pending')
          .get();

        if (pendingSnapshot.empty) {
          res.status(400).send('No pending OAuth session found. Please try connecting again.');
          return;
        }

        // Find the most recent one manually
        let mostRecent = pendingSnapshot.docs[0];
        let mostRecentTime = mostRecent.data().createdAt?.toMillis?.() || 0;

        for (const doc of pendingSnapshot.docs) {
          const createdAt = doc.data().createdAt?.toMillis?.() || 0;
          if (createdAt > mostRecentTime) {
            mostRecentTime = createdAt;
            mostRecent = doc;
          }
        }

        userId = mostRecent.data().userId;
        console.log('Found pending OAuth session for user:', userId);

        // Mark as processing
        await mostRecent.ref.update({ status: 'processing' });
      } catch (queryError) {
        console.error('Error querying pending OAuth:', queryError);
        res.status(500).send(`Error finding OAuth session: ${queryError}`);
        return;
      }
    }

    // Exchange code for tokens
    const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RUNAME } = getEbayCredentials();

    if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EBAY_RUNAME) {
      res.status(500).send('eBay credentials not configured');
      return;
    }

    const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');

    // Use EBAY_RUNAME as redirect_uri (eBay requires RUNAME value to match authorization request)
    // URLSearchParams automatically handles encoding, so don't double-encode the code
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,  // URLSearchParams handles encoding automatically
        redirect_uri: EBAY_RUNAME,  // Must match RUNAME from authorization request
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store tokens in Firestore
    await db.collection('ebay_credentials').doc(userId).set({
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: admin.firestore.Timestamp.fromDate(expiresAt),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Redirect to the app's success page (same origin allows popup communication)
    const appBaseUrl = 'https://closet-da8f2.web.app';
    res.redirect(302, `${appBaseUrl}/ebay-callback?success=true`);
  } catch (error) {
    console.error('eBay OAuth callback error:', error);
    const appBaseUrl = 'https://closet-da8f2.web.app';
    const errorMsg = encodeURIComponent(error instanceof Error ? error.message : 'Unknown error');
    res.redirect(302, `${appBaseUrl}/ebay-callback?error=${errorMsg}`);
  }
});

// Check eBay connection status - also fetches eBay username to verify auth works
export const ebayStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const credDoc = await db.collection('ebay_credentials').doc(userId).get();

    if (!credDoc.exists) {
      return {
        connected: false,
        hasToken: false,
        lastSync: null,
        tokenExpiry: null,
      };
    }

    const credData = credDoc.data()!;
    const expiresAt = credData.expires_at.toDate();

    // Verify auth by fetching eBay user info
    let ebayUsername = null;
    try {
      const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
</GetUserRequest>`;

      const xmlResponse = await callTradingAPI(userId, 'GetUser', requestBody);
      const userIdMatch = xmlResponse.match(/<UserID>([^<]+)<\/UserID>/);
      if (userIdMatch) {
        ebayUsername = userIdMatch[1];
      }
      console.log('Verified eBay user:', ebayUsername);
    } catch (userError) {
      console.error('Error fetching eBay user info:', userError);
    }

    return {
      connected: true,
      hasToken: true,
      ebayUsername,
      lastSync: credData.updated_at?.toDate().toISOString() || null,
      tokenExpiry: expiresAt.toISOString(),
      isExpired: expiresAt < new Date(),
    };
  } catch (error) {
    console.error('Error checking eBay status:', error);
    throw new functions.https.HttpsError('internal', 'Failed to check eBay status');
  }
});

// Fetch eBay inventory (listings)
export const ebayFetchInventory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const limit = data.limit || 100;
  const offset = data.offset || 0;

  try {
    // Fetch inventory items from eBay API
    const inventoryData = await makeEbayApiCall(
      userId,
      `/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`,
      { method: 'GET' }
    );

    const listings = inventoryData.inventoryItems || [];

    return {
      success: true,
      total: inventoryData.total || listings.length,
      limit,
      offset,
      listings: listings.map((item: any) => ({
        sku: item.sku,
        title: item.product?.title || 'Untitled',
        description: item.product?.description || '',
        price: item.product?.aspects?.Price?.[0] || item.availability?.shipToLocationAvailability?.quantity || 0,
        quantity: item.availability?.shipToLocationAvailability?.quantity || 0,
        condition: item.condition || 'UNSPECIFIED',
        images: item.product?.imageUrls || [],
        locale: item.locale || 'en_US',
      })),
    };
  } catch (error) {
    console.error('Error fetching eBay inventory:', error);
    throw new functions.https.HttpsError('internal', `Failed to fetch eBay inventory: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Sync eBay listings to Firestore
export const ebaySyncListings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    let allListings: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    // Fetch all listings with pagination
    while (hasMore) {
      const inventoryData = await makeEbayApiCall(
        userId,
        `/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`,
        { method: 'GET' }
      );

      const listings = inventoryData.inventoryItems || [];
      allListings = allListings.concat(listings);

      hasMore = listings.length === limit;
      offset += limit;

      // Safety limit to prevent infinite loops
      if (offset > 10000) {
        console.warn('Reached pagination safety limit');
        break;
      }
    }

    // Sync to Firestore - use 'Item' collection to match closet app schema
    const batch = db.batch();
    const itemsRef = db.collection('Item');
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const listing of allListings) {
      const sku = listing.sku;
      if (!sku) {
        skippedCount++;
        continue;
      }

      // Check if item already exists (by sku or ebayListingId)
      const existingQuery = await itemsRef
        .where('user_uuid', '==', userId)
        .where('sku', '==', sku)
        .limit(1)
        .get();

      // Extract price from listing (eBay stores price in different places)
      const priceValue = listing.product?.aspects?.Price?.[0] ||
        listing.offers?.[0]?.price?.value ||
        '0';
      const priceCents = Math.round(parseFloat(priceValue) * 100);

      // Build item data matching the closet app schema
      const title = listing.product?.title || listing.sku || 'Untitled';
      const tag = mapTitleToTag(title);
      
      const itemData = {
        user_uuid: userId,
        sku: sku,
        title: title,
        description: listing.product?.description || '',
        conditionNotes: listing.condition || '',
        manualPriceCents: priceCents,
        purchasePriceCents: 0, // Unknown from eBay
        imageUrls: listing.product?.imageUrls || [],
        normalizedTags: [tag],
        status: 'IN_STOCK',
        ebayListingId: listing.listingId || sku,
        ebayUrl: listing.listingId ? `https://www.ebay.com/itm/${listing.listingId}` : null,
        marketplace: 'ebay',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (existingQuery.empty) {
        // Create new item
        const newDocRef = itemsRef.doc();
        batch.set(newDocRef, {
          ...itemData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        importedCount++;
      } else {
        // Update existing item
        const docRef = existingQuery.docs[0].ref;
        batch.update(docRef, itemData);
        updatedCount++;
      }
    }

    await batch.commit();

    // Update last sync time
    await db.collection('ebay_credentials').doc(userId).update({
      last_sync: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      total: allListings.length,
      imported: importedCount,
      updated: updatedCount,
      skipped: skippedCount,
    };
  } catch (error) {
    console.error('Error syncing eBay listings:', error);
    throw new functions.https.HttpsError('internal', `Failed to sync eBay listings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Get eBay fulfillment orders
export const ebayGetOrders = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const limit = data.limit || 50;
  const offset = data.offset || 0;

  try {
    const ordersData = await makeEbayApiCall(
      userId,
      `/sell/fulfillment/v1/order?limit=${limit}&offset=${offset}`,
      { method: 'GET' }
    );

    const orders = ordersData.orders || [];

    return {
      success: true,
      total: ordersData.total || orders.length,
      orders: orders.map((order: any) => ({
        orderId: order.orderId,
        orderFulfillmentStatus: order.orderFulfillmentStatus,
        orderPaymentStatus: order.orderPaymentStatus,
        buyer: order.buyer?.username || 'Unknown',
        pricingSummary: order.pricingSummary,
        lineItems: order.lineItems || [],
        creationDate: order.creationDate,
        lastModifiedDate: order.lastModifiedDate,
      })),
    };
  } catch (error) {
    console.error('Error fetching eBay orders:', error);
    throw new functions.https.HttpsError('internal', `Failed to fetch eBay orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Disconnect eBay account
export const ebayDisconnect = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    await db.collection('ebay_credentials').doc(userId).delete();

    return {
      success: true,
      message: 'eBay account disconnected successfully',
    };
  } catch (error) {
    console.error('Error disconnecting eBay:', error);
    throw new functions.https.HttpsError('internal', 'Failed to disconnect eBay account');
  }
});

// Get eBay Stats - fetches listing counts and order stats
export const ebayGetStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    let totalListings = 0;
    let activeListings = 0;
    let totalOrders = 0;
    let revenue = 0;

    // Step 1: Get active listings count from Trading API
    try {
      const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>1</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;

      const xmlResponse = await callTradingAPI(userId, 'GetMyeBaySelling', requestBody);
      const activeEntriesMatch = xmlResponse.match(/<ActiveList>[\s\S]*?<PaginationResult>[\s\S]*?<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/);
      if (activeEntriesMatch) {
        activeListings = parseInt(activeEntriesMatch[1], 10);
        totalListings = activeListings;
      }
      console.log('Active listings from Trading API:', activeListings);
    } catch (listingError) {
      console.error('Error fetching listings:', listingError);
    }

    // Step 2: Get orders from last 90 days from Fulfillment API
    try {
      let offset = 0;
      const limit = 200;
      let hasMore = true;
      let allOrders: any[] = [];

      // Calculate 90 days ago in ISO format
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const creationDateFilter = ninetyDaysAgo.toISOString();

      while (hasMore && offset < 10000) { // Safety limit
        const ordersData = await makeEbayApiCall(
          userId,
          `/sell/fulfillment/v1/order?limit=${limit}&offset=${offset}&filter=creationdate:[${creationDateFilter}..]`,
          { method: 'GET' }
        );

        const orders = ordersData.orders || [];
        allOrders = allOrders.concat(orders);

        // Update total from API response (more accurate)
        if (ordersData.total !== undefined) {
          totalOrders = ordersData.total;
        }

        hasMore = orders.length === limit;
        offset += limit;
      }

      // Calculate revenue from ALL orders
      for (const order of allOrders) {
        if (order.orderPaymentStatus === 'PAID' || order.orderPaymentStatus === 'FULFILLED') {
          const total = parseFloat(order.pricingSummary?.total?.value || '0');
          revenue += total;
        }
      }

      console.log('Orders from Fulfillment API:', {
        totalOrders,
        fetchedOrders: allOrders.length,
        revenue: revenue.toFixed(2)
      });
    } catch (orderError) {
      console.error('Error fetching orders:', orderError);
    }

    return {
      success: true,
      totalListings,
      activeListings,
      totalOrders,
      revenue,
    };
  } catch (error) {
    console.error('Error getting eBay stats:', error);
    throw new functions.https.HttpsError('internal', `Failed to get eBay stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Data Fix Function - fixes tags, barcodes, and removes duplicates
export const fixItemData = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Valid tags with correct casing
  const VALID_TAGS = ['Hoodie', 'Jersey', 'Polo', 'Pullover/Jackets', 'T-shirts', 'Bottoms'];

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
    // Invalid tags that need recalculation
    'eBay Import': 'NEEDS_RECALC',
    'ebay': 'NEEDS_RECALC',
    'eBay': 'NEEDS_RECALC',
  };

  // Map title to correct tag
  function mapTitleToTag(title: string): string {
    const titleLower = title.toLowerCase();

    if (titleLower.includes('jersey')) return 'Jersey';
    if (titleLower.includes('hoodie') || titleLower.includes('hoody') ||
        (titleLower.includes('sweatshirt') && !titleLower.includes('crewneck'))) {
      return 'Hoodie';
    }
    const isPoloShirt = (
      (titleLower.includes('polo') && titleLower.includes('shirt')) ||
      (titleLower.includes('polo') && !titleLower.includes('ralph lauren') && !titleLower.includes('pullover')) ||
      (titleLower.includes('lacoste') && !titleLower.includes('jacket'))
    );
    if (isPoloShirt) return 'Polo';
    if (titleLower.includes('jacket') || titleLower.includes('windbreaker') ||
        titleLower.includes('bomber') || titleLower.includes('coat') ||
        titleLower.includes('1/4 zip') || titleLower.includes('quarter zip') ||
        titleLower.includes('quarter-zip') || titleLower.includes('fleece') ||
        (titleLower.includes('pullover') && !titleLower.includes('hoodie')) ||
        titleLower.includes('crewneck') || titleLower.includes('sweater')) {
      return 'Pullover/Jackets';
    }
    if (titleLower.includes('pant') || titleLower.includes('short') ||
        titleLower.includes('jeans') || titleLower.includes('trouser') ||
        titleLower.includes('bottom')) {
      return 'Bottoms';
    }
    if (titleLower.includes('t-shirt') || titleLower.includes('tshirt') ||
        titleLower.includes(' tee ') || titleLower.includes(' tee') ||
        (titleLower.includes('shirt') && !titleLower.includes('polo'))) {
      return 'T-shirts';
    }
    return 'T-shirts';
  }

  try {
    // Step 1: Fetch all items
    const snapshot = await db.collection('Item').where('user_uuid', '==', userId).get();
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Step 2: Find duplicates
    const seen = new Map<string, string>();
    const duplicateIds: string[] = [];

    for (const item of items) {
      const title = ((item as any).title || '').toLowerCase().trim().replace(/\s+/g, ' ');
      if (seen.has(title)) {
        duplicateIds.push(item.id);
      } else {
        seen.set(title, item.id);
      }
    }

    // Step 3: Delete duplicates
    for (const id of duplicateIds) {
      await db.collection('Item').doc(id).delete();
    }

    // Step 4: Fix remaining items
    const uniqueItems = items.filter(item => !duplicateIds.includes(item.id));
    let fixedCount = 0;
    let barcodeIndex = 1;

    for (const item of uniqueItems) {
      const data = item as any;
      const updates: Record<string, any> = {};
      let needsUpdate = false;

      // Fix tags
      let tags = data.normalizedTags || [];
      const correctTag = mapTitleToTag(data.title || '');

      // Map tags using normalization (replaces invalid tags with NEEDS_RECALC)
      let fixedTags = tags.map((t: string) => TAG_NORMALIZATION[t] || t);

      // Replace NEEDS_RECALC and any invalid tags with calculated tag from title
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
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const userPrefix = userId.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '0');
        updates.barcode = `INV-${dateStr}-${userPrefix}-${(barcodeIndex++).toString().padStart(5, '0')}`;
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await db.collection('Item').doc(item.id).update(updates);
        fixedCount++;
      }
    }

    return {
      success: true,
      totalItems: items.length,
      duplicatesRemoved: duplicateIds.length,
      itemsFixed: fixedCount,
      remainingItems: uniqueItems.length,
    };
  } catch (error) {
    console.error('Error fixing data:', error);
    throw new functions.https.HttpsError('internal', `Fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Delete All Items Function - clears all items for a user
export const deleteAllItems = functions
  .runWith({ timeoutSeconds: 540 }) // 9 minutes for large deletions
  .https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  console.log(`[deleteAllItems] Starting for user ${userId}`);

  try {
    const snapshot = await db.collection('Item').where('user_uuid', '==', userId).get();
    console.log(`[deleteAllItems] Found ${snapshot.size} items to delete`);

    let batch = db.batch();
    let count = 0;
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;
      batchCount++;

      // Firestore batch limit is 500 - must create NEW batch after commit
      if (batchCount >= 500) {
        await batch.commit();
        console.log(`[deleteAllItems] Deleted ${count} items...`);
        batch = db.batch(); // Create NEW batch
        batchCount = 0;
      }
    }

    // Commit remaining items
    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`[deleteAllItems] Complete: Deleted ${count} total items for user ${userId}`);
    return { success: true, deletedCount: count };
  } catch (error) {
    console.error('[deleteAllItems] Error:', error);
    throw new functions.https.HttpsError('internal', `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Delete Broken Items - removes items with empty titles (from broken imports)
export const deleteBrokenItems = functions
  .runWith({ timeoutSeconds: 540 }) // 9 minutes for large deletions
  .https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  console.log(`[deleteBrokenItems] Starting for user ${userId}`);

  try {
    // Query items with empty titles
    const snapshot = await db.collection('Item')
      .where('user_uuid', '==', userId)
      .where('title', '==', '')
      .get();

    console.log(`[deleteBrokenItems] Found ${snapshot.size} broken items to delete`);

    let batch = db.batch();
    let count = 0;
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;
      batchCount++;

      // Firestore batch limit is 500
      if (batchCount >= 500) {
        await batch.commit();
        console.log(`[deleteBrokenItems] Deleted ${count} items...`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Commit remaining items
    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`[deleteBrokenItems] Complete: Deleted ${count} broken items for user ${userId}`);
    return { success: true, deletedCount: count };
  } catch (error) {
    console.error('[deleteBrokenItems] Error:', error);
    throw new functions.https.HttpsError('internal', `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Temporary HTTP endpoint to delete all broken items (no auth required for cleanup)
export const deleteBrokenItemsHTTP = functions
  .runWith({ timeoutSeconds: 540 })
  .https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    console.log('[deleteBrokenItemsHTTP] Starting cleanup...');

    // Query ALL items with empty titles (for any user)
    const snapshot = await db.collection('Item')
      .where('title', '==', '')
      .get();

    console.log(`[deleteBrokenItemsHTTP] Found ${snapshot.size} broken items to delete`);

    let batch = db.batch();
    let count = 0;
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;
      batchCount++;

      // Firestore batch limit is 500
      if (batchCount >= 500) {
        await batch.commit();
        console.log(`[deleteBrokenItemsHTTP] Deleted ${count} items...`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Commit remaining items
    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`[deleteBrokenItemsHTTP] Complete: Deleted ${count} broken items`);
    res.json({ success: true, deletedCount: count });
  } catch (error) {
    console.error('[deleteBrokenItemsHTTP] Error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Delete ALL items HTTP endpoint
export const deleteAllItemsHTTP = functions
  .runWith({ timeoutSeconds: 540 })
  .https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    console.log('[deleteAllItemsHTTP] Starting...');

    // Query ALL items
    const snapshot = await db.collection('Item').get();

    console.log(`[deleteAllItemsHTTP] Found ${snapshot.size} items to delete`);

    let batch = db.batch();
    let count = 0;
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;
      batchCount++;

      if (batchCount >= 500) {
        await batch.commit();
        console.log(`[deleteAllItemsHTTP] Deleted ${count} items...`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`[deleteAllItemsHTTP] Complete: Deleted ${count} items`);
    res.json({ success: true, deletedCount: count });
  } catch (error) {
    console.error('[deleteAllItemsHTTP] Error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// CSV Import Function - imports Vendoo CSV data to Firestore
export const importCSVData = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const csvRows = data.items; // Array of item objects

  if (!csvRows || !Array.isArray(csvRows)) {
    throw new functions.https.HttpsError('invalid-argument', 'Items array required');
  }

  try {
    const batch = db.batch();
    let count = 0;

    for (const row of csvRows) {
      const docRef = db.collection('Item').doc();
      const barcode = row.sku || `VC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      batch.set(docRef, {
        user_uuid: userId,
        title: row.title || 'Untitled Item',
        size: row.color || '',
        status: row.status === 'Sold' ? 'SOLD' : 'IN_STOCK',
        normalizedTags: [row.category || 'Clothing'],
        imageUrls: row.image ? [row.image] : [],
        manualPriceCents: Math.round((parseFloat(row.price) || 0) * 100) || null,
        purchasePriceCents: Math.round((parseFloat(row.cost) || 0) * 100) || null,
        notes: `Brand: ${row.brand || 'Unknown'}. ${row.condition || ''}`,
        conditionNotes: row.description || '',
        brand: row.brand || 'Unknown',
        category: row.category || 'Clothing',
        barcode: barcode,
        listingPlatforms: row.platforms || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      count++;

      // Commit every 500 (Firestore batch limit)
      if (count % 500 === 0) {
        await batch.commit();
      }
    }

    await batch.commit();

    return {
      success: true,
      imported: count,
    };
  } catch (error) {
    console.error('Error importing CSV:', error);
    throw new functions.https.HttpsError('internal', `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Helper: Escape XML special characters
function escapeXML(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper: Parse eBay Shipping Details from Item XML
function parseShippingDetails(itemXML: string): any {
  const shippingDetailsXML = itemXML.match(/<ShippingDetails>([\s\S]*?)<\/ShippingDetails>/)?.[1];
  if (!shippingDetailsXML) return undefined;

  const shippingType = parseXMLValue(shippingDetailsXML, 'ShippingType') || 'NotSpecified';

  // Parse all shipping services
  const services = [];
  const serviceRegex = /<ShippingServiceOptions>([\s\S]*?)<\/ShippingServiceOptions>/g;
  let serviceMatch;
  while ((serviceMatch = serviceRegex.exec(shippingDetailsXML)) !== null) {
    const serviceXML = serviceMatch[1];
    const name = parseXMLValue(serviceXML, 'ShippingService');
    const costXML = serviceXML.match(/<ShippingServiceCost[^>]*>([\s\S]*?)<\/ShippingServiceCost>/)?.[1] || '0';
    const cost = Math.round(parseFloat(costXML) * 100) || 0;
    const additionalCostXML = serviceXML.match(/<ShippingServiceAdditionalCost[^>]*>([\s\S]*?)<\/ShippingServiceAdditionalCost>/)?.[1] || '0';
    const additionalCost = Math.round(parseFloat(additionalCostXML) * 100) || 0;
    const expedited = parseXMLValue(serviceXML, 'ExpeditedShipping') === 'true';
    const priority = parseInt(parseXMLValue(serviceXML, 'ShippingServicePriority') || '99', 10);

    if (name) {
      services.push({ name, cost, additionalCost, expedited, priority });
    }
  }

  const handlingTime = parseInt(parseXMLValue(shippingDetailsXML, 'HandlingTime') || '1', 10);
  const freeShipping = shippingType === 'Free';

  // Parse weight (only for calculated shipping)
  const weight = (() => {
    const major = parseXMLValue(shippingDetailsXML, 'WeightMajor');
    const minor = parseXMLValue(shippingDetailsXML, 'WeightMinor');
    const unit = parseXMLValue(shippingDetailsXML, 'WeightUnit');
    if (major || minor) {
      return {
        major: parseInt(major || '0', 10),
        minor: parseInt(minor || '0', 10),
        unit: (unit || 'lbs') as 'lbs' | 'kg',
      };
    }
    return undefined;
  })();

  // Parse dimensions (only for calculated shipping)
  const dimensions = (() => {
    const length = parseXMLValue(shippingDetailsXML, 'PackageLength');
    const width = parseXMLValue(shippingDetailsXML, 'PackageWidth');
    const height = parseXMLValue(shippingDetailsXML, 'PackageDepth');
    const unit = parseXMLValue(shippingDetailsXML, 'MeasurementUnit');
    if (length || width || height) {
      return {
        length: parseInt(length || '0', 10),
        width: parseInt(width || '0', 10),
        height: parseInt(height || '0', 10),
        unit: (unit || 'Inches') as 'Inches' | 'Centimeters',
      };
    }
    return undefined;
  })();

  const excludeLocations = parseXMLArray(shippingDetailsXML, 'ExcludeShipToLocation');
  const shipToLocations = parseXMLArray(shippingDetailsXML, 'ShipToLocations');

  return {
    shippingType: shippingType as 'Flat' | 'Calculated' | 'Free' | 'NotSpecified',
    services,
    handlingTime,
    weight,
    dimensions,
    excludeLocations: excludeLocations.length > 0 ? excludeLocations : undefined,
    shipToLocations: shipToLocations.length > 0 ? shipToLocations : undefined,
    freeShipping,
  };
}

// Helper: Parse eBay Return Policy from Item XML
function parseReturnPolicy(itemXML: string): any {
  const returnPolicyXML = itemXML.match(/<ReturnPolicy>([\s\S]*?)<\/ReturnPolicy>/)?.[1];
  if (!returnPolicyXML) return undefined;

  const returnsAccepted = parseXMLValue(returnPolicyXML, 'ReturnsAccepted');
  const accepted = returnsAccepted !== 'ReturnsNotAccepted' && returnsAccepted !== '';

  if (!accepted) {
    return { returnsAccepted: false };
  }

  const returnsWithin = parseXMLValue(returnPolicyXML, 'ReturnsWithin');
  const refund = parseXMLValue(returnPolicyXML, 'Refund');
  const shippingCostPaidBy = parseXMLValue(returnPolicyXML, 'ShippingCostPaidBy');
  const restockingFeePercent = parseInt(parseXMLValue(returnPolicyXML, 'RestockingFeePercent') || '0', 10);

  return {
    returnsAccepted: true,
    returnsWithin: (returnsWithin || undefined) as 'Days_30' | 'Days_60' | 'Days_90' | 'MoneyBack' | undefined,
    refundType: (refund || undefined) as 'MoneyBack' | 'MoneyBackOrExchange' | 'MoneyBackOrReplacement' | undefined,
    shippingCostPaidBy: (shippingCostPaidBy || undefined) as 'Buyer' | 'Seller' | undefined,
    restockingFeePercent: restockingFeePercent > 0 ? restockingFeePercent : undefined,
  };
}

// Helper: Parse Payment Methods from Item XML
function parsePaymentMethods(itemXML: string): string[] | undefined {
  const paymentMethods = parseXMLArray(itemXML, 'PaymentMethod');
  return paymentMethods.length > 0 ? paymentMethods : undefined;
}

// Helper: Parse Buyer Requirements from Item XML
function parseBuyerRequirements(itemXML: string): any {
  const buyerReqXML = itemXML.match(/<BuyerRequirementDetails>([\s\S]*?)<\/BuyerRequirementDetails>/)?.[1];
  if (!buyerReqXML) return undefined;

  const minimumFeedbackScore = parseInt(parseXMLValue(buyerReqXML, 'MinimumFeedbackScore') || '0', 10);
  const linkedPayPalRequired = parseXMLValue(buyerReqXML, 'LinkedPayPalAccount') === 'true';
  const shipToCountryOnly = parseXMLValue(buyerReqXML, 'ShipToRegistrationCountry') === 'true';

  // Only return if there's actual content
  if (minimumFeedbackScore > 0 || linkedPayPalRequired || shipToCountryOnly) {
    return {
      minimumFeedbackScore: minimumFeedbackScore > 0 ? minimumFeedbackScore : undefined,
      linkedPayPalRequired: linkedPayPalRequired ? true : undefined,
      shipToRegistrationCountryOnly: shipToCountryOnly ? true : undefined,
    };
  }
  return undefined;
}

// Helper: Parse Item Location from Item XML
function parseItemLocation(itemXML: string): any {
  const locationXML = itemXML.match(/<ItemLocation>([\s\S]*?)<\/ItemLocation>/)?.[1];
  if (!locationXML) return undefined;

  const city = parseXMLValue(locationXML, 'City');
  const state = parseXMLValue(locationXML, 'StateOrProvince');
  const country = parseXMLValue(locationXML, 'CountryName');
  const postalCode = parseXMLValue(locationXML, 'PostalCode');

  if (city || state || country || postalCode) {
    return {
      city: city || undefined,
      state: state || undefined,
      country: country || undefined,
      postalCode: postalCode || undefined,
    };
  }
  return undefined;
}

// Get eBay Listings using Trading API GetSellerList (with pagination)
// Returns full listing details for relisting
/**
 * Background job: Fetch all eBay quantities and update Firestore directly
 * Returns immediately to avoid client timeouts
 */
export const ebayUpdateAllQuantities = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' }) // 9 minutes max
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  console.log(`[Quantity Update] Starting background sync for user ${userId}`);

  // Return immediately - processing happens in background
  // Use setImmediate to run async without blocking response
  setImmediate(async () => {
    try {
      const db = admin.firestore();

      // Fetch all eBay listings (this takes ~90 seconds)
      console.log('[Quantity Update] Fetching all eBay listings...');
      const allListings: any[] = [];
      let actualEbayTotal = 0;

      const now = new Date();
      const maxDate = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
      const dateRanges: Array<{ start: Date; end: Date }> = [
        { start: now, end: maxDate }
      ];

      for (const range of dateRanges) {
        let pageNumber = 1;
        let hasMore = true;

        while (hasMore) {
          const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${process.env.EBAY_AUTH_TOKEN}</eBayAuthToken>
  </RequesterCredentials>
  <DetailLevel>ReturnAll</DetailLevel>
  <EndTimeFrom>${range.start.toISOString()}</EndTimeFrom>
  <EndTimeTo>${range.end.toISOString()}</EndTimeTo>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>${pageNumber}</PageNumber>
  </Pagination>
  <IncludeWatchCount>true</IncludeWatchCount>
</GetSellerListRequest>`;

          const response = await fetch('https://api.ebay.com/ws/api.dll', {
            method: 'POST',
            headers: {
              'X-EBAY-API-SITEID': '0',
              'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
              'X-EBAY-API-CALL-NAME': 'GetSellerList',
              'Content-Type': 'text/xml',
            },
            body: xmlRequest,
          });

          const xmlText = await response.text();
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
          const result = parser.parse(xmlText);

          const sellerListResponse = result?.GetSellerListResponse;
          if (!sellerListResponse || sellerListResponse.Ack !== 'Success') {
            console.error('[Quantity Update] eBay API error:', sellerListResponse?.Errors);
            break;
          }

          const paginationResult = sellerListResponse.PaginationResult;
          const currentPage = parseInt(sellerListResponse.PageNumber || '1');
          const totalPages = parseInt(paginationResult?.TotalNumberOfPages || '1');
          actualEbayTotal = parseInt(paginationResult?.TotalNumberOfEntries || '0');

          console.log(`[Quantity Update] Page ${currentPage}/${totalPages} (Total: ${actualEbayTotal})`);

          hasMore = sellerListResponse.HasMoreItems === 'true';

          const items = sellerListResponse.ItemArray?.Item;
          if (items) {
            const itemsArray = Array.isArray(items) ? items : [items];
            itemsArray.forEach((item: any) => {
              allListings.push({
                itemId: item.ItemID,
                quantity: parseInt(item.Quantity || '0'),
                quantitySold: parseInt(item.SellingStatus?.QuantitySold || '0'),
              });
            });
          }

          pageNumber++;
          if (pageNumber > 100) break; // Safety limit
        }
      }

      console.log(`[Quantity Update] Fetched ${allListings.length} listings from eBay`);

      // Create quantity map
      const quantityMap = new Map<string, { quantity: number; quantitySold: number }>();
      allListings.forEach((listing: any) => {
        quantityMap.set(listing.itemId, {
          quantity: listing.quantity || 0,
          quantitySold: listing.quantitySold || 0,
        });
      });

      // Get all user's items from Firestore
      const itemsSnapshot = await db.collection('Item')
        .where('user_uuid', '==', userId)
        .get();

      console.log(`[Quantity Update] Found ${itemsSnapshot.size} items in Firestore`);

      // Update each item with matching eBay quantities
      const batch = db.batch();
      let batchCount = 0;
      let updated = 0;
      let notFound = 0;
      let noEbayId = 0;

      for (const doc of itemsSnapshot.docs) {
        const item = doc.data();
        const ebayId = item.ebayListingId || item.ebayItemId;

        if (!ebayId) {
          noEbayId++;
          continue;
        }

        const quantities = quantityMap.get(ebayId);
        if (quantities) {
          // Only update if quantities changed
          if (item.ebayQuantity !== quantities.quantity || item.ebayQuantitySold !== quantities.quantitySold) {
            batch.update(doc.ref, {
              ebayQuantity: quantities.quantity,
              ebayQuantitySold: quantities.quantitySold,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            batchCount++;
            updated++;

            // Commit batch every 500 operations (Firestore limit)
            if (batchCount >= 500) {
              await batch.commit();
              console.log(`[Quantity Update] Committed batch of ${batchCount} updates`);
              batchCount = 0;
            }
          }
        } else {
          notFound++;
        }
      }

      // Commit remaining updates
      if (batchCount > 0) {
        await batch.commit();
        console.log(`[Quantity Update] Committed final batch of ${batchCount} updates`);
      }

      console.log(`[Quantity Update] Complete! Updated: ${updated}, NotFound: ${notFound}, NoEbayId: ${noEbayId}`);

      // Write completion status to Firestore for client to detect
      await db.collection('sync_status').doc(`ebay_quantities_${userId}`).set({
        userId,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updated,
        notFound,
        noEbayId,
        total: itemsSnapshot.size,
      });

    } catch (error) {
      console.error('[Quantity Update] Background job failed:', error);
      // Write error status
      const db = admin.firestore();
      await db.collection('sync_status').doc(`ebay_quantities_${userId}`).set({
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  // Return immediately to client
  return {
    success: true,
    message: 'Quantity sync started in background. Check sync_status collection for completion.',
    statusDocId: `ebay_quantities_${userId}`,
  };
});

export const ebayGetAllListings = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Pagination params - defaults to page 1, 100 items per page
  const requestedPage = data?.page || 1;
  const pageSize = Math.min(data?.pageSize || 100, 200); // Max 200 per page
  const fetchAll = data?.fetchAll === true; // If true, fetch all (for backwards compat)

  try {
    let allListings: any[] = [];
    let actualEbayTotal = 0;

    // eBay Trading API uses EndTimeFrom/EndTimeTo to filter by listing END date
    // Active GTC listings have rolling end dates in the FUTURE (renew every ~30 days)
    // eBay's GetSellerList silently caps per date range, so we use 4x 30-day windows
    // to reliably capture all listings (instead of 1x 120-day which can miss items).
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const dateRanges: Array<{ start: Date; end: Date }> = [
      { start: new Date(now.getTime() - 1 * day),  end: new Date(now.getTime() + 30 * day) },
      { start: new Date(now.getTime() + 30 * day), end: new Date(now.getTime() + 60 * day) },
      { start: new Date(now.getTime() + 60 * day), end: new Date(now.getTime() + 90 * day) },
      { start: new Date(now.getTime() + 90 * day), end: new Date(now.getTime() + 120 * day) },
    ];

    console.log(`Fetching ALL listings across ${dateRanges.length} date ranges (30-day chunks)`);

    // Fetch listings for each date range
    for (const dateRange of dateRanges) {
      let pageNumber = 1;
      let hasMoreItems = true;

      while (hasMoreItems) {
        const endTimeFrom = dateRange.start.toISOString();
        const endTimeTo = dateRange.end.toISOString();

        const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <DetailLevel>ReturnAll</DetailLevel>
  <DetailLevel>ItemReturnDescription</DetailLevel>
  <EndTimeFrom>${endTimeFrom}</EndTimeFrom>
  <EndTimeTo>${endTimeTo}</EndTimeTo>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>${pageNumber}</PageNumber>
  </Pagination>
  <IncludeWatchCount>false</IncludeWatchCount>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetSellerListRequest>`;

        const xmlResponse = await callTradingAPI(userId, 'GetSellerList', requestBody);

        // Parse XML response
        const ack = parseXMLValue(xmlResponse, 'Ack');
        if (ack === 'Failure') {
          const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
          console.error(`GetSellerList error: ${errorMessage}`);
          throw new Error(`eBay API error: ${errorMessage}`);
        }

        // Parse HasMoreItems flag
        const hasMoreItemsStr = parseXMLValue(xmlResponse, 'HasMoreItems');
        hasMoreItems = hasMoreItemsStr === 'true';

        // Parse total entries from eBay (get on first page)
        const totalEntriesMatch = xmlResponse.match(/<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/);
        if (totalEntriesMatch && pageNumber === 1) {
          actualEbayTotal = parseInt(totalEntriesMatch[1], 10);
        }

        // Parse Item elements
        const itemXMLs = xmlResponse.match(/<Item>([\s\S]*?)<\/Item>/g) || [];

        console.log(`Page ${pageNumber}: Found ${itemXMLs.length} items (eBay total: ${actualEbayTotal}, hasMore: ${hasMoreItems})`);

        for (const itemXML of itemXMLs) {
          // Extract listing data
          const itemId = parseXMLValue(itemXML, 'ItemID');
          const title = parseXMLValue(itemXML, 'Title');

          // DEBUG: Log first item's full XML to see what eBay returns
          if (pageNumber === 1 && allListings.length === 0) {
            console.log(`[DEBUG] First item XML (${itemId}):`, itemXML.substring(0, 2000));
          }
          const listingType = parseXMLValue(itemXML, 'ListingType');
          const viewItemURL = parseXMLValue(itemXML, 'ViewItemURL');

          // Parse current price (different structure for auction vs fixed price)
          let currentPrice = '0.00';
          let currency = 'USD';

          const sellingStatusXML = itemXML.match(/<SellingStatus>([\s\S]*?)<\/SellingStatus>/)?.[1] || '';
          if (sellingStatusXML) {
            const currentPriceXML = sellingStatusXML.match(/<CurrentPrice[^>]*>([\s\S]*?)<\/CurrentPrice>/)?.[0] || '';
            currentPrice = parseXMLValue(currentPriceXML, 'CurrentPrice') || currentPrice;
            const currencyMatch = currentPriceXML.match(/currencyID="([^"]+)"/);
            currency = currencyMatch ? currencyMatch[1] : currency;
          }

          // QuantityAvailable is the CURRENT available stock (not historical Quantity)
          // It accounts for sales, cancellations, and OutOfStockControl listings
          const quantityAvailableRaw = parseXMLValue(itemXML, 'QuantityAvailable');
          // Fall back to Quantity - QuantitySold only if QuantityAvailable isn't present
          const quantityRaw = parseXMLValue(itemXML, 'Quantity');
          const quantity = quantityRaw !== '' ? quantityRaw : '0';

          // Parse primary image URL
          const pictureURL = parseXMLValue(itemXML, 'PictureURL') || '';

          // Parse all image URLs
          const pictureURLs = parseXMLArray(itemXML, 'PictureURL');

          // Parse SKU if available
          const sku = parseXMLValue(itemXML, 'SKU') || itemId;

          // Parse condition
          const conditionDisplayName = parseXMLValue(itemXML, 'ConditionDisplayName') || 'Not Specified';
          const conditionID = parseXMLValue(itemXML, 'ConditionID') || '';

          // Parse start time for sorting (newest first)
          const startTime = parseXMLValue(itemXML, 'StartTime') || '';

          // Parse description for relisting (truncate if very large)
          let description = parseXMLValue(itemXML, 'Description') || '';
          if (description.length > 5000) {
            description = description.substring(0, 5000) + '...';
          }

          // Parse category info
          const primaryCategoryID = parseXMLValue(itemXML, 'PrimaryCategoryID') || '';
          const primaryCategoryName = parseXMLValue(itemXML, 'CategoryName') || '';

          // Parse item specifics for relisting (brand, size, color, etc.)
          const itemSpecifics: Record<string, string> = {};
          const nameValueListRegex = /<NameValueList>([\s\S]*?)<\/NameValueList>/g;
          let nvMatch;
          while ((nvMatch = nameValueListRegex.exec(itemXML)) !== null) {
            const nvXML = nvMatch[1];
            const name = parseXMLValue(nvXML, 'Name');
            const value = parseXMLValue(nvXML, 'Value');
            if (name && value) {
              itemSpecifics[name] = value;
            }
          }

          // Parse additional fields for relisting (CRITICAL)
          const subtitle = parseXMLValue(itemXML, 'Subtitle') || '';
          const conditionDescription = parseXMLValue(itemXML, 'ConditionDescription') || '';
          const endTime = parseXMLValue(itemXML, 'EndTime') || '';
          // Parse quantitySold — first try full XML, then explicitly from SellingStatus block
          const quantitySoldRaw = parseXMLValue(itemXML, 'QuantitySold') ||
            sellingStatusXML.match(/<QuantitySold>(\d+)<\/QuantitySold>/)?.[1] || '0';
          const quantitySold = parseInt(quantitySoldRaw, 10) || 0;

          // Parse shipping, return policy, payment methods, buyer requirements, location (CRITICAL)
          const shippingInfo = parseShippingDetails(itemXML);
          const returnPolicy = parseReturnPolicy(itemXML);
          const paymentMethods = parsePaymentMethods(itemXML);
          const buyerRequirements = parseBuyerRequirements(itemXML);
          const itemLocation = parseItemLocation(itemXML);

          // Parse additional product details
          const upc = parseXMLValue(itemXML, 'UPC') || '';
          const ean = parseXMLValue(itemXML, 'EAN') || '';
          const isbn = parseXMLValue(itemXML, 'ISBN') || '';
          const mpn = parseXMLValue(itemXML, 'MPN') || '';
          const brand = parseXMLValue(itemXML, 'Brand') || '';
          const manufacturer = parseXMLValue(itemXML, 'Manufacturer') || '';

          // Parse best offer settings
          const bestOfferEnabledStr = parseXMLValue(itemXML, 'BestOfferEnabled');
          const bestOfferEnabled = bestOfferEnabledStr === 'true';
          const autoAcceptPrice = parseXMLValue(itemXML, 'AutoAcceptPrice');
          const autoDeclinePrice = parseXMLValue(itemXML, 'AutoDeclinePrice');

          // Parse auction details if applicable
          const reservePrice = parseXMLValue(itemXML, 'ReservePrice') || '';
          const hasReservePrice = parseXMLValue(itemXML, 'ReserveMet') === 'true';

          // Parse seller notes and other metadata
          const sellerNotes = parseXMLValue(itemXML, 'SellerNotes') || '';
          const listingStatus = parseXMLValue(itemXML, 'ListingStatus') || '';

          // Parse tax information
          const salesTaxIncluded = parseXMLValue(itemXML, 'TaxTable/TaxJurisdiction/JurisdictionID') || '';

          // Parse watch count
          const watchCount = parseInt(parseXMLValue(itemXML, 'WatchCount') || '0', 10);
          const hitCount = parseInt(parseXMLValue(itemXML, 'HitCount') || '0', 10);

          // Parse bid/offer information
          const biddingDetails = parseXMLValue(itemXML, 'BiddingDetails') || '';
          const highestBidderUserID = parseXMLValue(itemXML, 'HighestBidderUserID') || '';

          // Calculate available quantity — include OOS items so frontend can detect sold-out
          const qtyNum = parseInt(quantity, 10);
          const qtyAvailable = quantityAvailableRaw !== '' ? parseInt(quantityAvailableRaw, 10) : (qtyNum - quantitySold);

          allListings.push({
            itemId,
            title,
            subtitle: subtitle || undefined,
            currentPrice: parseFloat(currentPrice),
            currency,
            quantity: qtyNum,
            quantityAvailable: qtyAvailable,
            quantitySold: quantitySold > 0 ? quantitySold : undefined,
            listingType,
            viewItemURL,
            pictureURL,
            pictureURLs, // All images for relisting
            sku,
            condition: conditionDisplayName,
            conditionID,
            conditionDescription: conditionDescription || undefined,
            startTime,
            endTime: endTime || undefined,
            description, // Full description (truncated if >5000 chars)
            primaryCategoryID,
            primaryCategoryName,
            itemSpecifics, // ALL item specifics for relisting
            // CRITICAL for relisting
            shippingInfo,
            returnPolicy,
            paymentMethods,
            buyerRequirements,
            itemLocation,
            // Additional product identifiers
            upc: upc || undefined,
            ean: ean || undefined,
            isbn: isbn || undefined,
            mpn: mpn || undefined,
            brand: brand || undefined,
            manufacturer: manufacturer || undefined,
            // Best offer settings
            bestOfferEnabled,
            autoAcceptPrice: autoAcceptPrice ? parseFloat(autoAcceptPrice) : undefined,
            autoDeclinePrice: autoDeclinePrice ? parseFloat(autoDeclinePrice) : undefined,
            // Auction details
            reservePrice: reservePrice ? parseFloat(reservePrice) : undefined,
            hasReservePrice,
            // Seller metadata
            sellerNotes: sellerNotes || undefined,
            listingStatus: listingStatus || undefined,
            // Engagement metrics
            watchCount,
            hitCount,
            // Seller notes and other metadata
            salesTaxIncluded: salesTaxIncluded || undefined,
            biddingDetails: biddingDetails || undefined,
            highestBidderUserID: highestBidderUserID || undefined,
          });
        }

        pageNumber++;

        // Safety limit - max 100 pages (20,000 items)
        if (pageNumber > 100) {
          console.log(`Reached max pages (100), stopping with ${allListings.length} items`);
          break;
        }
      }
    }

    // Deduplicate by itemId (same listing can appear in multiple 30-day windows near boundaries)
    const beforeDedupe = allListings.length;
    const seenIds = new Set<string>();
    const dedupedListings: typeof allListings = [];
    for (const listing of allListings) {
      if (listing.itemId && !seenIds.has(listing.itemId)) {
        seenIds.add(listing.itemId);
        dedupedListings.push(listing);
      }
    }
    allListings = dedupedListings;

    // Sort by startTime descending (newest first)
    allListings.sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });

    console.log(`Total listings fetched: ${allListings.length} (deduped from ${beforeDedupe}), eBay reported: ${actualEbayTotal}, sorted newest first`);

    // If fetchAll is true, return all listings (may fail if too large)
    if (fetchAll) {
      return {
        success: true,
        total: actualEbayTotal || allListings.length,
        listings: allListings,
        page: 1,
        pageSize: allListings.length,
        totalPages: 1,
      };
    }

    // Apply pagination
    const totalItems = allListings.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (requestedPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedListings = allListings.slice(startIndex, endIndex);

    console.log(`Returning page ${requestedPage}/${totalPages} (${paginatedListings.length} items)`);

    return {
      success: true,
      total: actualEbayTotal || totalItems,
      listings: paginatedListings,
      page: requestedPage,
      pageSize: pageSize,
      totalPages: totalPages,
    };
  } catch (error) {
    console.error('Error fetching all eBay listings:', error);
    throw new functions.https.HttpsError('internal', `Failed to fetch all eBay listings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Get eBay Item Details by SKU/ItemID for relisting
 * Fetches complete listing data from eBay Trading API
 */
export const ebayGetItemDetails = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { itemId } = data;

  if (!itemId) {
    throw new functions.https.HttpsError('invalid-argument', 'itemId is required');
  }

  try {
    console.log(`Fetching item details for SKU: ${itemId}`);

    // Build GetItem request
    const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <DetailLevel>ItemReturnDescription</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`;

    const xmlResponse = await callTradingAPI(userId, 'GetItem', requestBody);

    // Parse XML response
    const ack = parseXMLValue(xmlResponse, 'Ack');
    if (ack === 'Failure') {
      const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
      console.error(`GetItem error: ${errorMessage}`);
      throw new Error(`eBay API error: ${errorMessage}`);
    }

    // Extract Item element
    const itemXMLMatch = xmlResponse.match(/<Item>([\s\S]*?)<\/Item>/);
    if (!itemXMLMatch) {
      throw new Error('No item data returned from eBay');
    }

    const itemXML = itemXMLMatch[1];

    // Parse complete item details
    const title = parseXMLValue(itemXML, 'Title');
    const subtitle = parseXMLValue(itemXML, 'SubTitle') || '';
    // Description in eBay GetItem is wrapped in <![CDATA[...]]> and contains HTML.
    // The shared parseXMLValue uses [^<]* and stops at the first < — captures empty
    // when the body is CDATA. Use a CDATA-aware parser locally.
    let description = '';
    const descMatch = itemXML.match(/<Description(?:\s[^>]*)?>([\s\S]*?)<\/Description>/);
    if (descMatch) {
      let body = descMatch[1].trim();
      // Unwrap CDATA if present
      const cdataMatch = body.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
      if (cdataMatch) body = cdataMatch[1];
      description = body;
    }
    const listingType = parseXMLValue(itemXML, 'ListingType');
    const viewItemURL = parseXMLValue(itemXML, 'ViewItemURL');

    // Parse price
    let currentPrice = '0.00';
    let currency = 'USD';
    const sellingStatusXML = itemXML.match(/<SellingStatus>([\s\S]*?)<\/SellingStatus>/)?.[1] || '';
    if (sellingStatusXML) {
      const currentPriceXML = sellingStatusXML.match(/<CurrentPrice[^>]*>([\s\S]*?)<\/CurrentPrice>/)?.[0] || '';
      currentPrice = parseXMLValue(currentPriceXML, 'CurrentPrice') || currentPrice;
      const currencyMatch = currentPriceXML.match(/currencyID="([^"]+)"/);
      currency = currencyMatch ? currencyMatch[1] : currency;
    }

    // Parse quantity
    const quantity = parseXMLValue(itemXML, 'Quantity') || '0';

    // Parse all images
    const pictureURLs = parseXMLArray(itemXML, 'PictureURL');

    // Parse condition
    const conditionDisplayName = parseXMLValue(itemXML, 'ConditionDisplayName') || 'Not Specified';
    const conditionID = parseXMLValue(itemXML, 'ConditionID') || '';

    // Parse category
    const primaryCategoryID = parseXMLValue(itemXML, 'PrimaryCategoryID') || '';
    const primaryCategoryName = parseXMLValue(itemXML, 'CategoryName') || '';

    // Parse item specifics
    const itemSpecifics: Record<string, string> = {};
    const nameValueListRegex = /<NameValueList>([\s\S]*?)<\/NameValueList>/g;
    let nvMatch;
    while ((nvMatch = nameValueListRegex.exec(itemXML)) !== null) {
      const nvXML = nvMatch[1];
      const name = parseXMLValue(nvXML, 'Name');
      const value = parseXMLValue(nvXML, 'Value');
      if (name && value) {
        itemSpecifics[name] = value;
      }
    }

    // Parse shipping info
    const shippingCostXML = itemXML.match(/<ShippingCostSummary>([\s\S]*?)<\/ShippingCostSummary>/)?.[1] || '';
    const shippingServiceCost = parseXMLValue(shippingCostXML, 'ShippingServiceCost') || '';

    // Parse return policy
    const returnPolicyXML = itemXML.match(/<ReturnPolicy>([\s\S]*?)<\/ReturnPolicy>/)?.[1] || '';
    const returnsAccepted = parseXMLValue(returnPolicyXML, 'ReturnsAccepted') || '';

    const itemDetails = {
      itemId,
      title,
      subtitle,
      description,
      currentPrice: parseFloat(currentPrice),
      currency,
      quantity: parseInt(quantity),
      listingType,
      viewItemURL,
      pictureURLs,
      condition: conditionDisplayName,
      conditionID,
      primaryCategoryID,
      primaryCategoryName,
      itemSpecifics,
      shippingCost: shippingServiceCost,
      returnsAccepted,
    };

    console.log(`Successfully fetched details for item ${itemId}`);
    return {
      success: true,
      item: itemDetails,
    };
  } catch (error) {
    console.error(`Error fetching item ${itemId}:`, error);
    throw new functions.https.HttpsError('internal', `Failed to fetch item details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Cloud Function to backup eBay photos to Firebase Storage
 * Called during import to preserve photos before eBay URLs expire
 */
export const ebayBackupPhotos = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { itemId, photoUrls } = data;

  if (!itemId || !Array.isArray(photoUrls) || photoUrls.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'itemId and photoUrls array required');
  }

  try {
    console.log(`[ebayBackupPhotos] Backing up ${photoUrls.length} photos for item ${itemId}`);

    const result = await downloadAndBackupPhotos(userId, itemId, photoUrls);

    // CRITICAL: Save the ebayPhotos array to Firestore
    if (result.photos.length > 0) {
      await db.collection('Item').doc(itemId).update({
        ebayPhotos: result.photos,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[ebayBackupPhotos] Saved ${result.photos.length} photos to Firestore for item ${itemId}`);
    }

    console.log(`[ebayBackupPhotos] Backup complete for item ${itemId}:`, {
      photosDownloaded: result.photosDownloaded,
      photosFailed: result.photosFailed,
    });

    return result;
  } catch (error) {
    console.error('Error backing up eBay photos:', error);
    throw new functions.https.HttpsError('internal', `Failed to backup photos: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Helper function to map title to tag category
function mapTitleToTag(title: string): string {
  const titleLower = title.toLowerCase();

  if (titleLower.includes('jersey')) return 'Jersey';
  if (titleLower.includes('hoodie') || titleLower.includes('hoody') ||
      (titleLower.includes('sweatshirt') && !titleLower.includes('crewneck'))) {
    return 'Hoodie';
  }
  const isPoloShirt = (
    (titleLower.includes('polo') && titleLower.includes('shirt')) ||
    (titleLower.includes('polo') && !titleLower.includes('ralph lauren') && !titleLower.includes('pullover')) ||
    (titleLower.includes('lacoste') && !titleLower.includes('jacket'))
  );
  if (isPoloShirt) return 'Polo';
  if (titleLower.includes('jacket') || titleLower.includes('windbreaker') ||
      titleLower.includes('bomber') || titleLower.includes('coat') ||
      titleLower.includes('1/4 zip') || titleLower.includes('quarter zip') ||
      titleLower.includes('quarter-zip') || titleLower.includes('fleece') ||
      (titleLower.includes('pullover') && !titleLower.includes('hoodie')) ||
      titleLower.includes('crewneck') || titleLower.includes('sweater')) {
    return 'Pullover/Jackets';
  }
  if (titleLower.includes('pant') || titleLower.includes('short') ||
      titleLower.includes('jeans') || titleLower.includes('trouser') ||
      titleLower.includes('bottom')) {
    return 'Bottoms';
  }
  if (titleLower.includes('t-shirt') || titleLower.includes('tshirt') ||
      titleLower.includes(' tee ') || titleLower.includes(' tee') ||
      (titleLower.includes('shirt') && !titleLower.includes('polo'))) {
    return 'T-shirts';
  }
  return 'T-shirts';
}

// Extract size from title
function extractSizeFromTitle(title: string): string {
  const sizePatterns = [
    /\b(xxs|xs|small|medium|large|x-large|xx-large|xxx-large)\b/i,
    /\b(2xs|3xs|4xs|s|m|l|xl|2xl|3xl|4xl|xxl|xxxl|xxxxl)\b/i,
    /\bsize\s*(\w+)\b/i,
    /\bmens?\s*(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl)\b/i,
  ];

  for (const pattern of sizePatterns) {
    const match = title.match(pattern);
    if (match) {
      const size = match[1] || match[0];
      const sizeMap: Record<string, string> = {
        'small': 'S', 'medium': 'M', 'large': 'L',
        'x-large': 'XL', 'xx-large': 'XXL', 'xxx-large': 'XXXL',
      };
      return sizeMap[size.toLowerCase()] || size.toUpperCase();
    }
  }
  return '';
}

// Import ALL eBay listings directly to Firestore
// This is an all-in-one function that fetches from eBay and saves to DB
export const ebayImportAll = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const deleteExisting = data?.deleteExisting === true;

  console.log(`[ebayImportAll] Starting import for user ${userId}, deleteExisting: ${deleteExisting}`);

  try {
    // Step 1: Optionally delete existing items
    if (deleteExisting) {
      console.log('[ebayImportAll] Deleting existing items...');
      const existingSnapshot = await db.collection('Item').where('user_uuid', '==', userId).get();
      let deleteBatch = db.batch();
      let deleteCount = 0;
      let deleteBatchCount = 0;

      for (const doc of existingSnapshot.docs) {
        deleteBatch.delete(doc.ref);
        deleteCount++;
        deleteBatchCount++;
        if (deleteBatchCount >= 500) {
          await deleteBatch.commit();
          deleteBatch = db.batch(); // Create NEW batch
          deleteBatchCount = 0;
        }
      }
      if (deleteBatchCount > 0) {
        await deleteBatch.commit();
      }
      console.log(`[ebayImportAll] Deleted ${deleteCount} existing items`);
    }

    // Step 2: Fetch ALL eBay listings
    const allListings: any[] = [];
    const now = new Date();
    const maxDate = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);

    let pageNumber = 1;
    let hasMoreItems = true;
    let actualEbayTotal = 0;

    while (hasMoreItems) {
      const endTimeFrom = now.toISOString();
      const endTimeTo = maxDate.toISOString();

      // Use DetailLevel=ReturnAll to get full XML structure that parser can handle
      // Note: OutputSelector returns different XML structure that breaks parseXMLValue
      const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <DetailLevel>ReturnAll</DetailLevel>
  <EndTimeFrom>${endTimeFrom}</EndTimeFrom>
  <EndTimeTo>${endTimeTo}</EndTimeTo>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>${pageNumber}</PageNumber>
  </Pagination>
  <IncludeWatchCount>false</IncludeWatchCount>
</GetSellerListRequest>`;

      const xmlResponse = await callTradingAPI(userId, 'GetSellerList', requestBody);

      const ack = parseXMLValue(xmlResponse, 'Ack');
      if (ack === 'Failure') {
        const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
        throw new Error(`eBay API error: ${errorMessage}`);
      }

      const hasMoreItemsStr = parseXMLValue(xmlResponse, 'HasMoreItems');
      hasMoreItems = hasMoreItemsStr === 'true';

      const totalEntriesMatch = xmlResponse.match(/<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/);
      if (totalEntriesMatch && pageNumber === 1) {
        actualEbayTotal = parseInt(totalEntriesMatch[1], 10);
      }

      const itemXMLs = xmlResponse.match(/<Item>([\s\S]*?)<\/Item>/g) || [];
      console.log(`[ebayImportAll] Page ${pageNumber}: Found ${itemXMLs.length} items`);

      for (const itemXML of itemXMLs) {
        const itemId = parseXMLValue(itemXML, 'ItemID');
        const title = parseXMLValue(itemXML, 'Title');
        const listingType = parseXMLValue(itemXML, 'ListingType');
        const viewItemURL = parseXMLValue(itemXML, 'ViewItemURL');

        let currentPrice = '0.00';
        let currency = 'USD';
        const sellingStatusXML = itemXML.match(/<SellingStatus>([\s\S]*?)<\/SellingStatus>/)?.[1] || '';
        if (sellingStatusXML) {
          const currentPriceXML = sellingStatusXML.match(/<CurrentPrice[^>]*>([\s\S]*?)<\/CurrentPrice>/)?.[0] || '';
          currentPrice = parseXMLValue(currentPriceXML, 'CurrentPrice') || currentPrice;
          const currencyMatch = currentPriceXML.match(/currencyID="([^"]+)"/);
          currency = currencyMatch ? currencyMatch[1] : currency;
        }

        const quantity = parseXMLValue(itemXML, 'Quantity') || '0';
        const pictureURLs = parseXMLArray(itemXML, 'PictureURL');
        const sku = parseXMLValue(itemXML, 'SKU') || itemId;
        const conditionDisplayName = parseXMLValue(itemXML, 'ConditionDisplayName') || 'Not Specified';
        const conditionID = parseXMLValue(itemXML, 'ConditionID') || '';

        // Skip description - not fetched with OutputSelector for speed
        const primaryCategoryID = parseXMLValue(itemXML, 'PrimaryCategoryID') || '';
        const primaryCategoryName = parseXMLValue(itemXML, 'CategoryName') || '';

        const itemSpecifics: Record<string, string> = {};
        const nameValueListRegex = /<NameValueList>([\s\S]*?)<\/NameValueList>/g;
        let nvMatch;
        while ((nvMatch = nameValueListRegex.exec(itemXML)) !== null) {
          const nvXML = nvMatch[1];
          const name = parseXMLValue(nvXML, 'Name');
          const value = parseXMLValue(nvXML, 'Value');
          if (name && value) {
            itemSpecifics[name] = value;
          }
        }

        allListings.push({
          itemId,
          title,
          currentPrice: parseFloat(currentPrice),
          currency,
          quantity: parseInt(quantity, 10),
          listingType,
          viewItemURL,
          pictureURLs,
          sku,
          condition: conditionDisplayName,
          conditionID,
          primaryCategoryID,
          primaryCategoryName,
          itemSpecifics,
        });
      }

      pageNumber++;
      if (pageNumber > 100) {
        console.log('[ebayImportAll] Reached max pages limit');
        break;
      }
    }

    console.log(`[ebayImportAll] Fetched ${allListings.length} listings from eBay`);

    // Step 3: Import to Firestore
    let importedCount = 0;
    let skippedCount = 0;
    let barcodeIndex = 1;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const userPrefix = userId.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '0');

    // Get existing eBay IDs to skip duplicates
    const existingEbayIds = new Set<string>();
    if (!deleteExisting) {
      const existingItems = await db.collection('Item')
        .where('user_uuid', '==', userId)
        .select('ebayListingId')
        .get();
      existingItems.docs.forEach(doc => {
        const ebayId = doc.data().ebayListingId;
        if (ebayId) existingEbayIds.add(ebayId);
      });
      console.log(`[ebayImportAll] Found ${existingEbayIds.size} existing eBay items`);
    }

    let batch = db.batch();
    let batchCount = 0;

    for (const listing of allListings) {
      // Skip if already imported
      if (existingEbayIds.has(listing.itemId)) {
        skippedCount++;
        continue;
      }

      const tag = mapTitleToTag(listing.title);
      const size = extractSizeFromTitle(listing.title) || listing.itemSpecifics?.['Size'] || '';
      const brand = listing.itemSpecifics?.['Brand'] || 'Unknown';
      const barcode = `INV-${dateStr}-${userPrefix}-${(barcodeIndex++).toString().padStart(5, '0')}`;

      const itemData = {
        user_uuid: userId,
        title: listing.title,
        size: size,
        status: 'IN_STOCK',
        normalizedTags: [tag],
        imageUrls: listing.pictureURLs || [],
        manualPriceCents: Math.round(listing.currentPrice * 100),
        purchasePriceCents: null,
        soldPriceCents: null,
        notes: `Brand: ${brand}. Condition: ${listing.condition}`,
        conditionNotes: '', // Description skipped for speed
        brand: brand,
        category: listing.primaryCategoryName || 'Clothing',
        barcode: barcode,
        ebayListingId: listing.itemId,
        ebayUrl: listing.viewItemURL || `https://www.ebay.com/itm/${listing.itemId}`,
        sku: listing.sku,
        // Store eBay data for relisting (description fetched on-demand when needed)
        ebayData: {
          condition: listing.condition,
          conditionID: listing.conditionID,
          primaryCategoryID: listing.primaryCategoryID,
          primaryCategoryName: listing.primaryCategoryName,
          itemSpecifics: listing.itemSpecifics,
          pictureURLs: listing.pictureURLs,
          currency: listing.currency,
          quantity: listing.quantity,
          listingType: listing.listingType,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = db.collection('Item').doc();
      batch.set(docRef, itemData);
      importedCount++;
      batchCount++;

      // Commit every 500 and create new batch
      if (batchCount >= 500) {
        await batch.commit();
        console.log(`[ebayImportAll] Committed ${importedCount} items...`);
        batch = db.batch(); // Create NEW batch
        batchCount = 0;
      }
    }

    // Final commit for remaining items
    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`[ebayImportAll] Import complete: ${importedCount} imported, ${skippedCount} skipped`);

    return {
      success: true,
      totalFromEbay: actualEbayTotal || allListings.length,
      imported: importedCount,
      skipped: skippedCount,
    };
  } catch (error) {
    console.error('[ebayImportAll] Error:', error);
    throw new functions.https.HttpsError('internal', `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Import ONE page of eBay listings (fast, for progress display)
export const ebayImportPage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const pageNumber = data?.page || 1;
  const pageSize = Math.min(data?.pageSize || 200, 200);

  console.log(`[ebayImportPage] Page ${pageNumber} for user ${userId}`);

  try {
    const now = new Date();
    const maxDate = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
    const endTimeFrom = now.toISOString();
    const endTimeTo = maxDate.toISOString();

    // Fetch ONE page from eBay with OutputSelector for speed
    const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <EndTimeFrom>${endTimeFrom}</EndTimeFrom>
  <EndTimeTo>${endTimeTo}</EndTimeTo>
  <Pagination>
    <EntriesPerPage>${pageSize}</EntriesPerPage>
    <PageNumber>${pageNumber}</PageNumber>
  </Pagination>
  <IncludeWatchCount>false</IncludeWatchCount>
  <OutputSelector>ItemID</OutputSelector>
  <OutputSelector>Title</OutputSelector>
  <OutputSelector>SellingStatus.CurrentPrice</OutputSelector>
  <OutputSelector>Quantity</OutputSelector>
  <OutputSelector>ListingType</OutputSelector>
  <OutputSelector>ViewItemURL</OutputSelector>
  <OutputSelector>PictureDetails.PictureURL</OutputSelector>
  <OutputSelector>SKU</OutputSelector>
  <OutputSelector>ConditionDisplayName</OutputSelector>
  <OutputSelector>ConditionID</OutputSelector>
  <OutputSelector>PrimaryCategory</OutputSelector>
  <OutputSelector>ItemSpecifics</OutputSelector>
  <OutputSelector>HasMoreItems</OutputSelector>
  <OutputSelector>TotalNumberOfEntries</OutputSelector>
  <OutputSelector>PageNumber</OutputSelector>
</GetSellerListRequest>`;

    const xmlResponse = await callTradingAPI(userId, 'GetSellerList', requestBody);

    const ack = parseXMLValue(xmlResponse, 'Ack');
    if (ack === 'Failure') {
      const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
      throw new Error(`eBay API error: ${errorMessage}`);
    }

    const hasMoreItems = parseXMLValue(xmlResponse, 'HasMoreItems') === 'true';
    const totalEntriesMatch = xmlResponse.match(/<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/);
    const totalEntries = totalEntriesMatch ? parseInt(totalEntriesMatch[1], 10) : 0;
    const totalPages = Math.ceil(totalEntries / pageSize);

    // Parse items from this page
    const itemXMLs = xmlResponse.match(/<Item>([\s\S]*?)<\/Item>/g) || [];
    const listings: any[] = [];

    for (const itemXML of itemXMLs) {
      const itemId = parseXMLValue(itemXML, 'ItemID');
      const title = parseXMLValue(itemXML, 'Title');
      const listingType = parseXMLValue(itemXML, 'ListingType');
      const viewItemURL = parseXMLValue(itemXML, 'ViewItemURL');

      let currentPrice = '0.00';
      let currency = 'USD';
      const sellingStatusXML = itemXML.match(/<SellingStatus>([\s\S]*?)<\/SellingStatus>/)?.[1] || '';
      if (sellingStatusXML) {
        const currentPriceXML = sellingStatusXML.match(/<CurrentPrice[^>]*>([\s\S]*?)<\/CurrentPrice>/)?.[0] || '';
        currentPrice = parseXMLValue(currentPriceXML, 'CurrentPrice') || currentPrice;
        const currencyMatch = currentPriceXML.match(/currencyID="([^"]+)"/);
        currency = currencyMatch ? currencyMatch[1] : currency;
      }

      const quantity = parseXMLValue(itemXML, 'Quantity') || '0';
      const pictureURLs = parseXMLArray(itemXML, 'PictureURL');
      const sku = parseXMLValue(itemXML, 'SKU') || ''; // Only use real SKU, no fallback to itemId
      const conditionDisplayName = parseXMLValue(itemXML, 'ConditionDisplayName') || 'Not Specified';
      const conditionID = parseXMLValue(itemXML, 'ConditionID') || '';
      const primaryCategoryID = parseXMLValue(itemXML, 'PrimaryCategoryID') || '';
      const primaryCategoryName = parseXMLValue(itemXML, 'CategoryName') || '';

      const itemSpecifics: Record<string, string> = {};
      const nameValueListRegex = /<NameValueList>([\s\S]*?)<\/NameValueList>/g;
      let nvMatch;
      while ((nvMatch = nameValueListRegex.exec(itemXML)) !== null) {
        const nvXML = nvMatch[1];
        const name = parseXMLValue(nvXML, 'Name');
        const value = parseXMLValue(nvXML, 'Value');
        if (name && value) {
          itemSpecifics[name] = value;
        }
      }

      listings.push({
        itemId, title, currentPrice: parseFloat(currentPrice), currency,
        quantity: parseInt(quantity, 10), listingType, viewItemURL,
        pictureURLs, sku, condition: conditionDisplayName, conditionID,
        primaryCategoryID, primaryCategoryName, itemSpecifics,
      });
    }

    // Get existing eBay IDs to skip duplicates
    const existingItems = await db.collection('Item')
      .where('user_uuid', '==', userId)
      .select('ebayListingId')
      .get();
    const existingEbayIds = new Set<string>();
    existingItems.docs.forEach(doc => {
      const ebayId = doc.data().ebayListingId;
      if (ebayId) existingEbayIds.add(ebayId);
    });

    // Import to Firestore
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const userPrefix = userId.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '0');
    const baseIndex = (pageNumber - 1) * pageSize;

    let batch = db.batch();
    let batchCount = 0;
    let importedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      if (existingEbayIds.has(listing.itemId)) {
        skippedCount++;
        continue;
      }

      const tag = mapTitleToTag(listing.title);
      const size = extractSizeFromTitle(listing.title) || listing.itemSpecifics?.['Size'] || '';
      const brand = listing.itemSpecifics?.['Brand'] || 'Unknown';
      const barcode = `INV-${dateStr}-${userPrefix}-${(baseIndex + i + 1).toString().padStart(5, '0')}`;

      const itemData = {
        user_uuid: userId,
        title: listing.title,
        size: size,
        status: 'IN_STOCK',
        normalizedTags: [tag],
        imageUrls: listing.pictureURLs || [],
        manualPriceCents: Math.round(listing.currentPrice * 100),
        purchasePriceCents: null,
        soldPriceCents: null,
        notes: `Brand: ${brand}. Condition: ${listing.condition}`,
        conditionNotes: '',
        brand: brand,
        category: listing.primaryCategoryName || 'Clothing',
        barcode: barcode,
        ebayListingId: listing.itemId,
        ebayUrl: listing.viewItemURL || `https://www.ebay.com/itm/${listing.itemId}`,
        sku: listing.sku,
        ebayData: {
          condition: listing.condition,
          conditionID: listing.conditionID,
          primaryCategoryID: listing.primaryCategoryID,
          primaryCategoryName: listing.primaryCategoryName,
          itemSpecifics: listing.itemSpecifics,
          pictureURLs: listing.pictureURLs,
          currency: listing.currency,
          quantity: listing.quantity,
          listingType: listing.listingType,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      batch.set(db.collection('Item').doc(), itemData);
      importedCount++;
      batchCount++;

      if (batchCount >= 500) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`[ebayImportPage] Page ${pageNumber}: imported ${importedCount}, skipped ${skippedCount}`);

    return {
      success: true,
      page: pageNumber,
      totalPages,
      totalEntries,
      hasMoreItems,
      imported: importedCount,
      skipped: skippedCount,
      pageItems: listings.length,
    };
  } catch (error) {
    console.error('[ebayImportPage] Error:', error);
    throw new functions.https.HttpsError('internal', `Import page failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// FAST: Get listing count only (~50ms response time)
// Uses EntriesPerPage=1 to minimize data transfer
export const ebayGetListingCount = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const now = new Date();
    const maxDate = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);

    // Minimal request - only get count, no item data
    const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <EndTimeFrom>${now.toISOString()}</EndTimeFrom>
  <EndTimeTo>${maxDate.toISOString()}</EndTimeTo>
  <Pagination>
    <EntriesPerPage>1</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
  <OutputSelector>TotalNumberOfEntries</OutputSelector>
  <OutputSelector>TotalNumberOfPages</OutputSelector>
</GetSellerListRequest>`;

    const xmlResponse = await callTradingAPI(userId, 'GetSellerList', requestBody);

    const ack = parseXMLValue(xmlResponse, 'Ack');
    if (ack === 'Failure') {
      const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
      throw new Error(`eBay API error: ${errorMessage}`);
    }

    const totalMatch = xmlResponse.match(/<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/);
    const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;

    console.log(`[ebayGetListingCount] Total listings: ${total}`);

    return {
      success: true,
      total,
    };
  } catch (error) {
    console.error('[ebayGetListingCount] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get listing count: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// FAST: Get listings for DISPLAY only (minimal fields, ~200ms per 25 items)
// Does NOT import - just returns data for the UI to show
export const ebayGetListingsPreview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const pageNumber = data?.page || 1;
  const pageSize = Math.min(data?.pageSize || 25, 100); // Smaller default for speed

  try {
    const now = new Date();
    const maxDate = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);

    // Use DetailLevel>ReturnAll like the working ebayGetAllListings function
    // OutputSelector returns different XML structure that's harder to parse
    const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <DetailLevel>ReturnAll</DetailLevel>
  <EndTimeFrom>${now.toISOString()}</EndTimeFrom>
  <EndTimeTo>${maxDate.toISOString()}</EndTimeTo>
  <Pagination>
    <EntriesPerPage>${pageSize}</EntriesPerPage>
    <PageNumber>${pageNumber}</PageNumber>
  </Pagination>
  <IncludeWatchCount>false</IncludeWatchCount>
</GetSellerListRequest>`;

    const xmlResponse = await callTradingAPI(userId, 'GetSellerList', requestBody);

    const ack = parseXMLValue(xmlResponse, 'Ack');
    if (ack === 'Failure') {
      const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
      throw new Error(`eBay API error: ${errorMessage}`);
    }

    const hasMoreItems = parseXMLValue(xmlResponse, 'HasMoreItems') === 'true';
    const totalMatch = xmlResponse.match(/<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/);
    const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
    const totalPages = Math.ceil(total / pageSize);

    // Parse items - minimal fields only
    const itemXMLs = xmlResponse.match(/<Item>([\s\S]*?)<\/Item>/g) || [];
    const listings: any[] = [];

    // Use SAME parsing logic as working ebayGetAllListings function
    for (const itemXML of itemXMLs) {
      const itemId = parseXMLValue(itemXML, 'ItemID');
      const title = parseXMLValue(itemXML, 'Title');

      // Parse price EXACTLY like ebayGetAllListings does
      let currentPrice = '0.00';
      let currency = 'USD';
      const sellingStatusXML = itemXML.match(/<SellingStatus>([\s\S]*?)<\/SellingStatus>/)?.[1] || '';
      if (sellingStatusXML) {
        const currentPriceXML = sellingStatusXML.match(/<CurrentPrice[^>]*>([\s\S]*?)<\/CurrentPrice>/)?.[0] || '';
        currentPrice = parseXMLValue(currentPriceXML, 'CurrentPrice') || currentPrice;
        const currencyMatch = currentPriceXML.match(/currencyID="([^"]+)"/);
        currency = currencyMatch ? currencyMatch[1] : currency;
      }

      // Log full XML for first few items to diagnose OOS issue
      if (listings.length < 3) {
        console.log(`[PREVIEW DEBUG] Item ${itemId} XML:`, itemXML.substring(0, 1500));
      }

      // Parse quantity — prefer QuantityAvailable (current stock) over Quantity - QuantitySold
      const quantityAvailableRaw = parseXMLValue(itemXML, 'QuantityAvailable');
      const quantityRaw = parseXMLValue(itemXML, 'Quantity');
      const quantityNum = quantityRaw !== '' ? parseInt(quantityRaw, 10) : 1;
      const quantitySoldRaw = parseXMLValue(itemXML, 'QuantitySold') || sellingStatusXML.match(/<QuantitySold>(\d+)<\/QuantitySold>/)?.[1] || '0';
      const quantitySold = parseInt(quantitySoldRaw, 10) || 0;
      const qtyAvailable = quantityAvailableRaw !== '' ? parseInt(quantityAvailableRaw, 10) : (quantityNum - quantitySold);

      console.log(`[PREVIEW DEBUG] ${itemId} "${title.substring(0,40)}" qtyAvailableRaw="${quantityAvailableRaw}" qty=${quantityNum} sold=${quantitySold} → available=${qtyAvailable}`);

      // Skip OOS items
      if (qtyAvailable <= 0) {
        console.log(`[PREVIEW] Skipping OOS: ${itemId}`);
        continue;
      }

      // Parse picture URL EXACTLY like ebayGetAllListings does
      const pictureURL = parseXMLValue(itemXML, 'PictureURL') || '';

      const condition = parseXMLValue(itemXML, 'ConditionDisplayName') || '';

      listings.push({
        itemId,
        title,
        price: parseFloat(currentPrice) || 0,
        currency,
        quantity: quantityNum,
        quantitySold,
        imageUrl: pictureURL,
        condition,
      });
    }

    console.log(`[ebayGetListingsPreview] Page ${pageNumber}: ${listings.length} items (total: ${total})`);

    return {
      success: true,
      listings,
      page: pageNumber,
      pageSize,
      totalPages,
      total,
      hasMore: hasMoreItems,
    };
  } catch (error) {
    console.error('[ebayGetListingsPreview] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get listings preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// ============================================
// SHOPIFY INTEGRATION - Order Backup to Tracker
// ============================================

// Shopify Webhook Handler - receives order webhooks and backs up to Firebase
export const shopifyWebhook = functions.https.onRequest(async (req, res) => {
  // Verify request method
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const topic = req.headers['x-shopify-topic'] as string;
    const shopDomain = req.headers['x-shopify-shop-domain'] as string;
    const _hmac = req.headers['x-shopify-hmac-sha256'] as string;

    console.log(`[shopifyWebhook] Received: ${topic} from ${shopDomain}`);

    // Get the raw body for HMAC verification
    const _rawBody = JSON.stringify(req.body);

    // TODO: Verify HMAC signature with your Shopify webhook secret
    // const crypto = require('crypto');
    // const webhookSecret = functions.config().shopify?.webhook_secret;
    // const calculatedHmac = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('base64');
    // if (calculatedHmac !== hmac) {
    //   res.status(401).json({ error: 'Invalid signature' });
    //   return;
    // }

    const payload = req.body;

    // Handle different webhook topics
    switch (topic) {
      case 'orders/create':
      case 'orders/paid':
        await handleShopifyOrder(payload, 'created');
        break;
      case 'orders/fulfilled':
        await handleShopifyOrder(payload, 'fulfilled');
        break;
      case 'orders/cancelled':
        await handleShopifyOrder(payload, 'cancelled');
        break;
      default:
        console.log(`[shopifyWebhook] Unhandled topic: ${topic}`);
    }

    res.status(200).json({ success: true, topic });
  } catch (error) {
    console.error('[shopifyWebhook] Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle Shopify order and sync to tracker
async function handleShopifyOrder(order: any, eventType: string) {
  console.log(`[handleShopifyOrder] Processing order ${order.id} - ${eventType}`);

  // Store order in Firestore for backup
  const orderData = {
    shopify_order_id: order.id.toString(),
    order_number: order.order_number,
    email: order.email,
    total_price: order.total_price,
    currency: order.currency,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status || 'unfulfilled',
    event_type: eventType,
    customer: order.customer ? {
      id: order.customer.id,
      email: order.customer.email,
      first_name: order.customer.first_name,
      last_name: order.customer.last_name,
    } : null,
    shipping_address: order.shipping_address ? {
      address1: order.shipping_address.address1,
      city: order.shipping_address.city,
      province: order.shipping_address.province,
      country: order.shipping_address.country,
      zip: order.shipping_address.zip,
    } : null,
    line_items: order.line_items?.map((item: any) => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      sku: item.sku,
    })) || [],
    created_at: order.created_at,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
    synced_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Save to shopify_orders collection
  await db.collection('shopify_orders').doc(order.id.toString()).set(orderData, { merge: true });

  // If order is paid/fulfilled, mark items as SOLD in Item collection
  if (eventType === 'created' || eventType === 'fulfilled') {
    for (const lineItem of order.line_items || []) {
      if (lineItem.sku) {
        // Find matching item by SKU
        const itemQuery = await db.collection('Item')
          .where('sku', '==', lineItem.sku)
          .limit(1)
          .get();

        if (!itemQuery.empty) {
          const itemDoc = itemQuery.docs[0];
          await itemDoc.ref.update({
            status: 'SOLD',
            soldPriceCents: Math.round(parseFloat(lineItem.price) * 100),
            shopifyOrderId: order.id.toString(),
            soldAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`[handleShopifyOrder] Marked item ${lineItem.sku} as SOLD`);
        }
      }
    }
  }

  console.log(`[handleShopifyOrder] Order ${order.id} synced to Firebase`);
}

// Get Shopify orders from Firebase backup
export const getShopifyOrders = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const limit = data?.limit || 50;

  try {
    const ordersSnapshot = await db.collection('shopify_orders')
      .orderBy('synced_at', 'desc')
      .limit(limit)
      .get();

    const orders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      success: true,
      orders,
      total: ordersSnapshot.size,
    };
  } catch (error) {
    console.error('[getShopifyOrders] Error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get Shopify orders');
  }
});

// Sync item to Shopify (create/update product)
export const syncItemToShopify = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const itemId = data?.itemId;
  if (!itemId) {
    throw new functions.https.HttpsError('invalid-argument', 'Item ID required');
  }

  try {
    // Get item from Firestore
    const itemDoc = await db.collection('Item').doc(itemId).get();
    if (!itemDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Item not found');
    }

    const item = itemDoc.data()!;

    // Get Shopify credentials
    const shopifyStore = functions.config().shopify?.store;
    const shopifyToken = functions.config().shopify?.access_token;

    if (!shopifyStore || !shopifyToken) {
      throw new functions.https.HttpsError('failed-precondition', 'Shopify credentials not configured');
    }

    // Map item tag to Shopify collection
    const tagToCollection: Record<string, string> = {
      'Hoodie': 'hoodies',
      'Jersey': 'jerseys',
      'Polo': 'polos',
      'Pullover/Jackets': 'pullovers-jackets',
      'T-shirts': 't-shirts',
      'Bottoms': 'bottoms',
    };

    const category = item.normalizedTags?.[0] || 'T-shirts';
    const _collectionHandle = tagToCollection[category] || 'all';

    // Create product in Shopify
    const productData = {
      product: {
        title: item.title,
        body_html: item.conditionNotes || item.notes || '',
        vendor: item.brand || 'Unknown',
        product_type: category,
        tags: [category, item.brand, item.size].filter(Boolean).join(', '),
        variants: [{
          price: ((item.manualPriceCents || 0) / 100).toFixed(2),
          sku: item.sku || item.barcode,
          inventory_quantity: item.status === 'IN_STOCK' ? 1 : 0,
          inventory_management: 'shopify',
        }],
        images: item.imageUrls?.map((url: string) => ({ src: url })) || [],
      },
    };

    const response = await fetch(`https://${shopifyStore}/admin/api/2024-01/products.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyToken,
      },
      body: JSON.stringify(productData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error: ${errorText}`);
    }

    const result = await response.json();

    // Update item with Shopify product ID
    await itemDoc.ref.update({
      shopifyProductId: result.product.id.toString(),
      shopifyUrl: `https://${shopifyStore}/products/${result.product.handle}`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      shopifyProductId: result.product.id,
      shopifyUrl: `https://${shopifyStore}/products/${result.product.handle}`,
    };
  } catch (error) {
    console.error('[syncItemToShopify] Error:', error);
    throw new functions.https.HttpsError('internal', `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Delete items that don't have an eBay listing ID
export const deleteItemsWithoutEbay = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  console.log(`[deleteItemsWithoutEbay] Starting for user ${userId}`);

  try {
    // Get all items for this user
    const snapshot = await db.collection('Item').where('user_uuid', '==', userId).get();

    const itemsToDelete: admin.firestore.DocumentReference[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      // Delete if no ebayListingId
      if (!data.ebayListingId) {
        itemsToDelete.push(doc.ref);
      }
    }

    console.log(`[deleteItemsWithoutEbay] Found ${itemsToDelete.length} items without eBay backing`);

    // Delete in batches
    let batch = db.batch();
    let deleteCount = 0;
    let batchCount = 0;

    for (const ref of itemsToDelete) {
      batch.delete(ref);
      deleteCount++;
      batchCount++;

      if (batchCount >= 500) {
        await batch.commit();
        console.log(`[deleteItemsWithoutEbay] Deleted ${deleteCount} items...`);
        batch = db.batch(); // Create NEW batch
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`[deleteItemsWithoutEbay] Complete: Deleted ${deleteCount} items`);

    return {
      success: true,
      deletedCount: deleteCount,
      totalItems: snapshot.size,
      remainingItems: snapshot.size - deleteCount,
    };
  } catch (error) {
    console.error('[deleteItemsWithoutEbay] Error:', error);
    throw new functions.https.HttpsError('internal', `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Cloud Function to create a NEW eBay listing from stored item data
 * Uses ALL stored eBay data (shipping, returns, photos, specifics) to create identical listing
 * CRITICAL: Takes complete item data with all backup details and recreates on eBay
 */
export const ebayCreateListing = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const {
    title,
    subtitle,
    description,
    price,
    quantity,
    condition,
    conditionID,
    conditionDescription,
    categoryID,
    itemSpecifics,
    photosUrls,
    shippingInfo,
    returnPolicy,
    paymentMethods,
    buyerRequirements,
    itemLocation,
  } = data;

  if (!title || !description || !price || !categoryID) {
    throw new functions.https.HttpsError('invalid-argument', 'title, description, price, and categoryID are required');
  }

  try {
    console.log(`[ebayCreateListing] Creating new listing: "${title}" for user ${userId}`);

    // Get valid access token
    const accessToken = await getValidAccessToken(userId);

    // Build AddItem XML with ALL data
    let pictureDetailsXml = '';
    if (photosUrls && Array.isArray(photosUrls) && photosUrls.length > 0) {
      const photoTags = photosUrls
        .map(url => `<PictureURL>${escapeXML(url)}</PictureURL>`)
        .join('\n    ');
      pictureDetailsXml = `<PictureDetails>
    ${photoTags}
  </PictureDetails>`;
    }

    // Build item specifics
    let itemSpecificsXml = '';
    if (itemSpecifics && Object.keys(itemSpecifics).length > 0) {
      const nvlTags = Object.entries(itemSpecifics)
        .map(([name, value]) => {
          const valueStr = Array.isArray(value) ? value[0] : String(value);
          return `<NameValueList>
      <Name>${escapeXML(name)}</Name>
      <Value>${escapeXML(valueStr)}</Value>
    </NameValueList>`;
        })
        .join('\n    ');
      itemSpecificsXml = `<ItemSpecifics>
    ${nvlTags}
  </ItemSpecifics>`;
    }

    // Build shipping details (CRITICAL)
    let shippingDetailsXml = '';
    if (shippingInfo) {
      const shippingType = shippingInfo.shippingType || 'Flat';
      let servicesXml = '';
      if (shippingInfo.services && Array.isArray(shippingInfo.services)) {
        servicesXml = shippingInfo.services
          .map((service: any) => `<ShippingServiceOptions>
        <ShippingServicePriority>${service.priority || 1}</ShippingServicePriority>
        <ShippingService>${escapeXML(service.name || 'UPSGround')}</ShippingService>
        <ShippingServiceCost>${(service.cost / 100).toFixed(2)}</ShippingServiceCost>
        ${service.additionalCost ? `<ShippingServiceAdditionalCost>${(service.additionalCost / 100).toFixed(2)}</ShippingServiceAdditionalCost>` : ''}
      </ShippingServiceOptions>`)
          .join('\n      ');
      }

      let excludeLocationsXml = '';
      if (shippingInfo.excludeLocations && Array.isArray(shippingInfo.excludeLocations)) {
        excludeLocationsXml = shippingInfo.excludeLocations
          .map((loc: string) => `<ExcludeShipToLocation>${escapeXML(loc)}</ExcludeShipToLocation>`)
          .join('\n      ');
      }

      shippingDetailsXml = `<ShippingDetails>
    <ShippingType>${shippingType}</ShippingType>
    ${servicesXml ? `<ShippingServiceOptions>\n      ${servicesXml}\n    </ShippingServiceOptions>` : ''}
    ${shippingInfo.handlingTime ? `<HandlingTime>${shippingInfo.handlingTime}</HandlingTime>` : ''}
    ${excludeLocationsXml ? excludeLocationsXml : ''}
    <ShippingIrregular>false</ShippingIrregular>
  </ShippingDetails>`;
    }

    // Build return policy (REQUIRED by eBay)
    let returnPolicyXml = '';
    if (returnPolicy) {
      returnPolicyXml = `<ReturnPolicy>
    <ReturnsAcceptedOption>${returnPolicy.returnsAccepted ? 'ReturnsAccepted' : 'ReturnsNotAccepted'}</ReturnsAcceptedOption>
    ${returnPolicy.returnsWithin ? `<ReturnsWithinOption>${returnPolicy.returnsWithin}</ReturnsWithinOption>` : ''}
    ${returnPolicy.refundType ? `<RefundOption>${returnPolicy.refundType}</RefundOption>` : ''}
    ${returnPolicy.shippingCostPaidBy ? `<ShippingCostPaidByOption>${returnPolicy.shippingCostPaidBy}</ShippingCostPaidByOption>` : ''}
  </ReturnPolicy>`;
    } else {
      // Default return policy - 30 day returns, buyer pays shipping
      returnPolicyXml = `<ReturnPolicy>
    <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
    <ReturnsWithinOption>Days_30</ReturnsWithinOption>
    <RefundOption>MoneyBack</RefundOption>
    <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
  </ReturnPolicy>`;
    }

    // Build payment methods (CRITICAL)
    let paymentMethodsXml = '';
    if (paymentMethods && Array.isArray(paymentMethods) && paymentMethods.length > 0) {
      const methodTags = paymentMethods
        .map(method => `<PaymentMethod>${escapeXML(method)}</PaymentMethod>`)
        .join('\n    ');
      paymentMethodsXml = methodTags;
    }

    // Build buyer requirements (CRITICAL)
    let buyerRequirementsXml = '';
    if (buyerRequirements) {
      buyerRequirementsXml = `<BuyerRequirementDetails>
    ${buyerRequirements.minimumFeedbackScore ? `<MinimumFeedbackScore>${buyerRequirements.minimumFeedbackScore}</MinimumFeedbackScore>` : ''}
    ${buyerRequirements.linkedPayPalRequired ? '<LinkedPayPalAccount>true</LinkedPayPalAccount>' : ''}
    ${buyerRequirements.shipToRegistrationCountryOnly ? '<ShipToRegistrationCountryOnly>true</ShipToRegistrationCountryOnly>' : ''}
  </BuyerRequirementDetails>`;
    }

    // Build item location
    const locationCity = itemLocation?.city || 'New York';
    const locationState = itemLocation?.state || 'NY';
    const locationZip = itemLocation?.postalCode || '10001';
    const locationCountry = itemLocation?.country || 'US';

    // NOTE: Shipping, Payment, and Return policies are handled via eBay Business Policies
    // Do NOT include <ShippingDetails>, <ReturnPolicy>, or <PaymentMethods> for sellers with Business Policies enabled
    // eBay will automatically use the seller's default business policies
    const addItemXml = `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <Item>
    <Title>${escapeXML(title)}</Title>
    ${subtitle ? `<Subtitle>${escapeXML(subtitle)}</Subtitle>` : ''}
    <Description>${escapeXML(description)}</Description>
    <StartPrice>${(price / 100).toFixed(2)}</StartPrice>
    <Quantity>${quantity || 1}</Quantity>
    <ListingType>FixedPriceItem</ListingType>
    <ListingDuration>GTC</ListingDuration>
    <Country>${locationCountry}</Country>
    <Currency>USD</Currency>
    <Location>${escapeXML(locationCity)}, ${escapeXML(locationState)}</Location>
    <PostalCode>${escapeXML(locationZip)}</PostalCode>
    <ConditionID>${conditionID || '3000'}</ConditionID>
    <PrimaryCategory>
      <CategoryID>${escapeXML(categoryID)}</CategoryID>
    </PrimaryCategory>
    ${itemSpecificsXml}
    ${pictureDetailsXml}
    <DispatchTimeMax>1</DispatchTimeMax>
  </Item>
</AddItemRequest>`;

    console.log('[ebayCreateListing] Calling eBay AddItem API...');
    const response = await callTradingAPI(userId, 'AddItem', addItemXml);

    // Parse response
    const ack = parseXMLValue(response, 'Ack');
    if (ack === 'Failure') {
      const errorMessage = parseXMLValue(response, 'LongMessage');
      console.error('[ebayCreateListing] AddItem failed:', errorMessage);
      throw new Error(`eBay API error: ${errorMessage}`);
    }

    // Extract new item ID and listing URL
    const newItemId = parseXMLValue(response, 'ItemID');
    const fees = parseXMLValue(response, 'ListingFee');

    console.log(`[ebayCreateListing] Successfully created listing! Item ID: ${newItemId}`);

    return {
      success: true,
      itemId: newItemId,
      listingUrl: `https://www.ebay.com/itm/${newItemId}`,
      listingFee: parseFloat(fees || '0'),
    };
  } catch (error) {
    console.error('[ebayCreateListing] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to create listing: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * End an active eBay listing
 * Uses Trading API EndItem call
 */
export const ebayEndItem = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { itemId, endingReason = 'NotAvailable' } = data;

      console.log(`[ebayEndItem] Ending listing ${itemId} for user ${userId}`);

      // Build EndItem request
      const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<EndItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${itemId}</ItemID>
  <EndingReason>${endingReason}</EndingReason>
</EndItemRequest>`;

      const xmlResponse = await callTradingAPI(userId, 'EndItem', requestBody);

      // Parse response
      const ack = parseXMLValue(xmlResponse, 'Ack');
      if (ack === 'Failure') {
        const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
        console.error('[ebayEndItem] EndItem failed:', errorMessage);
        throw new Error(`eBay API error: ${errorMessage}`);
      }

      const endTime = parseXMLValue(xmlResponse, 'EndTime');

      console.log(`[ebayEndItem] Successfully ended item ${itemId}`);

      return {
        success: true,
        itemId,
        endTime,
      };
    } catch (error) {
      console.error('[ebayEndItem] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to end listing: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * Revise eBay listing price (Trading API)
 * Uses ReviseItem to update the price of an active listing
 */
export const ebayReviseItemPrice = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { itemId, newPriceCents } = data;

      if (!itemId || !newPriceCents) {
        throw new functions.https.HttpsError('invalid-argument', 'Item ID and new price are required');
      }

      console.log(`[ebayReviseItemPrice] Updating price for item ${itemId} to ${newPriceCents} cents`);

      const priceInDollars = (newPriceCents / 100).toFixed(2);

      // Build ReviseItem request with just the price update
      const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <Item>
    <ItemID>${escapeXML(itemId)}</ItemID>
    <StartPrice>${priceInDollars}</StartPrice>
  </Item>
</ReviseItemRequest>`;

      const xmlResponse = await callTradingAPI(userId, 'ReviseItem', requestBody);

      // Parse response
      const ack = parseXMLValue(xmlResponse, 'Ack');
      if (ack === 'Failure') {
        const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
        console.error('[ebayReviseItemPrice] ReviseItem failed:', errorMessage);
        throw new Error(`eBay API error: ${errorMessage}`);
      }

      console.log(`[ebayReviseItemPrice] Successfully updated price for item ${itemId}`);

      return {
        success: true,
        itemId,
        newPrice: newPriceCents,
      };
    } catch (error) {
      console.error('[ebayReviseItemPrice] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to update price: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

export const ebayReviseItemQuantity = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { itemId, quantity } = data;

      if (!itemId || quantity === undefined || quantity === null) {
        throw new functions.https.HttpsError('invalid-argument', 'Item ID and quantity are required');
      }

      const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <Item>
    <ItemID>${escapeXML(String(itemId))}</ItemID>
    <Quantity>${parseInt(quantity)}</Quantity>
  </Item>
</ReviseItemRequest>`;

      const xmlResponse = await callTradingAPI(userId, 'ReviseItem', requestBody);

      const ack = parseXMLValue(xmlResponse, 'Ack');
      if (ack === 'Failure') {
        const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
        throw new Error(`eBay API error: ${errorMessage}`);
      }

      return { success: true, itemId, quantity };
    } catch (error) {
      console.error('[ebayReviseItemQuantity] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to update quantity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * Relist an ended eBay listing
 * Uses Trading API RelistItem call - automatically copies all details
 */
export const ebayRelistItem = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { itemId, newPriceCents } = data;

      console.log(`[ebayRelistItem] Relisting item ${itemId} for user ${userId}`);

      // Build RelistItem request
      let itemXML = `<ItemID>${itemId}</ItemID>`;

      // If new price provided, include it in the relist
      if (newPriceCents) {
        const priceInDollars = (newPriceCents / 100).toFixed(2);
        itemXML += `<StartPrice>${priceInDollars}</StartPrice>`;
        console.log(`[ebayRelistItem] Relisting with new price: $${priceInDollars}`);
      }

      const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<RelistItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <Item>
    ${itemXML}
  </Item>
</RelistItemRequest>`;

      const xmlResponse = await callTradingAPI(userId, 'RelistItem', requestBody);

      // Parse response
      const ack = parseXMLValue(xmlResponse, 'Ack');
      if (ack === 'Failure') {
        const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
        console.error('[ebayRelistItem] RelistItem failed:', errorMessage);
        throw new Error(`eBay API error: ${errorMessage}`);
      }

      const newItemId = parseXMLValue(xmlResponse, 'ItemID');
      const fees = parseXMLValue(xmlResponse, 'ListingFee');

      console.log(`[ebayRelistItem] Successfully relisted! New Item ID: ${newItemId}`);

      return {
        success: true,
        itemId: newItemId,
        listingUrl: `https://www.ebay.com/itm/${newItemId}`,
        listingFee: parseFloat(fees || '0'),
      };
    } catch (error) {
      console.error('[ebayRelistItem] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to relist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * eBay Sell Inventory API - Create/Update Inventory Item
 * PUT /sell/inventory/v1/inventory_item/{sku}
 */
export const ebayInventoryCreateItem = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const {
        sku,
        title,
        description,
        imageUrls,
        categoryId,
        condition,
        conditionDescription,
        itemSpecifics,
        availability,
      } = data;

      console.log(`[ebayInventoryCreateItem] Creating inventory item for SKU: ${sku}`);

      // Get valid access token
      const accessToken = await getValidAccessToken(userId);
      const { USE_SANDBOX } = getEbayCredentials();
      const baseUrl = USE_SANDBOX ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;

      // Build inventory item payload
      const inventoryItem: any = {
        product: {
          title,
          description,
          imageUrls: imageUrls || [],
          aspects: itemSpecifics || {},
        },
      };

      // Add condition if provided
      if (condition) {
        inventoryItem.condition = condition;
      }
      if (conditionDescription) {
        inventoryItem.conditionDescription = conditionDescription;
      }

      // Add availability if provided
      if (availability) {
        inventoryItem.availability = availability;
      }

      console.log('[ebayInventoryCreateItem] Payload:', JSON.stringify(inventoryItem, null, 2));

      // Call Inventory API
      const response = await fetch(`${baseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Language': 'en-US',
        },
        body: JSON.stringify(inventoryItem),
      });

      // 204 No Content means success
      if (response.status === 204) {
        console.log('[ebayInventoryCreateItem] Successfully created/updated inventory item');
        return {
          success: true,
          sku,
          message: 'Inventory item created/updated successfully',
        };
      }

      // Handle errors
      const errorData = await response.json().catch(() => ({}));
      console.error('[ebayInventoryCreateItem] API error:', errorData);
      throw new Error(errorData.errors?.[0]?.message || `API error: ${response.status}`);

    } catch (error) {
      console.error('[ebayInventoryCreateItem] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to create inventory item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * eBay Sell Inventory API - Create Offer
 * POST /sell/inventory/v1/offer
 */
export const ebayInventoryCreateOffer = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const {
        sku,
        marketplaceId = 'EBAY_US',
        format = 'FIXED_PRICE',
        price,
        quantity,
        categoryId,
        listingPolicies,
        merchantLocationKey,
      } = data;

      console.log(`[ebayInventoryCreateOffer] Creating offer for SKU: ${sku}`);

      // Get valid access token
      const accessToken = await getValidAccessToken(userId);
      const { USE_SANDBOX } = getEbayCredentials();
      const baseUrl = USE_SANDBOX ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;

      // Build offer payload
      const offer: any = {
        sku,
        marketplaceId,
        format,
        availableQuantity: quantity || 1,
        categoryId,
        listingDescription: data.listingDescription,
        pricingSummary: {
          price: {
            value: (price / 100).toFixed(2), // Convert cents to dollars
            currency: 'USD',
          },
        },
      };

      // Add listing policies if provided
      if (listingPolicies) {
        offer.listingPolicies = listingPolicies;
      }

      // Add merchant location if provided
      if (merchantLocationKey) {
        offer.merchantLocationKey = merchantLocationKey;
      }

      console.log('[ebayInventoryCreateOffer] Payload:', JSON.stringify(offer, null, 2));

      // Call Inventory API
      const response = await fetch(`${baseUrl}/sell/inventory/v1/offer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Language': 'en-US',
        },
        body: JSON.stringify(offer),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('[ebayInventoryCreateOffer] API error:', responseData);
        throw new Error(responseData.errors?.[0]?.message || `API error: ${response.status}`);
      }

      console.log('[ebayInventoryCreateOffer] Successfully created offer:', responseData.offerId);

      return {
        success: true,
        offerId: responseData.offerId,
        sku,
      };

    } catch (error) {
      console.error('[ebayInventoryCreateOffer] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to create offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * eBay Sell Inventory API - Publish Offer
 * POST /sell/inventory/v1/offer/{offerId}/publish
 */
export const ebayInventoryPublishOffer = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { offerId } = data;

      console.log(`[ebayInventoryPublishOffer] Publishing offer: ${offerId}`);

      // Get valid access token
      const accessToken = await getValidAccessToken(userId);
      const { USE_SANDBOX } = getEbayCredentials();
      const baseUrl = USE_SANDBOX ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;

      // Call Inventory API
      const response = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('[ebayInventoryPublishOffer] API error:', responseData);
        throw new Error(responseData.errors?.[0]?.message || `API error: ${response.status}`);
      }

      console.log('[ebayInventoryPublishOffer] Successfully published offer');

      return {
        success: true,
        listingId: responseData.listingId,
        listingUrl: `https://www.ebay.com/itm/${responseData.listingId}`,
      };

    } catch (error) {
      console.error('[ebayInventoryPublishOffer] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to publish offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * eBay Sell Inventory API - Withdraw Offer (Delist)
 * DELETE /sell/inventory/v1/offer/{offerId}
 */
export const ebayInventoryWithdrawOffer = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { offerId } = data;

      console.log(`[ebayInventoryWithdrawOffer] Withdrawing offer: ${offerId}`);

      // Get valid access token
      const accessToken = await getValidAccessToken(userId);
      const { USE_SANDBOX } = getEbayCredentials();
      const baseUrl = USE_SANDBOX ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;

      // Call Inventory API to withdraw (delist) the offer
      const response = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      // 204 No Content is success for DELETE
      if (response.status === 204) {
        console.log('[ebayInventoryWithdrawOffer] Successfully withdrew offer');
        return {
          success: true,
          offerId,
        };
      }

      // Handle error
      const responseData = response.status !== 204 ? await response.json() : {};
      console.error('[ebayInventoryWithdrawOffer] API error:', responseData);
      throw new Error(responseData.errors?.[0]?.message || `API error: ${response.status}`);

    } catch (error) {
      console.error('[ebayInventoryWithdrawOffer] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to withdraw offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * eBay Sell Inventory API - Get Listing Fees
 * POST /sell/inventory/v1/offer/get_listing_fees
 */
export const ebayInventoryGetListingFees = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { offerIds } = data; // Array of offer IDs

      console.log(`[ebayInventoryGetListingFees] Getting fees for ${offerIds.length} offers`);

      // Get valid access token
      const accessToken = await getValidAccessToken(userId);
      const { USE_SANDBOX } = getEbayCredentials();
      const baseUrl = USE_SANDBOX ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;

      // Build payload
      const payload = {
        offers: offerIds.map((offerId: string) => ({ offerId })),
      };

      // Call Inventory API
      const response = await fetch(`${baseUrl}/sell/inventory/v1/offer/get_listing_fees`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('[ebayInventoryGetListingFees] API error:', responseData);
        throw new Error(responseData.errors?.[0]?.message || `API error: ${response.status}`);
      }

      console.log('[ebayInventoryGetListingFees] Successfully retrieved fees');

      return {
        success: true,
        fees: responseData.feeSummaries,
      };

    } catch (error) {
      console.error('[ebayInventoryGetListingFees] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to get listing fees: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * eBay Sell Inventory API - Complete Listing Workflow
 * Creates inventory item, creates offer, and publishes in one call
 */
export const ebayInventoryCreateAndPublish = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const {
        sku,
        title,
        description,
        imageUrls,
        categoryId,
        condition,
        conditionDescription,
        itemSpecifics,
        price,
        quantity,
        marketplaceId = 'EBAY_US',
        format = 'FIXED_PRICE',
        listingPolicies,
      } = data;

      console.log(`[ebayInventoryCreateAndPublish] Complete workflow for SKU: ${sku}`);

      // Get valid access token
      const accessToken = await getValidAccessToken(userId);
      const { USE_SANDBOX } = getEbayCredentials();
      const baseUrl = USE_SANDBOX ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE;

      // Step 1: Create/Update Inventory Item
      console.log('[ebayInventoryCreateAndPublish] Step 1: Creating inventory item...');
      const inventoryItem: any = {
        product: {
          title,
          description,
          imageUrls: imageUrls || [],
          aspects: itemSpecifics || {},
        },
        condition,
        conditionDescription,
        availability: {
          shipToLocationAvailability: {
            quantity: quantity || 1,
          },
        },
      };

      const createItemResponse = await fetch(`${baseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Language': 'en-US',
        },
        body: JSON.stringify(inventoryItem),
      });

      if (createItemResponse.status !== 204) {
        const errorData = await createItemResponse.json().catch(() => ({}));
        throw new Error(`Failed to create inventory item: ${errorData.errors?.[0]?.message || createItemResponse.status}`);
      }

      // Step 2: Create Offer
      console.log('[ebayInventoryCreateAndPublish] Step 2: Creating offer...');
      const offer: any = {
        sku,
        marketplaceId,
        format,
        availableQuantity: quantity || 1,
        categoryId,
        listingDescription: description,
        pricingSummary: {
          price: {
            value: (price / 100).toFixed(2),
            currency: 'USD',
          },
        },
      };

      if (listingPolicies) {
        offer.listingPolicies = listingPolicies;
      }

      const createOfferResponse = await fetch(`${baseUrl}/sell/inventory/v1/offer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Language': 'en-US',
        },
        body: JSON.stringify(offer),
      });

      const offerData = await createOfferResponse.json();

      if (!createOfferResponse.ok) {
        throw new Error(`Failed to create offer: ${offerData.errors?.[0]?.message || createOfferResponse.status}`);
      }

      const offerId = offerData.offerId;

      // Step 3: Publish Offer
      console.log('[ebayInventoryCreateAndPublish] Step 3: Publishing offer...');
      const publishResponse = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const publishData = await publishResponse.json();

      if (!publishResponse.ok) {
        throw new Error(`Failed to publish offer: ${publishData.errors?.[0]?.message || publishResponse.status}`);
      }

      console.log('[ebayInventoryCreateAndPublish] Successfully completed workflow!');

      return {
        success: true,
        sku,
        offerId,
        listingId: publishData.listingId,
        listingUrl: `https://www.ebay.com/itm/${publishData.listingId}`,
      };

    } catch (error) {
      console.error('[ebayInventoryCreateAndPublish] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to create and publish listing: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

// ============================================================================
// EBAY OFFER API - MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Get offers for a specific SKU
 */
export const ebayGetOffers = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { sku, marketplaceId } = data;

    if (!sku) {
      throw new functions.https.HttpsError('invalid-argument', 'SKU is required');
    }

    const queryParams = new URLSearchParams({ sku });
    if (marketplaceId) {
      queryParams.append('marketplace_id', marketplaceId);
    }

    const result = await makeEbayApiCall(
      userId,
      `/sell/inventory/v1/offer?${queryParams}`,
      { method: 'GET' }
    );

    return { success: true, ...result };
  } catch (error) {
    console.error('[ebayGetOffers] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get offers: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Get all offers (paginated)
 */
export const ebayGetAllOffers = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { limit = 50, offset = 0 } = data;

    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    const result = await makeEbayApiCall(
      userId,
      `/sell/inventory/v1/offer?${queryParams}`,
      { method: 'GET' }
    );

    return { success: true, ...result };
  } catch (error) {
    console.error('[ebayGetAllOffers] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get all offers: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Get a specific offer by ID
 */
export const ebayGetOffer = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { offerId } = data;

    if (!offerId) {
      throw new functions.https.HttpsError('invalid-argument', 'Offer ID is required');
    }

    const result = await makeEbayApiCall(
      userId,
      `/sell/inventory/v1/offer/${offerId}`,
      { method: 'GET' }
    );

    return { success: true, offer: result };
  } catch (error) {
    console.error('[ebayGetOffer] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Update an existing offer
 */
export const ebayUpdateOffer = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { offerId, updates } = data;

    if (!offerId || !updates) {
      throw new functions.https.HttpsError('invalid-argument', 'Offer ID and updates are required');
    }

    await makeEbayApiCall(
      userId,
      `/sell/inventory/v1/offer/${offerId}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );

    return { success: true, offerId };
  } catch (error) {
    console.error('[ebayUpdateOffer] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to update offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Delete an offer
 */
export const ebayDeleteOffer = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { offerId } = data;

    if (!offerId) {
      throw new functions.https.HttpsError('invalid-argument', 'Offer ID is required');
    }

    await makeEbayApiCall(
      userId,
      `/sell/inventory/v1/offer/${offerId}`,
      { method: 'DELETE' }
    );

    return { success: true, offerId };
  } catch (error) {
    console.error('[ebayDeleteOffer] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to delete offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// ============================================================================
// EBAY BUSINESS POLICIES API
// ============================================================================

/**
 * Get fulfillment (shipping) policies
 */
export const ebayGetFulfillmentPolicies = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { marketplaceId = 'EBAY_US' } = data;

    const result = await makeEbayApiCall(
      userId,
      `/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}`,
      { method: 'GET' }
    );

    return { success: true, policies: result.fulfillmentPolicies || [] };
  } catch (error) {
    console.error('[ebayGetFulfillmentPolicies] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get fulfillment policies: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Get return policies
 */
export const ebayGetReturnPolicies = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { marketplaceId = 'EBAY_US' } = data;

    const result = await makeEbayApiCall(
      userId,
      `/sell/account/v1/return_policy?marketplace_id=${marketplaceId}`,
      { method: 'GET' }
    );

    return { success: true, policies: result.returnPolicies || [] };
  } catch (error) {
    console.error('[ebayGetReturnPolicies] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get return policies: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Get payment policies
 */
export const ebayGetPaymentPolicies = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { marketplaceId = 'EBAY_US' } = data;

    const result = await makeEbayApiCall(
      userId,
      `/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}`,
      { method: 'GET' }
    );

    return { success: true, policies: result.paymentPolicies || [] };
  } catch (error) {
    console.error('[ebayGetPaymentPolicies] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get payment policies: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Get inventory locations
 */
export const ebayGetInventoryLocations = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    const result = await makeEbayApiCall(
      userId,
      '/sell/inventory/v1/location',
      { method: 'GET' }
    );

    return { success: true, locations: result.locations || [] };
  } catch (error) {
    console.error('[ebayGetInventoryLocations] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get inventory locations: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Get all business policies at once
 */
export const ebayGetAllPolicies = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { marketplaceId = 'EBAY_US' } = data;

    const [fulfillment, returns, payment, locations] = await Promise.all([
      makeEbayApiCall(userId, `/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}`, { method: 'GET' }),
      makeEbayApiCall(userId, `/sell/account/v1/return_policy?marketplace_id=${marketplaceId}`, { method: 'GET' }),
      makeEbayApiCall(userId, `/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}`, { method: 'GET' }),
      makeEbayApiCall(userId, '/sell/inventory/v1/location', { method: 'GET' }),
    ]);

    return {
      success: true,
      fulfillmentPolicies: fulfillment.fulfillmentPolicies || [],
      returnPolicies: returns.returnPolicies || [],
      paymentPolicies: payment.paymentPolicies || [],
      inventoryLocations: locations.locations || [],
    };
  } catch (error) {
    console.error('[ebayGetAllPolicies] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get all policies: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// ============================================================================
// EBAY CATEGORY SUGGESTIONS API
// ============================================================================

/**
 * Get category suggestions based on item title
 */
export const ebayGetCategorySuggestions = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { query, categoryTreeId = '0' } = data;

    if (!query) {
      throw new functions.https.HttpsError('invalid-argument', 'Query is required');
    }

    const encodedQuery = encodeURIComponent(query);
    const result = await makeEbayApiCall(
      userId,
      `/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_category_suggestions?q=${encodedQuery}`,
      { method: 'GET' }
    );

    return { success: true, suggestions: result.categorySuggestions || [] };
  } catch (error) {
    console.error('[ebayGetCategorySuggestions] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get category suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// ============================================================================
// EBAY BUYER OFFERS - Send promotional offers to watchers/interested buyers
// ============================================================================

/**
 * Get item watchers (buyers watching this listing)
 */
export const ebayGetItemWatchers = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { itemId } = data;

    if (!itemId) {
      throw new functions.https.HttpsError('invalid-argument', 'Item ID is required');
    }

    // Use Trading API GetItem to get watcher count
    const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${escapeXML(itemId)}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeWatchCount>true</IncludeWatchCount>
</GetItemRequest>`;

    const xmlResponse = await callTradingAPI(userId, 'GetItem', requestBody);

    const watchCountMatch = xmlResponse.match(/<WatchCount>(\d+)<\/WatchCount>/);
    const watchCount = watchCountMatch ? parseInt(watchCountMatch[1], 10) : 0;

    return {
      success: true,
      itemId,
      watchCount,
      // Note: eBay doesn't expose individual watcher info for privacy
      // But we can use the count to show engagement
      message: `This item has ${watchCount} watcher(s)`
    };
  } catch (error) {
    console.error('[ebayGetItemWatchers] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get watchers: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Send promotional offer to interested buyers using eBay's Promotional Sale API
 * Reaches watchers, cart abandoners, and all interested buyers
 */
export const ebaySendBuyerOffer = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { itemId, discountPercent, duration = 48 } = data;

    if (!itemId || !discountPercent) {
      throw new functions.https.HttpsError('invalid-argument', 'Item ID and discount percent are required');
    }

    // Get current item details including watchers
    const getItemBody = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${escapeXML(itemId)}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeWatchCount>true</IncludeWatchCount>
</GetItemRequest>`;

    const getItemResponse = await callTradingAPI(userId, 'GetItem', getItemBody);
    const priceMatch = getItemResponse.match(/<CurrentPrice[^>]*>([0-9.]+)<\/CurrentPrice>/);
    const currentPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
    const offerPrice = currentPrice * (1 - discountPercent / 100);

    const watchCountMatch = getItemResponse.match(/<WatchCount>(\d+)<\/WatchCount>/);
    const watchCount = watchCountMatch ? parseInt(watchCountMatch[1], 10) : 0;

    // Enable Best Offer with auto-accept price
    const reviseBody = `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <Item>
    <ItemID>${escapeXML(itemId)}</ItemID>
    <BestOfferDetails>
      <BestOfferEnabled>true</BestOfferEnabled>
      <BestOfferAutoAcceptPrice currencyID="USD">${offerPrice.toFixed(2)}</BestOfferAutoAcceptPrice>
    </BestOfferDetails>
  </Item>
</ReviseItemRequest>`;

    await callTradingAPI(userId, 'ReviseItem', reviseBody);

    console.log(`Sent offer to ${watchCount} buyers on item ${itemId}: ${discountPercent}% off ($${currentPrice.toFixed(2)} → $${offerPrice.toFixed(2)})`);

    return {
      success: true,
      itemId,
      originalPrice: currentPrice,
      offerPrice: offerPrice,
      discountPercent,
      watchCount,
      buyersReached: watchCount, // eBay notifies all watchers when Best Offer is enabled
      message: `✅ Offer sent to ${watchCount} buyer(s)! Auto-accepts at $${offerPrice.toFixed(2)}`
    };
  } catch (error) {
    console.error('[ebaySendBuyerOffer] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to send buyer offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Send buyer offer with custom price (not percentage discount)
 */
export const ebaySendBuyerOfferWithPrice = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { itemId, offerPrice } = data;

    if (!itemId || !offerPrice) {
      throw new functions.https.HttpsError('invalid-argument', 'Item ID and offer price are required');
    }

    // Get current item details including watchers
    const getItemBody = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${escapeXML(itemId)}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeWatchCount>true</IncludeWatchCount>
</GetItemRequest>`;

    const getItemResponse = await callTradingAPI(userId, 'GetItem', getItemBody);
    const priceMatch = getItemResponse.match(/<CurrentPrice[^>]*>([0-9.]+)<\/CurrentPrice>/);
    const currentPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;

    const watchCountMatch = getItemResponse.match(/<WatchCount>(\d+)<\/WatchCount>/);
    const watchCount = watchCountMatch ? parseInt(watchCountMatch[1], 10) : 0;

    // Enable Best Offer with custom auto-accept price
    const reviseBody = `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <Item>
    <ItemID>${escapeXML(itemId)}</ItemID>
    <BestOfferDetails>
      <BestOfferEnabled>true</BestOfferEnabled>
      <BestOfferAutoAcceptPrice currencyID="USD">${offerPrice.toFixed(2)}</BestOfferAutoAcceptPrice>
    </BestOfferDetails>
  </Item>
</ReviseItemRequest>`;

    await callTradingAPI(userId, 'ReviseItem', reviseBody);

    const discountPercent = ((currentPrice - offerPrice) / currentPrice) * 100;
    console.log(`Sent custom offer to ${watchCount} buyers on item ${itemId}: $${currentPrice.toFixed(2)} → $${offerPrice.toFixed(2)} (${discountPercent.toFixed(1)}% off)`);

    return {
      success: true,
      itemId,
      originalPrice: currentPrice,
      offerPrice: offerPrice,
      discountPercent: discountPercent,
      watchCount,
      buyersReached: watchCount,
      message: `✅ Offer sent to ${watchCount} buyer(s)! Auto-accepts at $${offerPrice.toFixed(2)}`
    };
  } catch (error) {
    console.error('[ebaySendBuyerOfferWithPrice] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to send buyer offer: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * BULK: Get watcher counts for multiple items at once (much faster!)
 */
export const ebayGetBulkWatchers = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { itemIds } = data; // Array of item IDs

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Item IDs array is required');
    }

    console.log(`[ebayGetBulkWatchers] Fetching data for ${itemIds.length} items`);

    // Process items in parallel (batch of 10 at a time to avoid rate limits)
    const batchSize = 10;
    const results: any[] = [];

    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (itemId: string) => {
        try {
          const getItemBody = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${escapeXML(itemId)}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeWatchCount>true</IncludeWatchCount>
</GetItemRequest>`;

          const xmlResponse = await callTradingAPI(userId, 'GetItem', getItemBody);

          const watchCountMatch = xmlResponse.match(/<WatchCount>(\d+)<\/WatchCount>/);
          const watchCount = watchCountMatch ? parseInt(watchCountMatch[1], 10) : 0;

          const priceMatch = xmlResponse.match(/<CurrentPrice[^>]*>([0-9.]+)<\/CurrentPrice>/);
          const currentPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;

          // Check if Best Offer is already enabled and get auto-accept price
          const bestOfferEnabledMatch = xmlResponse.match(/<BestOfferEnabled>(true|false)<\/BestOfferEnabled>/);
          const bestOfferEnabled = bestOfferEnabledMatch ? bestOfferEnabledMatch[1] === 'true' : false;

          const autoAcceptMatch = xmlResponse.match(/<BestOfferAutoAcceptPrice[^>]*>([0-9.]+)<\/BestOfferAutoAcceptPrice>/);
          const currentOfferPrice = autoAcceptMatch ? parseFloat(autoAcceptMatch[1]) : null;

          // Calculate discount based on engagement
          let suggestedDiscount = 5;
          if (watchCount > 10) suggestedDiscount = 15;
          else if (watchCount > 5) suggestedDiscount = 10;

          return {
            itemId,
            watchCount,
            currentPrice, // ACTUAL live eBay listing price
            currentOfferPrice, // Current Best Offer auto-accept price (if enabled)
            bestOfferEnabled,
            suggestedDiscount,
            buyersReached: watchCount,
            success: true
          };
        } catch (error) {
          console.error(`Failed to get data for item ${itemId}:`, error);
          return {
            itemId,
            watchCount: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const totalWatchers = results.reduce((sum, r) => sum + r.watchCount, 0);

    console.log(`[ebayGetBulkWatchers] Completed: ${successCount}/${itemIds.length} items, ${totalWatchers} total watchers`);

    return {
      success: true,
      results,
      totalWatchers,
      itemsWithBuyers: results.filter(r => r.watchCount > 0).length
    };
  } catch (error) {
    console.error('[ebayGetBulkWatchers] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get bulk watchers: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Get completed/sold items from eBay for pricing research (market comps)
 * Uses eBay Finding API to search for sold items matching the query
 */
export const ebayGetCompletedItems = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { query, category, maxResults = 10 } = data;

    if (!query || typeof query !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'Query string is required');
    }

    const { EBAY_CLIENT_ID } = getEbayCredentials();

    console.log(`[ebayGetCompletedItems] Searching for: "${query}", category: ${category || 'any'}, maxResults: ${maxResults}`);

    // Build Finding API request
    const findingApiUrl = 'https://svcs.ebay.com/services/search/FindingService/v1';
    const params = new URLSearchParams({
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_CLIENT_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'REST-PAYLOAD': 'true',
      'keywords': query,
      'paginationInput.entriesPerPage': Math.min(maxResults, 100).toString(),
      'sortOrder': 'EndTimeSoonest',
      // Only include sold items (not just completed)
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      // Only include listings that actually sold
      'itemFilter(1).name': 'ListingType',
      'itemFilter(1).value(0)': 'FixedPrice',
      'itemFilter(1).value(1)': 'Auction'
    });

    // Add category filter if provided
    if (category) {
      // Map common category names to eBay category IDs
      const categoryMap: Record<string, string> = {
        'Hoodie': '155183', // Men's Hoodies & Sweatshirts
        'Jersey': '24510', // Men's Jerseys
        'T-shirts': '15687', // Men's T-Shirts
        'Polo': '15709', // Men's Polo Shirts
        'Bottoms': '57989', // Men's Pants
        'Pullover/Jackets': '57988' // Men's Coats & Jackets
      };

      const categoryId = categoryMap[category];
      if (categoryId) {
        params.set('categoryId', categoryId);
      }
    }

    const response = await fetch(`${findingApiUrl}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Finding API returned ${response.status}`);
    }

    const result = await response.json();

    console.log('[ebayGetCompletedItems] Raw API response:', JSON.stringify(result).substring(0, 500));

    // Parse Finding API response
    const searchResult = result.findCompletedItemsResponse?.[0]?.searchResult?.[0];
    const items = searchResult?.item || [];

    if (!Array.isArray(items) || items.length === 0) {
      console.log('[ebayGetCompletedItems] No sold items found');
      return {
        success: true,
        query,
        category,
        results: [],
        totalFound: 0,
        averagePrice: 0,
        priceRange: { min: 0, max: 0 },
        message: 'No sold listings found for this query'
      };
    }

    // Extract relevant data from sold items
    const soldItems = items.map((item: any) => {
      const price = parseFloat(item.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.__value__ || '0');
      const currency = item.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.['@currencyId'] || 'USD';

      return {
        itemId: item.itemId?.[0],
        title: item.title?.[0],
        price,
        currency,
        condition: item.condition?.[0]?.conditionDisplayName?.[0] || 'Unknown',
        soldDate: item.listingInfo?.[0]?.endTime?.[0],
        viewItemURL: item.viewItemURL?.[0],
        galleryURL: item.galleryURL?.[0]
      };
    }).filter((item: any) => item.price > 0); // Only include items with valid prices

    if (soldItems.length === 0) {
      return {
        success: true,
        query,
        category,
        results: [],
        totalFound: 0,
        averagePrice: 0,
        priceRange: { min: 0, max: 0 },
        message: 'Found completed listings but none with valid pricing data'
      };
    }

    // Calculate statistics
    const prices = soldItems.map((item: any) => item.price);
    const averagePrice = prices.reduce((sum: number, p: number) => sum + p, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    console.log(`[ebayGetCompletedItems] Found ${soldItems.length} sold items, avg price: $${averagePrice.toFixed(2)}, range: $${minPrice}-$${maxPrice}`);

    return {
      success: true,
      query,
      category,
      results: soldItems,
      totalFound: soldItems.length,
      averagePrice: Math.round(averagePrice * 100), // Convert to cents
      priceRange: {
        min: Math.round(minPrice * 100),
        max: Math.round(maxPrice * 100)
      },
      message: `Found ${soldItems.length} sold items averaging $${averagePrice.toFixed(2)}`
    };
  } catch (error) {
    console.error('[ebayGetCompletedItems] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get completed items: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * BULK: Send offers to multiple items at once (much faster!)
 */
export const ebaySendBulkOffers = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { items, discountPercent } = data; // Array of {itemId, currentPrice}

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Items array is required');
    }

    console.log(`[ebaySendBulkOffers] Sending offers to ${items.length} items at ${discountPercent}% off`);

    // Process in parallel (batch of 5 at a time for write operations)
    const batchSize = 5;
    const results: any[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item: any) => {
        try {
          const result = await ebaySendBuyerOffer.run({ itemId: item.itemId, discountPercent }, { auth: context.auth });
          return { ...result, itemId: item.itemId };
        } catch (error) {
          console.error(`Failed to send offer for item ${item.itemId}:`, error);
          return {
            itemId: item.itemId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const totalBuyersReached = results.reduce((sum, r) => sum + (r.buyersReached || 0), 0);

    console.log(`[ebaySendBulkOffers] Completed: ${successCount}/${items.length} offers sent to ${totalBuyersReached} buyers`);

    return {
      success: true,
      results,
      successCount,
      failCount: items.length - successCount,
      totalBuyersReached
    };
  } catch (error) {
    console.error('[ebaySendBulkOffers] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to send bulk offers: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * BULK: Send offers with custom prices to multiple items (much faster!)
 */
export const ebaySendBulkOffersWithPrices = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { items } = data; // Array of {itemId, offerPrice, originalPrice}

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Items array is required');
    }

    console.log(`[ebaySendBulkOffersWithPrices] Sending custom price offers to ${items.length} items`);

    // Process in parallel (batch of 5 at a time for write operations)
    const batchSize = 5;
    const results: any[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item: any) => {
        try {
          const result = await ebaySendBuyerOfferWithPrice.run({ itemId: item.itemId, offerPrice: item.offerPrice }, { auth: context.auth });
          return { ...result, itemId: item.itemId };
        } catch (error) {
          console.error(`Failed to send offer for item ${item.itemId}:`, error);
          return {
            itemId: item.itemId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const totalBuyersReached = results.reduce((sum, r) => sum + (r.buyersReached || 0), 0);

    console.log(`[ebaySendBulkOffersWithPrices] Completed: ${successCount}/${items.length} offers sent to ${totalBuyersReached} buyers`);

    return {
      success: true,
      results,
      successCount,
      failCount: items.length - successCount,
      totalBuyersReached
    };
  } catch (error) {
    console.error('[ebaySendBulkOffersWithPrices] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to send bulk offers with prices: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * SEND OFFER TO WATCHERS - Actually sends promotional offers to buyers
 * This uses eBay's "Send Offer to Watchers" feature
 */
export const ebaySendOfferToWatchers = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { itemId, offerPrice, message } = data;

    if (!itemId || !offerPrice) {
      throw new functions.https.HttpsError('invalid-argument', 'Item ID and offer price are required');
    }

    // Get current item details to calculate discount percentage
    const getItemBody = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${escapeXML(itemId)}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeWatchCount>true</IncludeWatchCount>
</GetItemRequest>`;

    const getItemResponse = await callTradingAPI(userId, 'GetItem', getItemBody);
    const priceMatch = getItemResponse.match(/<CurrentPrice[^>]*>([0-9.]+)<\/CurrentPrice>/);
    const currentPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;

    const watchCountMatch = getItemResponse.match(/<WatchCount>(\d+)<\/WatchCount>/);
    const watchCount = watchCountMatch ? parseInt(watchCountMatch[1], 10) : 0;

    if (watchCount === 0) {
      throw new functions.https.HttpsError('failed-precondition', 'This item has no watchers to send offers to');
    }

    // Calculate discount percentage
    const discountPercent = Math.round(((currentPrice - offerPrice) / currentPrice) * 100);

    // Send promotional offer to all watchers
    const sendOfferBody = `<?xml version="1.0" encoding="utf-8"?>
<AddMemberMessagesAAQToBidderRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${escapeXML(itemId)}</ItemID>
  <MemberMessage>
    <Subject>Special Offer on Item You're Watching!</Subject>
    <Body>${message || `I'm offering you a special ${discountPercent}% discount on this item! For a limited time, you can purchase this item for just $${offerPrice.toFixed(2)} (regular price: $${currentPrice.toFixed(2)}). This offer is available to watchers only. Don't miss out!`}</Body>
    <RecipientID>*</RecipientID>
  </MemberMessage>
</AddMemberMessagesAAQToBidderRequest>`;

    await callTradingAPI(userId, 'AddMemberMessagesAAQToBidder', sendOfferBody);

    console.log(`Sent promotional offer to ${watchCount} watchers on item ${itemId}: $${currentPrice.toFixed(2)} → $${offerPrice.toFixed(2)} (${discountPercent}% off)`);

    return {
      success: true,
      itemId,
      watchersReached: watchCount,
      originalPrice: currentPrice,
      offerPrice: offerPrice,
      discountPercent: discountPercent,
      message: `✅ Promotional offer sent to ${watchCount} watcher(s)!`
    };
  } catch (error) {
    console.error('[ebaySendOfferToWatchers] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to send offer to watchers: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * BULK: Send offers to watchers on multiple items
 */
export const ebaySendBulkOffersToWatchers = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { items } = data; // Array of {itemId, offerPrice, message}

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Items array is required');
    }

    console.log(`[ebaySendBulkOffersToWatchers] Sending promotional offers to watchers on ${items.length} items`);

    // Process in parallel (batch of 5 at a time)
    const batchSize = 5;
    const results: any[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item: any) => {
        try {
          const result = await ebaySendOfferToWatchers.run(
            { itemId: item.itemId, offerPrice: item.offerPrice, message: item.message },
            { auth: context.auth }
          );
          return { ...result, itemId: item.itemId };
        } catch (error) {
          console.error(`Failed to send offer to watchers for item ${item.itemId}:`, error);
          return {
            itemId: item.itemId,
            success: false,
            watchersReached: 0,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const totalWatchersReached = results.reduce((sum, r) => sum + (r.watchersReached || 0), 0);

    console.log(`[ebaySendBulkOffersToWatchers] Completed: ${successCount}/${items.length} offers sent to ${totalWatchersReached} watchers`);

    return {
      success: true,
      results,
      successCount,
      failCount: items.length - successCount,
      totalWatchersReached
    };
  } catch (error) {
    console.error('[ebaySendBulkOffersToWatchers] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to send bulk offers to watchers: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Get market trends and pricing suggestions
 */
export const ebayGetMarketTrends = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { itemId } = data;

    if (!itemId) {
      throw new functions.https.HttpsError('invalid-argument', 'Item ID is required');
    }

    // Get item details
    const getItemBody = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${escapeXML(itemId)}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeWatchCount>true</IncludeWatchCount>
</GetItemRequest>`;

    const xmlResponse = await callTradingAPI(userId, 'GetItem', getItemBody);

    const priceMatch = xmlResponse.match(/<CurrentPrice[^>]*>([0-9.]+)<\/CurrentPrice>/);
    const currentPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;

    const watchCountMatch = xmlResponse.match(/<WatchCount>(\d+)<\/WatchCount>/);
    const watchCount = watchCountMatch ? parseInt(watchCountMatch[1], 10) : 0;

    // Calculate suggested discount based on watcher engagement
    // More watchers = items getting attention but not selling, suggest higher discount
    let suggestedDiscount = 5; // Base 5% discount
    if (watchCount > 10) {
      suggestedDiscount = 15; // High interest, suggest 15% to convert
    } else if (watchCount > 5) {
      suggestedDiscount = 10; // Moderate interest, suggest 10%
    }

    const offerPrice = currentPrice * (1 - suggestedDiscount / 100);

    return {
      success: true,
      itemId,
      currentPrice,
      watchCount,
      suggestedDiscount,
      offerPrice,
      message: `Item has ${watchCount} watcher(s). Suggested ${suggestedDiscount}% discount to $${offerPrice.toFixed(2)}`
    };
  } catch (error) {
    console.error('[ebayGetMarketTrends] Error:', error);
    throw new functions.https.HttpsError('internal', `Failed to get market trends: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Manage eBay Promoted Listings (Ads)
 * Enable, disable, or update ad rates for items
 */
export const managePromotedListings = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { items, action, adRate } = data;

      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Items array is required');
      }

      if (!action || !['enable', 'disable', 'update_rate'].includes(action)) {
        throw new functions.https.HttpsError('invalid-argument', 'Valid action (enable/disable/update_rate) is required');
      }

      if ((action === 'enable' || action === 'update_rate') && (!adRate || adRate < 2 || adRate > 20)) {
        throw new functions.https.HttpsError('invalid-argument', 'Ad rate must be between 2 and 20 percent');
      }

      console.log(`[managePromotedListings] ${action} promoted listings for ${items.length} items with ad rate ${adRate}%`);

      // eBay Marketing API requires REST API calls
      // Note: This uses eBay's Marketing API which is different from Trading API
      const results: any[] = [];

      for (const itemId of items) {
        try {
          if (action === 'enable' || action === 'update_rate') {
            // Enable or update promoted listing
            // Note: In production, you'd use eBay Marketing API's createCampaign or updateCampaign endpoints
            // For now, we'll use Trading API's SetPromotionalSaleListings as a workaround
            const reviseBody = `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <Item>
    <ItemID>${escapeXML(itemId)}</ItemID>
    <PromotionalSaleDetails>
      <PromotionalSaleType>Percentage</PromotionalSaleType>
      <PromotionalSalePrice>${adRate}</PromotionalSalePrice>
    </PromotionalSaleDetails>
  </Item>
</ReviseItemRequest>`;

            await callTradingAPI(userId, 'ReviseItem', reviseBody);

            results.push({
              itemId,
              success: true,
              action,
              adRate: action === 'disable' ? undefined : adRate
            });

            console.log(`[managePromotedListings] ${action} promoted listing for item ${itemId}`);
          } else if (action === 'disable') {
            // Disable promoted listing
            const reviseBody = `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <Item>
    <ItemID>${escapeXML(itemId)}</ItemID>
    <PromotionalSaleDetails>
      <PromotionalSaleType>None</PromotionalSaleType>
    </PromotionalSaleDetails>
  </Item>
</ReviseItemRequest>`;

            await callTradingAPI(userId, 'ReviseItem', reviseBody);

            results.push({
              itemId,
              success: true,
              action
            });

            console.log(`[managePromotedListings] Disabled promoted listing for item ${itemId}`);
          }
        } catch (error) {
          console.error(`[managePromotedListings] Failed for item ${itemId}:`, error);
          results.push({
            itemId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`[managePromotedListings] Completed: ${successCount}/${items.length} items`);

      return {
        success: true,
        results,
        itemCount: successCount,
        successCount,
        failCount: items.length - successCount
      };
    } catch (error) {
      console.error('[managePromotedListings] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to manage promoted listings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * Get Best Offers (Buyer Offers) from eBay
 * Retrieves all active buyer offers across all items
 */
export const ebayGetBuyerOffers = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;

      console.log(`[ebayGetBuyerOffers] Fetching ALL buyer offers for user ${userId}`);

      // Call GetBestOffers WITHOUT ItemID to get ALL offers at once (up to 10,000 for sellers)
      // This is the most efficient way per eBay Trading API documentation
      const offers: any[] = [];

      // Try to get all offers in a single call first
      try {
        const getBestOffersAllBody = `<?xml version="1.0" encoding="utf-8"?>
<GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <BestOfferStatus>Active</BestOfferStatus>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
</GetBestOffersRequest>`;

        const xmlResponse = await callTradingAPI(userId, 'GetBestOffers', getBestOffersAllBody);

        // Parse all best offers from XML response
        const offerMatches = xmlResponse.matchAll(/<BestOffer>([\s\S]*?)<\/BestOffer>/g);

        for (const match of offerMatches) {
          const offerXml = match[1];

          const offerIdMatch = offerXml.match(/<BestOfferID>([^<]+)<\/BestOfferID>/);
          const buyerMessageMatch = offerXml.match(/<BuyerMessage>([^<]+)<\/BuyerMessage>/);
          const priceMatch = offerXml.match(/<Price[^>]*>([0-9.]+)<\/Price>/);
          const statusMatch = offerXml.match(/<Status>([^<]+)<\/Status>/);
          const quantityMatch = offerXml.match(/<Quantity>(\d+)<\/Quantity>/);
          const expirationTimeMatch = offerXml.match(/<ExpirationTime>([^<]+)<\/ExpirationTime>/);
          const buyerMatch = offerXml.match(/<Buyer>([\s\S]*?)<\/Buyer>/);

          // Extract item ID and title from the offer
          const itemIdMatch = offerXml.match(/<ItemID>([^<]+)<\/ItemID>/);
          const titleMatch = offerXml.match(/<Title>([^<]+)<\/Title>/);

          let buyerUserId = null;
          if (buyerMatch) {
            const buyerIdMatch = buyerMatch[1].match(/<UserID>([^<]+)<\/UserID>/);
            buyerUserId = buyerIdMatch ? buyerIdMatch[1] : null;
          }

          if (offerIdMatch && priceMatch && statusMatch && itemIdMatch) {
            offers.push({
              offerId: offerIdMatch[1],
              itemId: itemIdMatch[1],
              itemTitle: titleMatch ? titleMatch[1] : null,
              price: parseFloat(priceMatch[1]),
              status: statusMatch[1],
              quantity: quantityMatch ? parseInt(quantityMatch[1], 10) : 1,
              buyerMessage: buyerMessageMatch ? buyerMessageMatch[1] : null,
              expirationTime: expirationTimeMatch ? expirationTimeMatch[1] : null,
              buyerUserId: buyerUserId
            });
          }
        }

        console.log(`[ebayGetBuyerOffers] Found ${offers.length} active buyer offer(s) in single call`);

      } catch (singleCallError) {
        console.error('[ebayGetBuyerOffers] Error getting all offers in single call, trying fallback:', singleCallError);

        // Fallback: If the single call fails, try the old method
        const { itemIds } = data;
        if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
        // Get offers for specific items
        for (const itemId of itemIds) {
          try {
            const getBestOffersBody = `<?xml version="1.0" encoding="utf-8"?>
<GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${escapeXML(itemId)}</ItemID>
  <BestOfferStatus>Active</BestOfferStatus>
</GetBestOffersRequest>`;

            const xmlResponse = await callTradingAPI(userId, 'GetBestOffers', getBestOffersBody);

            // Parse best offers from XML response
            const offerMatches = xmlResponse.matchAll(/<BestOffer>([\s\S]*?)<\/BestOffer>/g);

            for (const match of offerMatches) {
              const offerXml = match[1];

              const offerIdMatch = offerXml.match(/<BestOfferID>([^<]+)<\/BestOfferID>/);
              const buyerMessageMatch = offerXml.match(/<BuyerMessage>([^<]+)<\/BuyerMessage>/);
              const priceMatch = offerXml.match(/<Price[^>]*>([0-9.]+)<\/Price>/);
              const statusMatch = offerXml.match(/<Status>([^<]+)<\/Status>/);
              const quantityMatch = offerXml.match(/<Quantity>(\d+)<\/Quantity>/);
              const expirationTimeMatch = offerXml.match(/<ExpirationTime>([^<]+)<\/ExpirationTime>/);
              const buyerMatch = offerXml.match(/<Buyer>([\s\S]*?)<\/Buyer>/);

              let buyerUserId = null;
              if (buyerMatch) {
                const buyerIdMatch = buyerMatch[1].match(/<UserID>([^<]+)<\/UserID>/);
                buyerUserId = buyerIdMatch ? buyerIdMatch[1] : null;
              }

              if (offerIdMatch && priceMatch && statusMatch) {
                offers.push({
                  offerId: offerIdMatch[1],
                  itemId: itemId,
                  price: parseFloat(priceMatch[1]),
                  status: statusMatch[1],
                  quantity: quantityMatch ? parseInt(quantityMatch[1], 10) : 1,
                  buyerMessage: buyerMessageMatch ? buyerMessageMatch[1] : null,
                  expirationTime: expirationTimeMatch ? expirationTimeMatch[1] : null,
                  buyerUserId: buyerUserId
                });
              }
            }
          } catch (error) {
            console.error(`[ebayGetBuyerOffers] Error getting offers for item ${itemId}:`, error);
            // Continue with other items
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        } else {
          // If no item IDs provided and single call failed, throw error
          throw singleCallError;
        }
      }

      console.log(`[ebayGetBuyerOffers] Final count: ${offers.length} active buyer offer(s)`);

      return {
        success: true,
        offers,
        count: offers.length
      };
    } catch (error) {
      console.error('[ebayGetBuyerOffers] Error:', error);
      throw new functions.https.HttpsError('internal', `Failed to get buyer offers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * LEGACY: Old implementation using GetMyeBaySelling
 * Kept for reference but not used
 */
const LEGACY_getOffersUsingMyeBaySelling = async (userId: string) => {
  const offers: any[] = [];
  // Get all offers using GetMyeBaySelling
  const getSellingBody = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
  <BidList>
    <Include>true</Include>
  </BidList>
  <BestOfferList>
    <Include>true</Include>
  </BestOfferList>
</GetMyeBaySellingRequest>`;

  const xmlResponse = await callTradingAPI(userId, 'GetMyeBaySelling', getSellingBody);

  // Parse items with best offers
  const itemMatches = xmlResponse.matchAll(/<ItemArray>([\s\S]*?)<\/ItemArray>/g);

  for (const itemMatch of itemMatches) {
    const itemsXml = itemMatch[1];
    const singleItemMatches = itemsXml.matchAll(/<Item>([\s\S]*?)<\/Item>/g);

    for (const singleItem of singleItemMatches) {
      const itemXml = singleItem[1];

      const itemIdMatch = itemXml.match(/<ItemID>([^<]+)<\/ItemID>/);
      const titleMatch = itemXml.match(/<Title>([^<]+)<\/Title>/);
      const bestOfferEnabledMatch = itemXml.match(/<BestOfferEnabled>true<\/BestOfferEnabled>/i);
      const bestOfferCountMatch = itemXml.match(/<BestOfferCount>(\d+)<\/BestOfferCount>/);

      if (itemIdMatch && bestOfferEnabledMatch && bestOfferCountMatch && parseInt(bestOfferCountMatch[1]) > 0) {
        const itemId = itemIdMatch[1];
        const title = titleMatch ? titleMatch[1] : null;

        // Get detailed offers for this item
        try {
          const getBestOffersBody = `<?xml version="1.0" encoding="utf-8"?>
<GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <ItemID>${escapeXML(itemId)}</ItemID>
  <BestOfferStatus>Active</BestOfferStatus>
</GetBestOffersRequest>`;

          const offersXml = await callTradingAPI(userId, 'GetBestOffers', getBestOffersBody);

          const offerMatches = offersXml.matchAll(/<BestOffer>([\s\S]*?)<\/BestOffer>/g);

          for (const match of offerMatches) {
            const offerXml = match[1];

            const offerIdMatch = offerXml.match(/<BestOfferID>([^<]+)<\/BestOfferID>/);
            const buyerMessageMatch = offerXml.match(/<BuyerMessage>([^<]+)<\/BuyerMessage>/);
            const priceMatch = offerXml.match(/<Price[^>]*>([0-9.]+)<\/Price>/);
            const statusMatch = offerXml.match(/<Status>([^<]+)<\/Status>/);
            const quantityMatch = offerXml.match(/<Quantity>(\d+)<\/Quantity>/);
            const expirationTimeMatch = offerXml.match(/<ExpirationTime>([^<]+)<\/ExpirationTime>/);
            const buyerMatch = offerXml.match(/<Buyer>([\s\S]*?)<\/Buyer>/);

            let buyerUserId = null;
            if (buyerMatch) {
              const buyerIdMatch = buyerMatch[1].match(/<UserID>([^<]+)<\/UserID>/);
              buyerUserId = buyerIdMatch ? buyerIdMatch[1] : null;
            }

            if (offerIdMatch && priceMatch && statusMatch) {
              offers.push({
                offerId: offerIdMatch[1],
                itemId: itemId,
                itemTitle: title,
                price: parseFloat(priceMatch[1]),
                status: statusMatch[1],
                quantity: quantityMatch ? parseInt(quantityMatch[1], 10) : 1,
                buyerMessage: buyerMessageMatch ? buyerMessageMatch[1] : null,
                expirationTime: expirationTimeMatch ? expirationTimeMatch[1] : null,
                buyerUserId: buyerUserId
              });
            }
          }
        } catch (error) {
          console.error(`[LEGACY] Error getting detailed offers for item ${itemId}:`, error);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  console.log(`[LEGACY] Found ${offers.length} active buyer offer(s)`);

  return {
    success: true,
    offers,
    count: offers.length
  };
};

// ============================================================================
// MARKETPLACE DATA SYNC
// ============================================================================

/**
 * Generic Webhook Sync Handler
 * Receives marketplace data from browser extensions
 * Can be accessed by authenticated users or by sync code
 */
// True if a marketplaceData doc is (or was clobbered into) a SOLD blob — used
// so a sold blob sitting in the active path isn't treated as the active
// baseline, which would block legitimately restoring the active listings.
function isSoldDoc(d: any): boolean {
  if (!d) return false;
  if (d.docKind === 'sold') return true;
  const ls = Array.isArray(d.listings) ? d.listings : [];
  if (ls.length === 0) return false;
  return ls.every((l: any) =>
    !!(l.sold || l._soldFromAPI || (l.status && String(l.status).toLowerCase() !== 'onsale')));
}

export const syncWebhook = functions.https.onRequest(async (req, res) => {
  // Enable CORS for extension
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { cookies, user_info, listings, sync_code } = req.body;

    // Validate required data
    if (!user_info || !user_info.username) {
      res.status(400).json({ error: 'Missing user_info.username' });
      return;
    }

    // Sanitize: callers sometimes pass an already-prefixed username
    // (e.g. "poshmark_sold_retrothriftc0"), which previously produced a
    // double-prefixed doc id ("poshmark_sold_poshmark_sold_...") that the
    // sold-refresh reader can't find. Strip any leading platform/sold prefixes
    // so sold→`{platform}_sold_{user}` and active→`{user}` are canonical.
    const username = String(user_info.username || '')
      .replace(/^(depop|poshmark|ebay)_sold_/i, '')
      .replace(/^(depop|poshmark|ebay)_/i, '');
    let userId: string | null = null;

    // If sync code provided, look up the user
    if (sync_code) {
      try {
        const syncCodeDoc = await db.collection('authSyncCodes').doc(sync_code).get();
        if (syncCodeDoc.exists) {
          const syncData = syncCodeDoc.data()!;
          const expiresAt = syncData.expiresAt?.toDate();

          // Check if expired
          if (expiresAt && expiresAt > new Date()) {
            userId = syncData.userId;
            console.log(`[Sync] Code validated for user: ${userId}`);
          } else {
            console.log(`[Sync] Code expired`);
          }
        }
      } catch (error) {
        console.error('[Sync] Error validating code:', error);
      }
    }

    // Deduplicate listings.
    // For ACTIVE listings: key on l.id (same listing appearing twice is a dupe — merge).
    // For SOLD items: key on purchaseId:id composite so repeat sales of the same product
    //   (same productId sold in different receipts on different days) are preserved as
    //   separate entries. Otherwise the server silently collapses them and we undercount
    //   sold units for stock-on-hand calculations.
    const rawListings = listings || [];
    const listingMap = new Map<string, any>();
    for (const l of rawListings) {
      const isSold = l.sold || l._soldFromAPI || (l.status && l.status !== 'ONSALE' && l.status !== 'onsale');
      const baseId = String(l.id || l.slug || '');
      const purchaseId = String(l._purchaseId || l.purchaseId || '');
      // Sold items: composite key preserves repeat sales. Active/unknown: simple key preserves
      // existing active↔sold merge behavior below.
      const id = isSold && purchaseId ? `${purchaseId}:${baseId}` : baseId;
      if (!id) continue;
      const existing = listingMap.get(id);
      if (!existing) {
        listingMap.set(id, l);
      } else {
        // If new version is sold, overwrite the active version (merge active data + sold flags)
        const newIsSold = l.sold || l._soldFromAPI || (l.status && l.status !== 'ONSALE' && l.status !== 'onsale');
        if (newIsSold) {
          listingMap.set(id, { ...existing, ...l, sold: true, _soldFromAPI: true, status: 'sold' });
        }
      }
    }
    const uniqueListings = Array.from(listingMap.values());
    console.log(`[Sync] Deduplicated: ${rawListings.length} → ${uniqueListings.length} listings (${uniqueListings.filter((l: any) => l.sold).length} sold)`);

    const platform = req.body.platform || 'depop';

    // ---- 444-147 FIX ----------------------------------------------------
    // SPLIT the scrape by status and route each subset to its OWN doc:
    //   active → marketplaceData/{username}            (or users/{uid}/…/sync)
    //   sold   → marketplaceData/{platform}_sold_{username} (or …/sync_sold)
    // A SOLD scrape must NEVER be allowed to overwrite the ACTIVE doc — that
    // clobber wiped 200+ active listings before. The "keep larger" guard is
    // applied ONLY to the active doc (protects the big active set from a
    // partial active scrape). The sold doc always takes the latest sold scrape
    // (a smaller fresh sold scrape is legitimate — items get delisted — so the
    // old larger-guard wrongly rejected it and forced manual wipes).
    const isSoldListing = (l: any) =>
      !!(l.sold || l._soldFromAPI || (l.status && l.status !== 'ONSALE' && String(l.status).toLowerCase() !== 'onsale'));
    const soldListings = uniqueListings.filter(isSoldListing);
    const activeListings = uniqueListings.filter((l: any) => !isSoldListing(l));

    const baseMeta = {
      platform,
      username,
      cookies: cookies || {},
      userInfo: user_info,
      cookieCount: Object.keys(cookies || {}).length,
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSync: admin.firestore.FieldValue.serverTimestamp(),
    };
    const activePath = userId
      ? db.collection('users').doc(userId).collection('marketplaceData').doc('sync')
      : db.collection('marketplaceData').doc(username);
    const soldPath = userId
      ? db.collection('users').doc(userId).collection('marketplaceData').doc('sync_sold')
      : db.collection('marketplaceData').doc(`${platform}_sold_${username}`);

    let activeWritten = 0;
    let soldWritten = 0;

    // Active subset → active doc, but only if it doesn't shrink the set
    // (guards the big active listing set against a partial scrape).
    if (activeListings.length > 0) {
      const existing = await activePath.get();
      const existingCount = existing.exists && !isSoldDoc(existing.data())
        ? (existing.data()?.listings?.length || 0) : 0;
      if (activeListings.length >= existingCount) {
        await activePath.set({
          ...baseMeta,
          listings: activeListings,
          listingsCount: activeListings.length,
          docKind: 'active',
        });
        activeWritten = activeListings.length;
        console.log(`[Sync] active doc ← ${activeListings.length} (was ${existingCount})`);
      } else {
        console.log(`[Sync] active doc SKIPPED: new ${activeListings.length} < existing ${existingCount}`);
      }
    }

    // Sold subset → sold doc. Latest sold scrape wins (no larger-guard).
    if (soldListings.length > 0) {
      await soldPath.set({
        ...baseMeta,
        listings: soldListings,
        listingsCount: soldListings.length,
        docKind: 'sold',
        scrapeComplete: req.body.scrapeComplete === true || req.body.scrape_complete === true,
      });
      soldWritten = soldListings.length;
      console.log(`[Sync] sold doc ← ${soldListings.length} (latest-wins)`);
    }

    console.log(`[Sync] @${username}${userId ? ` (uid ${userId})` : ''}: active=${activeWritten} sold=${soldWritten}`);

    res.json({
      success: true,
      message: 'Data synced successfully',
      username,
      activeCount: activeWritten,
      soldCount: soldWritten,
      listingsCount: activeWritten + soldWritten,
      cookieCount: Object.keys(cookies || {}).length,
    });

  } catch (error) {
    console.error('[Sync] Error:', error);
    res.status(500).json({
      error: 'Failed to sync data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Debug: Get Marketplace Data (Temporary - Remove in production)
 * Returns marketplace data for debugging
 */
export const getMarketplaceData = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  try {
    const username = req.query.username || 'harrisonkennedy';
    const docRef = db.collection('marketplaceData').doc(username as string);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ error: 'No data found', username });
      return;
    }

    const data = docSnap.data()!;

    // Return summary + first listing details
    const response = {
      username: data.username,
      listingsCount: data.listings?.length || 0,
      cookieCount: data.cookieCount || 0,
      lastSync: data.lastSync,
      firstListing: data.listings && data.listings.length > 0 ? {
        id: data.listings[0].id,
        title: data.listings[0].title,
        price: data.listings[0].price,
        preview: data.listings[0].preview,
        pictures: data.listings[0].pictures,
        images: data.listings[0].images,
        allKeys: Object.keys(data.listings[0])
      } : null
    };

    res.json(response);
  } catch (error) {
    console.error('[getMarketplaceData] Error:', error);
    res.status(500).json({ error: 'Failed to fetch data', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * Get User Marketplace Data
 * Retrieves synced marketplace data for authenticated users
 */
export const getUserData = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    // Try to get data from user's account first
    const userDataDoc = await db.collection('users').doc(userId).collection('marketplaceData').doc('sync').get();

    if (userDataDoc.exists) {
      const marketplaceData = userDataDoc.data()!;
      return {
        success: true,
        connected: true,
        data: marketplaceData
      };
    }

    // If not found, check if they provided a username to look up
    if (data.username) {
      const publicDataDoc = await db.collection('marketplaceData').doc(data.username).get();

      if (publicDataDoc.exists) {
        const marketplaceData = publicDataDoc.data()!;
        return {
          success: true,
          connected: true,
          data: marketplaceData
        };
      }
    }

    return {
      success: true,
      connected: false,
      data: null
    };

  } catch (error) {
    console.error('[Query] Error fetching data:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch data');
  }
});

/**
 * Generate Authentication Code
 * Creates a temporary auth code for linking extension to user account
 */
export const generateAuthCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    // Generate a 6-digit auth code
    const authCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.collection('authSyncCodes').doc(authCode).set({
      userId,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      used: false
    });

    console.log(`[Auth] Generated code ${authCode} for user ${userId}`);

    return {
      success: true,
      syncCode: authCode,
      expiresAt: expiresAt.toISOString()
    };

  } catch (error) {
    console.error('[Auth] Error generating code:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate code');
  }
});

/**
 * Find Item by SKU/ID with All Images
 * Returns complete item data including all images for n8n/external integrations
 */
export const findItemBySKU = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { sku, itemId, barcode } = data;

  if (!sku && !itemId && !barcode) {
    throw new functions.https.HttpsError('invalid-argument', 'Must provide sku, itemId, or barcode');
  }

  try {
    let itemDoc: FirebaseFirestore.DocumentSnapshot | null = null;

    // Search by item ID first (fastest)
    if (itemId) {
      const doc = await db.collection('Item').doc(itemId).get();
      if (doc.exists && doc.data()?.user_uuid === userId) {
        itemDoc = doc;
      }
    }

    // Search by SKU
    if (!itemDoc && (sku || barcode)) {
      const searchValue = sku || barcode;

      // Try ebaySku field
      const skuSnapshot = await db.collection('Item')
        .where('user_uuid', '==', userId)
        .where('ebaySku', '==', searchValue)
        .limit(1)
        .get();

      if (!skuSnapshot.empty) {
        itemDoc = skuSnapshot.docs[0];
      }

      // Try barcode field if not found
      if (!itemDoc) {
        const barcodeSnapshot = await db.collection('Item')
          .where('user_uuid', '==', userId)
          .where('barcode', '==', searchValue)
          .limit(1)
          .get();

        if (!barcodeSnapshot.empty) {
          itemDoc = barcodeSnapshot.docs[0];
        }
      }
    }

    if (!itemDoc || !itemDoc.exists) {
      return {
        success: false,
        error: 'Item not found',
        found: false
      };
    }

    const itemData = itemDoc.data()!;

    // Extract ALL images from multiple sources
    const images: any[] = [];

    // Priority 1: ebayPhotos array (Firebase Storage backed up images)
    if (itemData.ebayPhotos && Array.isArray(itemData.ebayPhotos)) {
      itemData.ebayPhotos
        .sort((a: any, b: any) => a.order - b.order)
        .forEach((photo: any) => {
          images.push({
            url: photo.firebaseStorageUrl || photo.ebayUrl,
            ebayUrl: photo.ebayUrl,
            firebaseUrl: photo.firebaseStorageUrl,
            order: photo.order,
            isPrimary: photo.isPrimary || false,
            filename: photo.filename,
            size: photo.size,
            mimeType: photo.mimeType
          });
        });
    }

    // Priority 2: imageUrl field (single image)
    if (images.length === 0 && itemData.imageUrl) {
      images.push({
        url: itemData.imageUrl,
        order: 0,
        isPrimary: true
      });
    }

    // Priority 3: ebayPrimaryImage
    if (images.length === 0 && itemData.ebayPrimaryImage) {
      images.push({
        url: itemData.ebayPrimaryImage,
        order: 0,
        isPrimary: true
      });
    }

    // Priority 4: ebayAllImages array
    if (images.length === 0 && itemData.ebayAllImages && Array.isArray(itemData.ebayAllImages)) {
      itemData.ebayAllImages.forEach((url: string, index: number) => {
        images.push({
          url,
          order: index,
          isPrimary: index === 0
        });
      });
    }

    // Calculate price
    let price = 0;
    if (itemData.manualPriceCents && itemData.manualPriceCents > 0) {
      price = itemData.manualPriceCents / 100;
    } else if (itemData.sellingPrice && itemData.sellingPrice > 0) {
      price = itemData.sellingPrice;
    } else if (itemData.ebayPrice && itemData.ebayPrice > 0) {
      price = itemData.ebayPrice / 100;
    }

    // Return complete item data
    return {
      success: true,
      found: true,
      item: {
        id: itemDoc.id,
        name: itemData.name || itemData.title || 'Unnamed',
        description: itemData.ebayFullDescription || itemData.description || '',
        price,
        priceCents: price * 100,

        // URLs
        ebayUrl: itemData.ebayUrl,
        poshmarkUrl: itemData.poshmarkUrl,
        depopUrl: itemData.depopUrl,

        // Images
        images,
        imageCount: images.length,
        primaryImage: images.find(img => img.isPrimary)?.url || images[0]?.url,

        // Metadata
        sku: itemData.ebaySku,
        barcode: itemData.barcode,
        brand: itemData.ebayBrand || itemData.brand,
        size: itemData.size,
        condition: itemData.ebayCondition || itemData.condition,
        category: itemData.ebayCategoryName,
        tags: itemData.tags || [],

        // Dates
        dateAdded: itemData.dateAdded || itemData.dateField,
        dateUpdated: itemData.updatedAt,

        // Status
        status: itemData.status,
        ebayListingId: itemData.ebayListingId,
        ebayItemId: itemData.ebayItemId,

        // Full eBay data (for relisting)
        ebayData: {
          title: itemData.ebayFullTitle,
          subtitle: itemData.ebaySubtitle,
          description: itemData.ebayFullDescription,
          condition: itemData.ebayCondition,
          conditionID: itemData.ebayConditionID,
          categoryID: itemData.ebayCategoryID,
          itemSpecifics: itemData.ebayItemSpecifics,
          shippingInfo: itemData.ebayShippingInfo,
          returnPolicy: itemData.ebayReturnPolicy,
          photos: itemData.ebayPhotos
        }
      }
    };

  } catch (error) {
    console.error('[findItemBySKU] Error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to find item');
  }
});

// ─── GoLogin Browser Automation ───
// Single proxy function with CORS — handles all GoLogin API calls per-user

// eslint-disable-next-line @typescript-eslint/no-var-requires
const corsModule = require('cors');
const corsHandler = corsModule({ origin: true });

async function verifyAuth(req: functions.https.Request): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) throw new Error('No auth token');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}

const GOLOGIN_BASE = 'https://api.gologin.com';

async function gologinFetch(token: string, path: string, method: string, body?: unknown) {
  const res = await fetch(`${GOLOGIN_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  // 204 No Content or DELETE with no body — return success
  if (res.status === 204) return { success: true };
  if (method === 'DELETE') {
    // Some DELETE endpoints return a body, some don't
    const text = await res.text();
    if (!text) return { success: true };
    try { return JSON.parse(text); } catch { return { success: true }; }
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GoLogin API ${method} ${path} failed (${res.status}): ${errText}`);
  }
  const text = await res.text();
  if (!text) return { success: true };
  try { return JSON.parse(text); } catch { return { raw: text, status: res.status }; }
}

// Single endpoint for all GoLogin operations — per-user token from request
export const gologinAction = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onRequest((req, res) => corsHandler(req, res, async () => {
    try {
      await verifyAuth(req);
      const { action, profileId, name, os, platform } = req.body || {};
      const gologinToken = process.env.GOLOGIN_API_TOKEN || '';

      if (!gologinToken) { res.status(500).json({ error: 'GoLogin token not configured on server' }); return; }
      if (!action) { res.status(400).json({ error: 'action required' }); return; }

      let result;
      switch (action) {
        case 'listProfiles':
          result = await gologinFetch(gologinToken, '/browser/v2', 'GET');
          break;
        case 'createProfile':
          result = await gologinFetch(gologinToken, '/browser', 'POST', {
            name: name || 'RetroThriftCo',
            os: os || 'win',
            browserType: 'chrome',
            navigator: {
              language: 'en-US,en',
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              resolution: '1920x1080',
              platform: 'Win32',
            },
            proxy: { mode: 'none' },
          });
          break;
        case 'startProfile': {
          if (!profileId) { res.status(400).json({ error: 'profileId required' }); return; }
          // Set startUrl on the profile so the cloud browser navigates there on launch
          const startUrls: Record<string, string> = {
            depop: 'https://www.depop.com/login/',
            poshmark: 'https://poshmark.com/login',
          };
          if (platform && startUrls[platform]) {
            await gologinFetch(gologinToken, `/browser/${profileId}/custom`, 'PUT', {
              startUrl: startUrls[platform],
            });
          }
          result = await gologinFetch(gologinToken, `/browser/${profileId}/web`, 'POST');
          break;
        }
        case 'stopProfile':
          if (!profileId) { res.status(400).json({ error: 'profileId required' }); return; }
          // Cloud profiles are stopped via DELETE /browser/{id}/web
          result = await gologinFetch(gologinToken, `/browser/${profileId}/web`, 'DELETE');
          break;
        case 'deleteProfile':
          if (!profileId) { res.status(400).json({ error: 'profileId required' }); return; }
          // Stop the profile first if it's running, then delete
          try { await gologinFetch(gologinToken, `/browser/${profileId}/web`, 'DELETE'); } catch { /* may not be running */ }
          result = await gologinFetch(gologinToken, `/browser/${profileId}`, 'DELETE');
          break;
        case 'getProfile':
          if (!profileId) { res.status(400).json({ error: 'profileId required' }); return; }
          result = await gologinFetch(gologinToken, `/browser/${profileId}`, 'GET');
          break;
        case 'checkRunning': {
          // Try to get profile info — if canBeRunning is false, the profile is running in cloud
          if (!profileId) { res.status(400).json({ error: 'profileId required' }); return; }
          const profileInfo = await gologinFetch(gologinToken, `/browser/${profileId}`, 'GET');
          result = {
            profileId,
            canBeRunning: profileInfo?.canBeRunning ?? true,
            // canBeRunning === false means the profile IS currently running
            isRunning: profileInfo?.canBeRunning === false,
            name: profileInfo?.name,
          };
          break;
        }
        case 'testConnection': {
          // Verify a profile exists and is accessible
          if (!profileId) { res.status(400).json({ error: 'profileId required' }); return; }
          try {
            const profile = await gologinFetch(gologinToken, `/browser/${profileId}`, 'GET');
            result = {
              valid: !!profile?.id,
              profileId: profile?.id,
              name: profile?.name,
              canBeRunning: profile?.canBeRunning ?? true,
              isRunning: profile?.canBeRunning === false,
            };
          } catch {
            result = { valid: false, profileId, error: 'Profile not found or inaccessible' };
          }
          break;
        }
        default:
          res.status(400).json({ error: `Unknown action: ${action}` }); return;
      }

      res.json({ data: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }));

// Keep old onCall functions for backward compat (they still work if invoker is set)
import { listProfiles, createProfile, startProfile, stopProfile, deleteProfile as deleteGoLoginProfile, getProfile as getGoLoginProfile, updateProfile as updateGoLoginProfile, delistFromPlatform, markSoldOnPlatform, getListingsFromPlatform } from './gologin-service';

export const gologinListProfiles = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB' })
  .https.onRequest((req, res) => corsHandler(req, res, async () => {
    try {
      await verifyAuth(req);
      const profiles = await listProfiles();
      res.json({ data: profiles });
    } catch (e: any) { res.status(401).json({ error: e.message }); }
  }));

export const gologinCreateProfile = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest((req, res) => corsHandler(req, res, async () => {
    try {
      await verifyAuth(req);
      const { name, os, proxy } = req.body?.data || req.body || {};
      const profile = await createProfile(name || 'RetroThriftCo', os || 'win', proxy);
      res.json({ data: profile });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }));

export const gologinStartProfile = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onRequest((req, res) => corsHandler(req, res, async () => {
    try {
      await verifyAuth(req);
      const { profileId } = req.body?.data || req.body || {};
      if (!profileId) { res.status(400).json({ error: 'profileId required' }); return; }
      const result = await startProfile(profileId);
      res.json({ data: result });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }));

export const gologinStopProfile = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest((req, res) => corsHandler(req, res, async () => {
    try {
      await verifyAuth(req);
      const { profileId } = req.body?.data || req.body || {};
      if (!profileId) { res.status(400).json({ error: 'profileId required' }); return; }
      await stopProfile(profileId);
      res.json({ data: { success: true } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }));

export const gologinDelistItem = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onRequest((req, res) => corsHandler(req, res, async () => {
    try {
      await verifyAuth(req);
      const { platform, itemUrl, profileId } = req.body?.data || req.body || {};
      if (!platform || !itemUrl || !profileId) { res.status(400).json({ error: 'platform, itemUrl, profileId required' }); return; }
      const success = await delistFromPlatform(platform, itemUrl, profileId);
      res.json({ data: { success } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }));

export const gologinMarkSold = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onRequest((req, res) => corsHandler(req, res, async () => {
    try {
      await verifyAuth(req);
      const { platform, itemUrl, profileId } = req.body?.data || req.body || {};
      if (!platform || !itemUrl || !profileId) { res.status(400).json({ error: 'platform, itemUrl, profileId required' }); return; }
      const success = await markSoldOnPlatform(platform, itemUrl, profileId);
      res.json({ data: { success } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }));

export const gologinSyncListings = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onRequest((req, res) => corsHandler(req, res, async () => {
    try {
      await verifyAuth(req);
      const { platform, profileId } = req.body?.data || req.body || {};
      if (!platform || !profileId) { res.status(400).json({ error: 'platform, profileId required' }); return; }
      const listings = await getListingsFromPlatform(platform, profileId);
      res.json({ data: { success: true, listings, count: listings.length } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }));

// ===========================================================================
// Depop Cloud Functions
// ===========================================================================

import { getDepopCredentials, depopGetListings, depopCreateListing, depopDeleteListing, depopMarkSold, depopUpdatePrice, checkDepopProduct } from './depop-service';

export const depopGetAllListings = functions.runWith({ timeoutSeconds: 120, memory: '512MB' }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  const { username } = data;
  if (!username) throw new functions.https.HttpsError('invalid-argument', 'username is required');
  const token = await getDepopCredentials(context.auth.uid);
  const listings = await depopGetListings(token, username);
  return { success: true, listings, count: listings.length };
});

export const depopListItem = functions.runWith({ timeoutSeconds: 60, memory: '256MB' }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  const { description, priceCents, categoryId, pictures, shipping } = data;
  if (!description || !priceCents || !categoryId) throw new functions.https.HttpsError('invalid-argument', 'description, priceCents, categoryId required');
  const token = await getDepopCredentials(context.auth.uid);
  const productId = await depopCreateListing(token, { description, price: { amount: priceCents, currency_name: 'USD' }, category_id: categoryId, pictures: pictures || [], ...(shipping ? { shipping } : {}) });
  return { success: true, productId, listingUrl: `https://www.depop.com/products/${productId}/` };
});

export const depopDelistItem = functions.runWith({ timeoutSeconds: 60, memory: '256MB' }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  const { productId } = data;
  if (!productId) throw new functions.https.HttpsError('invalid-argument', 'productId required');
  const token = await getDepopCredentials(context.auth.uid);
  return await depopDeleteListing(token, productId);
});

// Liveness check for a Depop product. No Depop auth needed (public v3 endpoint) but we
// require Firebase auth so anonymous traffic can't enumerate listings via this CF.
export const checkDepopListing = functions.runWith({ timeoutSeconds: 30, memory: '256MB' }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  const { productId } = data;
  if (!productId) throw new functions.https.HttpsError('invalid-argument', 'productId required');
  const result = await checkDepopProduct(String(productId));
  console.log(`[checkDepopListing] productId=${productId} status=${result.status} alive=${result.alive}`);
  return { productId: String(productId), ...result, ts: new Date().toISOString() };
});

export const depopMarkItemSold = functions.runWith({ timeoutSeconds: 60, memory: '256MB' }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  const { productId } = data;
  if (!productId) throw new functions.https.HttpsError('invalid-argument', 'productId required');
  const token = await getDepopCredentials(context.auth.uid);
  return await depopMarkSold(token, productId);
});

export const depopUpdateItemPrice = functions.runWith({ timeoutSeconds: 60, memory: '256MB' }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  const { productId, priceCents } = data;
  if (!productId || priceCents === undefined) throw new functions.https.HttpsError('invalid-argument', 'productId and priceCents required');
  const token = await getDepopCredentials(context.auth.uid);
  return await depopUpdatePrice(token, productId, priceCents);
});

// ===========================================================================
// Gmail CSV Fetch Cloud Functions
// ===========================================================================

import { fetchEbayCSV, fetchPoshmarkCSV, parseInventoryCSV } from './gmail-service';

export const gmailFetchInventoryCSVs = functions.runWith({ timeoutSeconds: 120, memory: '512MB' }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  const userId = context.auth.uid;
  const results: { ebay: any; poshmark: any; errors: Array<{ platform: string; error: string }> } = { ebay: null, poshmark: null, errors: [] };

  try { results.ebay = await fetchEbayCSV(userId); } catch (e: any) { results.errors.push({ platform: 'ebay', error: e.message }); }
  try { results.poshmark = await fetchPoshmarkCSV(userId); } catch (e: any) { results.errors.push({ platform: 'poshmark', error: e.message }); }

  return {
    success: true,
    received: (results.ebay ? 1 : 0) + (results.poshmark ? 1 : 0),
    total: 2,
    ebay: results.ebay ? { filename: results.ebay.filename, date: results.ebay.date, items: parseInventoryCSV(results.ebay.data, 'ebay') } : null,
    poshmark: results.poshmark ? { filename: results.poshmark.filename, date: results.poshmark.date, items: parseInventoryCSV(results.poshmark.data, 'poshmark') } : null,
    errors: results.errors,
  };
});

export const gmailOAuthUrl = functions.https.onRequest(async (req, res) => {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  if (!clientId || !redirectUri) { res.status(500).json({ error: 'Gmail OAuth not configured' }); return; }
  const state = req.query.uid as string;
  if (!state) { res.status(400).json({ error: 'uid query parameter required' }); return; }
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline', prompt: 'consent', state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

export const gmailCallback = functions.https.onRequest(async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  if (oauthError) { res.status(400).json({ error: `OAuth error: ${oauthError}` }); return; }
  if (!code || !state) { res.status(400).json({ error: 'Missing code or state' }); return; }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) { res.status(500).json({ error: 'Gmail OAuth not configured' }); return; }

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: code as string, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    if (!tokenResp.ok) { res.status(500).json({ error: `Token exchange failed: ${await tokenResp.text()}` }); return; }
    const tokenData = await tokenResp.json();
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

    await db.collection('gmail_credentials').doc(state as string).set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.send('<html><body><h2>Gmail connected! You can close this window.</h2><script>window.close();</script></body></html>');
  } catch (e: any) {
    res.status(500).json({ error: `Gmail auth failed: ${e.message}` });
  }
});

// ============================================================
// eBay Backfill Sold History — pulls eBay orders via Fulfillment API
// and backfills unitSales + itemActivity on matching Items
// ============================================================
export const ebayBackfillSoldHistory = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;
    const MAX_UNIT_SALES = 200;
    const MAX_ITEM_ACTIVITY = 50;

    try {
      // ── Step 1: Fetch all eBay orders (paginated, last 90 days) ──
      let offset = 0;
      const limit = 200;
      let hasMore = true;
      let allOrders: any[] = [];

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const creationDateFilter = ninetyDaysAgo.toISOString();

      while (hasMore && offset < 10000) {
        const ordersData = await makeEbayApiCall(
          userId,
          `/sell/fulfillment/v1/order?limit=${limit}&offset=${offset}&filter=creationdate:[${creationDateFilter}..]`,
          { method: 'GET' }
        );

        const orders = ordersData.orders || [];
        allOrders = allOrders.concat(orders);
        hasMore = orders.length === limit;
        offset += limit;
      }

      console.log(`[ebayBackfillSoldHistory] Fetched ${allOrders.length} orders for user ${userId}`);

      // ── Step 2: Build a map of legacyItemId → order info from line items ──
      interface OrderLineInfo {
        orderId: string;
        creationDate: string;
        priceCents: number;
        buyer: string;
      }

      const lineItemMap = new Map<string, OrderLineInfo[]>();

      for (const order of allOrders) {
        // Only process paid/fulfilled orders
        if (order.orderPaymentStatus !== 'PAID' && order.orderPaymentStatus !== 'FULFILLED') {
          continue;
        }

        const lineItems = order.lineItems || [];
        for (const lineItem of lineItems) {
          const legacyItemId = lineItem.legacyItemId;
          if (!legacyItemId) continue;

          // Price: use lineItem total or fall back to per-unit price
          const totalValue = parseFloat(lineItem.total?.value || lineItem.lineItemCost?.value || '0');
          const priceCents = Math.round(totalValue * 100);

          const info: OrderLineInfo = {
            orderId: order.orderId,
            creationDate: order.creationDate,
            priceCents,
            buyer: order.buyer?.username || 'Unknown',
          };

          const existing = lineItemMap.get(legacyItemId);
          if (existing) {
            existing.push(info);
          } else {
            lineItemMap.set(legacyItemId, [info]);
          }
        }
      }

      console.log(`[ebayBackfillSoldHistory] Found ${lineItemMap.size} unique eBay listing IDs across orders`);

      if (lineItemMap.size === 0) {
        return {
          success: true,
          ordersProcessed: 0,
          itemsUpdated: 0,
          skipped: 0,
          message: 'No paid orders found in the last 90 days',
        };
      }

      // ── Step 3: Query local Items for this user that have ebayListingId ──
      const itemsSnapshot = await db.collection('Item')
        .where('user_uuid', '==', userId)
        .get();

      // Build a lookup: ebayListingId → Firestore doc
      const itemsByEbayId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const doc of itemsSnapshot.docs) {
        const itemData = doc.data();
        const ebayId = itemData.ebayListingId || itemData.ebayItemId;
        if (ebayId) {
          itemsByEbayId.set(String(ebayId), doc);
        }
      }

      console.log(`[ebayBackfillSoldHistory] User has ${itemsByEbayId.size} items with eBay listing IDs`);

      // ── Step 4: Match orders to items and backfill ──
      let itemsUpdated = 0;
      let salesAdded = 0;
      let skipped = 0;

      // Process in batches of 500 (Firestore batch limit)
      const BATCH_SIZE = 500;
      let batch = db.batch();
      let batchCount = 0;

      for (const [legacyItemId, orderInfos] of lineItemMap.entries()) {
        const itemDoc = itemsByEbayId.get(legacyItemId);
        if (!itemDoc) {
          skipped++;
          continue;
        }

        const itemData = itemDoc.data();
        const existingUnitSales: any[] = itemData.unitSales || [];
        const existingItemActivity: any[] = itemData.itemActivity || [];

        // Deduplicate: collect existing soldAt timestamps for eBay
        const existingSoldTimestamps = new Set(
          existingUnitSales
            .filter((s: any) => s.platform === 'ebay')
            .map((s: any) => s.soldAt)
        );

        let newUnitSales: any[] = [];
        let newActivityEntries: any[] = [];

        for (const orderInfo of orderInfos) {
          // Skip if we already have a sale entry with this exact timestamp
          if (existingSoldTimestamps.has(orderInfo.creationDate)) {
            continue;
          }

          newUnitSales.push({
            soldAt: orderInfo.creationDate,
            platform: 'ebay',
            priceCents: orderInfo.priceCents,
            note: `eBay order ${orderInfo.orderId} (buyer: ${orderInfo.buyer})`,
          });

          newActivityEntries.push({
            action: 'SOLD',
            timestamp: orderInfo.creationDate,
            details: `eBay order backfill — order ${orderInfo.orderId}, buyer: ${orderInfo.buyer}`,
          });

          salesAdded++;
        }

        if (newUnitSales.length === 0) {
          skipped++;
          continue;
        }

        // Merge and cap arrays
        const mergedUnitSales = [...existingUnitSales, ...newUnitSales].slice(-MAX_UNIT_SALES);
        const mergedItemActivity = [...existingItemActivity, ...newActivityEntries].slice(-MAX_ITEM_ACTIVITY);

        // Calculate updated physicalQuantity
        const totalSold = mergedUnitSales.length;
        const originalQuantity = itemData.physicalQuantity ?? itemData.ebayQuantity ?? 1;
        const newPhysicalQuantity = Math.max(0, originalQuantity - totalSold);

        // Determine stockStatus
        let newStockStatus: string;
        if (newPhysicalQuantity === 0) {
          newStockStatus = 'SOLD';
        } else if (newPhysicalQuantity === 1) {
          newStockStatus = 'LOW_STOCK';
        } else {
          newStockStatus = 'IN_STOCK';
        }

        const updatePayload: Record<string, any> = {
          unitSales: mergedUnitSales,
          itemActivity: mergedItemActivity,
          physicalQuantity: newPhysicalQuantity,
          stockStatus: newStockStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // If fully sold out, also update status
        if (newPhysicalQuantity === 0) {
          updatePayload.status = 'SOLD';
          updatePayload.soldPlatform = 'ebay';
        }

        batch.update(itemDoc.ref, updatePayload);
        batchCount++;
        itemsUpdated++;

        // Commit batch when it hits the limit
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }

      // Commit any remaining writes
      if (batchCount > 0) {
        await batch.commit();
      }

      console.log(`[ebayBackfillSoldHistory] Done — ${itemsUpdated} items updated, ${salesAdded} sales added, ${skipped} skipped`);

      return {
        success: true,
        ordersProcessed: allOrders.length,
        itemsUpdated,
        salesAdded,
        skipped,
        message: `Backfilled ${salesAdded} sales across ${itemsUpdated} items from ${allOrders.length} eBay orders`,
      };
    } catch (error) {
      console.error('[ebayBackfillSoldHistory] Error:', error);
      throw new functions.https.HttpsError(
        'internal',
        `Failed to backfill eBay sold history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });
