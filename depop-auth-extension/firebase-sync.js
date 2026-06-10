// Firebase Sync Module for Depop Cookies
// Uses REST API to work with Manifest V3 CSP restrictions

let firestoreApiUrl = null;

// Initialize Firebase
async function initializeFirebase() {
  if (!self.firebaseConfig) {
    console.error('[Firebase Sync] No Firebase config found');
    return { app: null, db: null, auth: null };
  }

  firestoreApiUrl = `https://firestore.googleapis.com/v1/projects/${self.firebaseConfig.projectId}/databases/(default)/documents`;
  console.log('[Firebase Sync] ✅ Firebase initialized');
  return { app: true, db: true, auth: null };
}

// Sync cookies to Firestore
async function syncCookiesToFirestore(cookies, userId = 'default') {
  if (!firestoreApiUrl) {
    console.warn('[Firebase Sync] Firebase not initialized');
    return { success: false, error: 'Not initialized' };
  }

  try {
    // Convert cookies object to Firestore format
    const cookiesArray = Object.entries(cookies).map(([name, value]) => ({
      mapValue: {
        fields: {
          name: { stringValue: name },
          value: { stringValue: value },
          domain: { stringValue: '.depop.com' },
          path: { stringValue: '/' },
          httpOnly: { booleanValue: false },
          secure: { booleanValue: true },
          sameSite: { stringValue: 'Lax' }
        }
      }
    }));

    const document = {
      fields: {
        cookies: {
          arrayValue: {
            values: cookiesArray
          }
        },
        lastUpdated: {
          timestampValue: new Date().toISOString()
        },
        source: {
          stringValue: 'chrome-extension'
        }
      }
    };

    const url = `${firestoreApiUrl}/depop_cookies/${userId}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(document)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`[Firebase Sync] ✅ Synced ${cookiesArray.length} cookies to Firestore for user ${userId}`);
    return { success: true, count: cookiesArray.length };
  } catch (error) {
    console.error('[Firebase Sync] ❌ Error syncing cookies:', error);
    return { success: false, error: error.message };
  }
}

// Get cookies from Firestore
async function getCookiesFromFirestore(userId = 'default') {
  if (!firestoreApiUrl) {
    return { success: false, error: 'Not initialized' };
  }

  try {
    const url = `${firestoreApiUrl}/depop_cookies/${userId}`;

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'No cookies found' };
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Convert Firestore format back to cookies object
    const cookies = {};
    if (data.fields && data.fields.cookies && data.fields.cookies.arrayValue) {
      data.fields.cookies.arrayValue.values.forEach(cookie => {
        const fields = cookie.mapValue.fields;
        const name = fields.name?.stringValue;
        const value = fields.value?.stringValue;
        if (name && value) {
          cookies[name] = value;
        }
      });
    }

    console.log(`[Firebase Sync] ✅ Retrieved ${Object.keys(cookies).length} cookies from Firestore`);
    return { success: true, cookies };
  } catch (error) {
    console.error('[Firebase Sync] ❌ Error getting cookies:', error);
    return { success: false, error: error.message };
  }
}

// Delete cookies from Firestore
async function deleteCookiesFromFirestore(userId = 'default') {
  if (!firestoreApiUrl) {
    return { success: false, error: 'Not initialized' };
  }

  try {
    const url = `${firestoreApiUrl}/depop_cookies/${userId}`;

    const response = await fetch(url, {
      method: 'DELETE'
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`[Firebase Sync] ✅ Deleted cookies from Firestore for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error('[Firebase Sync] ❌ Error deleting cookies:', error);
    return { success: false, error: error.message };
  }
}

// Check Firebase sync status
async function getSyncStatus() {
  return { enabled: true, initialized: !!firestoreApiUrl };
}

// Sync Depop user info to Firestore
async function syncUserInfoToFirestore(userInfo, userId = 'default') {
  if (!firestoreApiUrl) {
    console.warn('[Firebase Sync] Firebase not initialized');
    return { success: false, error: 'Not initialized' };
  }

  try {
    const document = {
      fields: {
        username: { stringValue: userInfo.username || '' },
        userId: { stringValue: userInfo.id?.toString() || '' },
        displayName: { stringValue: userInfo.first_name || '' },
        bio: { stringValue: userInfo.bio || '' },
        followers: { integerValue: userInfo.followers_count || 0 },
        following: { integerValue: userInfo.following_count || 0 },
        productCount: { integerValue: userInfo.items_sold || 0 },
        profilePicture: { stringValue: userInfo.picture || '' },
        lastUpdated: { timestampValue: new Date().toISOString() }
      }
    };

    const url = `${firestoreApiUrl}/depop_user_info/${userId}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(document)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`[Firebase Sync] ✅ Synced user info for @${userInfo.username}`);
    return { success: true };
  } catch (error) {
    console.error('[Firebase Sync] ❌ Error syncing user info:', error);
    return { success: false, error: error.message };
  }
}

// Check if user is authenticated (not applicable for REST API)
async function isFirebaseAuthenticated() {
  return true; // Always true since we use public REST API
}

// Get current Firebase user (not applicable for REST API)
async function getFirebaseUser() {
  return null; // Not using Firebase Auth
}

// Expose functions globally for service worker
self.firebaseSyncFunctions = {
  initializeFirebase,
  syncCookiesToFirestore,
  getCookiesFromFirestore,
  deleteCookiesFromFirestore,
  getSyncStatus,
  syncUserInfoToFirestore,
  isFirebaseAuthenticated,
  getFirebaseUser
};

console.log('[Firebase Sync] ✅ Module loaded (REST API mode)');
