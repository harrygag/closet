import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

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

// Get eBay Listings using Trading API GetSellerList (with pagination)
// Returns full listing details for relisting
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
    const allListings: any[] = [];
    let actualEbayTotal = 0;

    // eBay Trading API uses EndTimeFrom/EndTimeTo to filter by listing END date
    // Active GTC listings have rolling end dates in the FUTURE
    // Fetch next 120 days (max allowed by eBay)
    const now = new Date();
    const maxDate = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);

    // Single 120-day range (max allowed by eBay)
    const dateRanges: Array<{ start: Date; end: Date }> = [
      { start: now, end: maxDate }
    ];

    console.log(`Fetching ALL listings across ${dateRanges.length} date ranges`);

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
  <EndTimeFrom>${endTimeFrom}</EndTimeFrom>
  <EndTimeTo>${endTimeTo}</EndTimeTo>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>${pageNumber}</PageNumber>
  </Pagination>
  <IncludeWatchCount>false</IncludeWatchCount>
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

          // Parse quantity
          const quantity = parseXMLValue(itemXML, 'Quantity') || '0';

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

          allListings.push({
            itemId,
            title,
            currentPrice: parseFloat(currentPrice),
            currency,
            quantity: parseInt(quantity, 10),
            listingType,
            viewItemURL,
            pictureURL,
            pictureURLs, // All images for relisting
            sku,
            condition: conditionDisplayName,
            conditionID,
            startTime,
            description, // Full description (truncated if >5000 chars)
            primaryCategoryID,
            primaryCategoryName,
            itemSpecifics, // ALL item specifics for relisting
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

    // Sort by startTime descending (newest first)
    allListings.sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });

    console.log(`Total listings fetched: ${allListings.length}, eBay reported: ${actualEbayTotal}, sorted newest first`);

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

      // Use OutputSelector to only get fields we need - MUCH faster than ReturnAll
      const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <EndTimeFrom>${endTimeFrom}</EndTimeFrom>
  <EndTimeTo>${endTimeTo}</EndTimeTo>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
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
      const sku = parseXMLValue(itemXML, 'SKU') || itemId;
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

      const quantity = parseXMLValue(itemXML, 'Quantity') || '1';

      // Parse picture URL EXACTLY like ebayGetAllListings does
      const pictureURL = parseXMLValue(itemXML, 'PictureURL') || '';

      const condition = parseXMLValue(itemXML, 'ConditionDisplayName') || '';

      listings.push({
        itemId,
        title,
        price: parseFloat(currentPrice) || 0,
        currency,
        quantity: parseInt(quantity, 10) || 1,
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
    const hmac = req.headers['x-shopify-hmac-sha256'] as string;

    console.log(`[shopifyWebhook] Received: ${topic} from ${shopDomain}`);

    // Get the raw body for HMAC verification
    const rawBody = JSON.stringify(req.body);

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
    const collectionHandle = tagToCollection[category] || 'all';

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
