/**
 * Depop API Service
 * Handles authenticated requests to Depop's API for listing, delisting, and managing products.
 * Auth tokens are retrieved from the depop_cookies Firestore collection (synced by the Chrome extension).
 */

import * as admin from 'firebase-admin';

const DEPOP_API_V2 = 'https://webapi.depop.com/api/v2';

const DEPOP_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.depop.com/',
  'Origin': 'https://www.depop.com',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
};

export interface DepopProduct {
  id: string;
  slug?: string;
  description?: string;
  price?: { amount: number; currency_name: string };
  status?: string;
  pictures?: string[];
  category_id?: number;
  [key: string]: unknown;
}

export interface DepopListingData {
  description: string;
  price: { amount: number; currency_name: string };
  category_id: number;
  pictures: string[];
  shipping?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function getDepopCredentials(userId: string): Promise<string> {
  const db = admin.firestore();

  const cookieDoc = await db.collection('depop_cookies').doc(userId).get();
  if (cookieDoc.exists) {
    const data = cookieDoc.data();
    // Cookies can be stored as an object with cookie names as keys
    const cookies = data?.cookies;
    if (cookies) {
      // Check if it's an object with access_token key
      if (cookies.access_token?.value) return cookies.access_token.value;
      // Check if it's an array
      if (Array.isArray(cookies)) {
        for (const c of cookies) {
          if (c.name === 'access_token' && c.value) return c.value;
        }
      }
    }
  }

  const mcDoc = await db.collection('marketplaceConnections').doc(userId).get();
  if (mcDoc.exists) {
    const depopData = mcDoc.data()?.depop;
    if (depopData?.access_token) return depopData.access_token;
  }

  throw new Error('No Depop credentials found. Sync your Depop cookies via the Chrome extension.');
}

export async function depopGetListings(token: string, username: string): Promise<DepopProduct[]> {
  const url = `${DEPOP_API_V2}/shop/${encodeURIComponent(username)}/products/?limit=200`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { ...DEPOP_HEADERS, 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Depop GET listings: ${response.status} - ${err}`);
  }
  const data = await response.json();
  return data.products || data || [];
}

export async function depopCreateListing(token: string, listingData: DepopListingData): Promise<string> {
  const response = await fetch(`${DEPOP_API_V2}/products/`, {
    method: 'POST',
    headers: { ...DEPOP_HEADERS, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(listingData),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Depop CREATE listing: ${response.status} - ${err}`);
  }
  const data = await response.json();
  return data.id || data.slug || '';
}

export async function depopDeleteListing(token: string, productId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${DEPOP_API_V2}/products/${encodeURIComponent(productId)}/`, {
    method: 'DELETE',
    headers: { ...DEPOP_HEADERS, 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Depop DELETE listing: ${response.status} - ${err}`);
  }
  return { success: true };
}

export async function depopMarkSold(token: string, productId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${DEPOP_API_V2}/products/${encodeURIComponent(productId)}/`, {
    method: 'PATCH',
    headers: { ...DEPOP_HEADERS, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'sold' }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Depop MARK SOLD: ${response.status} - ${err}`);
  }
  return { success: true };
}

/**
 * Lightweight liveness check: hit the public v3 product endpoint with no auth and
 * read the HTTP status. 200 → alive on the platform; 404/403/410 → delisted/gone.
 * Anything else throws — the caller treats it as "unknown / error" and leaves the
 * binding alone.
 */
export async function checkDepopProduct(productId: string): Promise<{ alive: boolean; status: number }> {
  const url = `https://webapi.depop.com/api/v3/product/${encodeURIComponent(productId)}/?force_fee_calculation=false&include_offers=false`;
  const response = await fetch(url, { method: 'GET', headers: DEPOP_HEADERS });
  if (response.status === 200) return { alive: true, status: 200 };
  if (response.status === 404 || response.status === 410 || response.status === 403) return { alive: false, status: response.status };
  throw new Error(`Depop CHECK product ${productId}: unexpected ${response.status}`);
}

export async function depopUpdatePrice(token: string, productId: string, priceCents: number): Promise<{ success: boolean }> {
  const response = await fetch(`${DEPOP_API_V2}/products/${encodeURIComponent(productId)}/`, {
    method: 'PATCH',
    headers: { ...DEPOP_HEADERS, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ price: { amount: priceCents, currency_name: 'USD' } }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Depop UPDATE PRICE: ${response.status} - ${err}`);
  }
  return { success: true };
}
