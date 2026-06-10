/**
 * Depop API Client
 * Handles authenticated requests to Depop's API
 */

const DEPOP_API_BASE = 'https://webapi.depop.com/api/v2';
const DEPOP_API_V1_BASE = 'https://webapi.depop.com/api/v1';
const DEPOP_WEB_BASE = 'https://www.depop.com';

/**
 * Make authenticated request to Depop API
 */
async function makeDepopRequest(endpoint, options = {}) {
  try {
    // Get stored cookies from chrome.storage
    const storage = await chrome.storage.local.get(null);
    const cookies = {};

    for (const [key, value] of Object.entries(storage)) {
      if (key.startsWith('depop_cookie_')) {
        cookies[value.name] = value.value;
      }
    }

    // Check if we have the required access_token
    if (!cookies.access_token) {
      console.warn('[Depop API] No access_token found, request may fail');
    }

    // Use Authorization header with Bearer token instead of cookies
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Authorization': `Bearer ${cookies.access_token || ''}`,
      'Referer': 'https://www.depop.com/',
      'Origin': 'https://www.depop.com',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site'
    };

    // Try v1 API first as it may be more permissive
    const url = endpoint.startsWith('http') ? endpoint : `${DEPOP_API_V1_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      },
      mode: 'cors',
      credentials: 'omit' // Don't send cookies, use Authorization header
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Depop API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('[Depop API] Request failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current user profile
 */
export async function getCurrentUser() {
  return await makeDepopRequest('/user/');
}

/**
 * Get user's shop/listings
 */
export async function getUserShop(username) {
  return await makeDepopRequest(`/shop/${username}/products/`);
}

/**
 * Get user's active listings with pagination
 */
export async function getActiveListings(username, offset = 0, limit = 20) {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString()
  });

  return await makeDepopRequest(`/shop/${username}/products/?${params}`);
}

/**
 * Get single product details
 */
export async function getProduct(productId) {
  return await makeDepopRequest(`/products/${productId}/`);
}

/**
 * Search products
 */
export async function searchProducts(query, options = {}) {
  const params = new URLSearchParams({
    q: query,
    offset: options.offset || 0,
    limit: options.limit || 20,
    ...(options.category && { category: options.category }),
    ...(options.priceMin && { price_min: options.priceMin }),
    ...(options.priceMax && { price_max: options.priceMax })
  });

  return await makeDepopRequest(`/search/products/?${params}`);
}

/**
 * Get product stats (views, likes, etc)
 */
export async function getProductStats(productId) {
  return await makeDepopRequest(`/products/${productId}/stats/`);
}

/**
 * Update product (requires auth)
 */
export async function updateProduct(productId, updates) {
  return await makeDepopRequest(`/products/${productId}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
}

/**
 * Delete product (requires auth)
 */
export async function deleteProduct(productId) {
  return await makeDepopRequest(`/products/${productId}/`, {
    method: 'DELETE'
  });
}

/**
 * Get user's messages/inbox
 */
export async function getMessages(offset = 0, limit = 20) {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString()
  });

  return await makeDepopRequest(`/messages/?${params}`);
}

/**
 * Get conversation with specific user
 */
export async function getConversation(userId, offset = 0, limit = 50) {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString()
  });

  return await makeDepopRequest(`/messages/${userId}/?${params}`);
}

/**
 * Send message
 */
export async function sendMessage(userId, message) {
  return await makeDepopRequest(`/messages/${userId}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });
}

/**
 * Get user's sales/orders
 */
export async function getSales(offset = 0, limit = 20) {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString()
  });

  return await makeDepopRequest(`/sales/?${params}`);
}

/**
 * Get user's purchases
 */
export async function getPurchases(offset = 0, limit = 20) {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString()
  });

  return await makeDepopRequest(`/purchases/?${params}`);
}

/**
 * Create new listing
 */
export async function createListing(listingData) {
  return await makeDepopRequest('/products/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(listingData)
  });
}

/**
 * Upload image for listing
 */
export async function uploadImage(imageBlob) {
  const formData = new FormData();
  formData.append('image', imageBlob);

  return await makeDepopRequest('/images/', {
    method: 'POST',
    body: formData
  });
}

/**
 * Get user notifications
 */
export async function getNotifications(offset = 0, limit = 20) {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString()
  });

  return await makeDepopRequest(`/notifications/?${params}`);
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId) {
  return await makeDepopRequest(`/notifications/${notificationId}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ read: true })
  });
}

/**
 * Get user's liked products
 */
export async function getLikedProducts(username, offset = 0, limit = 20) {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString()
  });

  return await makeDepopRequest(`/users/${username}/likes/?${params}`);
}

/**
 * Like a product
 */
export async function likeProduct(productId) {
  return await makeDepopRequest(`/products/${productId}/like/`, {
    method: 'POST'
  });
}

/**
 * Unlike a product
 */
export async function unlikeProduct(productId) {
  return await makeDepopRequest(`/products/${productId}/like/`, {
    method: 'DELETE'
  });
}

/**
 * Get shop stats
 */
export async function getShopStats(username) {
  return await makeDepopRequest(`/shop/${username}/stats/`);
}

/**
 * Export cookies in Puppeteer-compatible format
 */
export async function exportCookiesForPuppeteer() {
  try {
    // Get all cookies for depop.com domain
    const cookies = await chrome.cookies.getAll({ domain: '.depop.com' });

    // Convert to Puppeteer format
    const puppeteerCookies = cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expirationDate || -1,
      httpOnly: cookie.httpOnly || false,
      secure: cookie.secure || false,
      sameSite: cookie.sameSite || 'Lax'
    }));

    return { success: true, cookies: puppeteerCookies };
  } catch (error) {
    console.error('[Depop API] Failed to export cookies:', error);
    return { success: false, error: error.message };
  }
}
