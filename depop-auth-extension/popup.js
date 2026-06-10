// Update UI when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  await updateUI();
  await updateFirebaseSyncUI();
  await loadUserId();

  // Button handlers
  document.getElementById('captureBtn').addEventListener('click', captureCookies);
  document.getElementById('testBtn').addEventListener('click', testAuth);
  document.getElementById('fetchListingsBtn').addEventListener('click', fetchListings);
  document.getElementById('exportBtn').addEventListener('click', exportCookies);
  document.getElementById('clearBtn').addEventListener('click', clearCookies);

  // Firebase sync handlers
  document.getElementById('firebaseSyncToggle').addEventListener('change', toggleFirebaseSync);
  document.getElementById('syncToFirebaseBtn').addEventListener('click', syncToFirebase);
  document.getElementById('syncFromFirebaseBtn').addEventListener('click', syncFromFirebase);

  // User ID handler
  document.getElementById('saveUserIdBtn').addEventListener('click', saveUserId);
});

// Load saved userId
async function loadUserId() {
  const result = await chrome.storage.local.get(['userId']);
  if (result.userId) {
    document.getElementById('userIdInput').value = result.userId;
    showUserIdStatus('✅ User ID loaded', '#10b981');
  }
}

// Save userId
async function saveUserId() {
  const userId = document.getElementById('userIdInput').value.trim();

  if (!userId) {
    showUserIdStatus('⚠️ Please enter a user ID', '#ef4444');
    return;
  }

  try {
    await chrome.storage.local.set({ userId: userId });
    showUserIdStatus('✅ User ID saved! Extension will now auto-list items.', '#10b981');
    console.log('[Popup] Saved userId:', userId);
  } catch (error) {
    showUserIdStatus('❌ Failed to save: ' + error.message, '#ef4444');
  }
}

// Show userId status message
function showUserIdStatus(message, color) {
  const statusEl = document.getElementById('userIdStatus');
  statusEl.textContent = message;
  statusEl.style.backgroundColor = color;
  statusEl.style.color = 'white';
  statusEl.style.display = 'block';

  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

// Update UI with current state
async function updateUI() {
  const cookies = await chrome.runtime.sendMessage({ action: 'getCookies' });

  // Update cookie list
  const cookiesList = document.getElementById('cookiesList');
  const cookieCount = Object.keys(cookies).length;

  if (cookieCount === 0) {
    cookiesList.innerHTML = '<p class="empty">No cookies captured yet. Log into Depop!</p>';
    updateStatus('⚪', 'Not logged in');
  } else {
    let html = '<ul>';
    for (const [name, data] of Object.entries(cookies)) {
      const expired = data.expirationDate && (data.expirationDate * 1000 < Date.now());
      html += `
        <li>
          <strong>${name}</strong>
          ${data.httpOnly ? '<span class="badge">HttpOnly</span>' : ''}
          ${data.secure ? '<span class="badge">Secure</span>' : ''}
          ${expired ? '<span class="badge expired">Expired</span>' : ''}
          <br><small>Captured: ${new Date(data.captured_at).toLocaleString()}</small>
        </li>
      `;
    }
    html += '</ul>';
    cookiesList.innerHTML = html;

    updateStatus('🟢', `${cookieCount} cookies stored`);
    document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
  }
}

// Update status indicator
function updateStatus(icon, text) {
  document.getElementById('statusIcon').textContent = icon;
  document.getElementById('statusText').textContent = text;
}

// Capture cookies manually
async function captureCookies() {
  updateStatus('⏳', 'Capturing...');

  const cookies = await chrome.cookies.getAll({ domain: '.depop.com' });

  if (cookies.length === 0) {
    updateStatus('⚠️', 'No Depop cookies found. Are you logged in?');
    setTimeout(() => updateUI(), 2000);
    return;
  }

  // Store each cookie
  for (const cookie of cookies) {
    await chrome.storage.local.set({
      [`depop_cookie_${cookie.name}`]: {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expirationDate: cookie.expirationDate,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
        captured_at: new Date().toISOString()
      }
    });
  }

  updateStatus('✅', `Captured ${cookies.length} cookies`);
  setTimeout(() => updateUI(), 1000);
}

// Test authentication
async function testAuth() {
  updateStatus('⏳', 'Testing Depop API...');

  try {
    const result = await chrome.runtime.sendMessage({ action: 'testAuth' });

    if (result && result.success) {
      if (result.authenticated && result.user) {
        const user = result.user;
        updateStatus('✅', `Logged in as @${user.username}`);

        // Show user info
        const cookiesList = document.getElementById('cookiesList');
        cookiesList.innerHTML = `
          <div class="user-info">
            <h3>✅ Depop API Connected</h3>
            <p><strong>Username:</strong> @${user.username}</p>
            <p><strong>Name:</strong> ${user.first_name} ${user.last_name}</p>
            <p><strong>Items Sold:</strong> ${user.items_sold || 0}</p>
            <p><strong>Rating:</strong> ${user.reviews_rating ? user.reviews_rating.toFixed(1) : 'N/A'}</p>
            ${user.verified ? '<p><strong>✅ Verified Account</strong></p>' : ''}
          </div>
        `;
      } else {
        updateStatus('❌', 'Not authenticated - ' + (result.error || 'Login to Depop first'));
      }
    } else {
      updateStatus('❌', `Error: ${result?.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('testAuth error:', error);
    updateStatus('❌', 'Service worker inactive. Reload extension!');
  }

  setTimeout(() => updateUI(), 5000);
}

// Fetch listings from Depop
async function fetchListings() {
  updateStatus('⏳', 'Fetching listings from current page...');

  try {
    // Auto-fetch from current page (no username needed!)
    const result = await chrome.runtime.sendMessage({
      action: 'fetchListings'
    });

    if (result && result.success) {
      const methodEmoji = result.method === 'api' ? '🚀' : result.method === 'puppeteer' ? '🤖' : '📄';
      updateStatus('✅', `Fetched ${result.count} listings via ${result.method.toUpperCase()}!`);

      // Show summary
      const cookiesList = document.getElementById('cookiesList');
      cookiesList.innerHTML = `
        <div class="user-info">
          <h3>${methodEmoji} Fetched ${result.count} Listings</h3>
          <p><strong>Shop:</strong> @${result.username}</p>
          <p><strong>Method:</strong> ${result.method.toUpperCase()}</p>
          ${result.method === 'dom' ? '<p class="success">✅ Extracted from page!</p>' : ''}
          ${result.method === 'api' ? '<p class="success">✅ No server needed!</p>' : ''}
          ${result.method === 'puppeteer' ? '<p class="info">🤖 Using Puppeteer bypass</p>' : ''}
          <p><small>Data automatically synced to Firebase!</small></p>
        </div>
      `;

      // Store listings in local storage for export
      await chrome.storage.local.set({ depop_listings: result.listings });
    } else {
      updateStatus('❌', `Error: ${result?.error || 'Unknown error'}`);

      // Show helpful message
      const cookiesList = document.getElementById('cookiesList');
      cookiesList.innerHTML = `
        <div class="user-info error">
          <h3>❌ Fetch Failed</h3>
          <p>${result?.error || 'Unknown error'}</p>
          ${result?.tried ? `<p><small>Tried: ${result.tried.join(', ')}</small></p>` : ''}
          <p><small>Make sure you're on a Depop profile page (yours or someone else's) with listings visible</small></p>
        </div>
      `;
    }
  } catch (error) {
    console.error('fetchListings error:', error);
    updateStatus('❌', 'Service worker inactive. Reload extension!');
  }

  setTimeout(() => updateUI(), 5000);
}

// Export cookies and user info to clipboard
async function exportCookies() {
  updateStatus('⏳', 'Exporting...');

  const cookies = await chrome.runtime.sendMessage({ action: 'exportCookies' });

  if (Object.keys(cookies).length === 0) {
    updateStatus('⚠️', 'No cookies to export');
    setTimeout(() => updateUI(), 2000);
    return;
  }

  // Try to get user info too
  let userInfo = null;
  try {
    const userResult = await chrome.runtime.sendMessage({ action: 'testAuth' });
    if (userResult.success && userResult.user) {
      userInfo = userResult.user;
    }
  } catch (error) {
    console.log('Could not fetch user info for export:', error);
  }

  // Try to get listings too
  let listings = null;
  try {
    const storage = await chrome.storage.local.get('depop_listings');
    if (storage.depop_listings) {
      listings = storage.depop_listings;
    }
  } catch (error) {
    console.log('Could not get listings for export:', error);
  }

  // Format for easier use
  const formatted = {
    exported_at: new Date().toISOString(),
    cookie_count: Object.keys(cookies).length,
    cookies: cookies,
    user_info: userInfo,
    listings: listings,
    listings_count: listings ? listings.length : 0
  };

  const json = JSON.stringify(formatted, null, 2);

  try {
    await navigator.clipboard.writeText(json);
    updateStatus('✅', `Copied ${userInfo ? 'cookies + user info' : 'cookies'} to clipboard!`);
  } catch (error) {
    updateStatus('❌', 'Failed to copy');
  }

  setTimeout(() => updateUI(), 2000);
}

// Clear stored cookies
async function clearCookies() {
  if (!confirm('Clear all stored Depop cookies?')) return;

  updateStatus('⏳', 'Clearing...');

  const result = await chrome.runtime.sendMessage({ action: 'clearCookies' });
  updateStatus('✅', `Cleared ${result.cleared} cookies`);

  setTimeout(() => updateUI(), 1000);
}

// === FIREBASE SYNC FUNCTIONS ===

// Update Firebase sync UI
async function updateFirebaseSyncUI() {
  // Get sync settings
  const settings = await chrome.storage.local.get('firebaseSync');
  const isEnabled = settings.firebaseSync?.enabled || false;

  // Update toggle
  document.getElementById('firebaseSyncToggle').checked = isEnabled;
  document.getElementById('syncToggleLabel').textContent = isEnabled ? 'Auto-sync enabled' : 'Auto-sync disabled';

  // Get sync status
  const status = await chrome.runtime.sendMessage({ action: 'getSyncStatus' });

  if (status && status.synced) {
    const lastSync = status.lastSync ? new Date(status.lastSync.toDate()).toLocaleString() : 'Unknown';
    document.getElementById('syncStatus').innerHTML = `
      ✅ Synced to Firebase<br>
      <small>Last sync: ${lastSync}<br>
      ${status.cookieCount} cookies in cloud</small>
    `;
  } else {
    document.getElementById('syncStatus').textContent = 'Not synced to Firebase';
  }
}

// Toggle Firebase sync
async function toggleFirebaseSync(event) {
  const enabled = event.target.checked;
  updateSyncStatus('⏳', enabled ? 'Enabling...' : 'Disabling...');

  const result = await chrome.runtime.sendMessage({
    action: 'toggleFirebaseSync',
    enabled: enabled
  });

  if (result.success) {
    updateSyncStatus('✅', enabled ? 'Auto-sync enabled!' : 'Auto-sync disabled');
    document.getElementById('syncToggleLabel').textContent = enabled ? 'Auto-sync enabled' : 'Auto-sync disabled';

    if (enabled) {
      await updateFirebaseSyncUI();
    }
  } else {
    updateSyncStatus('❌', `Error: ${result.error}`);
    event.target.checked = !enabled; // Revert toggle
  }

  setTimeout(() => updateFirebaseSyncUI(), 2000);
}

// Sync to Firebase
async function syncToFirebase() {
  updateSyncStatus('⏳', 'Syncing to Firebase...');

  const result = await chrome.runtime.sendMessage({ action: 'syncToFirebase' });

  if (result.success) {
    updateSyncStatus('✅', `Synced ${result.count} cookies!`);
    await updateFirebaseSyncUI();
  } else {
    updateSyncStatus('❌', `Error: ${result.error}`);
  }

  setTimeout(() => updateFirebaseSyncUI(), 2000);
}

// Sync from Firebase
async function syncFromFirebase() {
  updateSyncStatus('⏳', 'Syncing from Firebase...');

  const result = await chrome.runtime.sendMessage({ action: 'syncFromFirebase' });

  if (result.success) {
    updateSyncStatus('✅', `Downloaded ${result.count} cookies!`);
    await updateUI(); // Refresh cookie list
    await updateFirebaseSyncUI();
  } else {
    updateSyncStatus('❌', `Error: ${result.error}`);
  }

  setTimeout(() => updateFirebaseSyncUI(), 2000);
}

// Update sync status message
function updateSyncStatus(icon, message) {
  document.getElementById('syncStatus').innerHTML = `${icon} ${message}`;
}
