// Popup UI Controller
let currentMarketplace = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await detectMarketplace();
  setupEventListeners();
});

/**
 * Detect which marketplace the user is on
 */
async function detectMarketplace() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      showStatus('error', 'Cannot detect current page');
      return;
    }
    
    const url = new URL(tab.url);
    const hostname = url.hostname;
    
    if (hostname.includes('ebay.com')) {
      currentMarketplace = 'ebay';
    } else if (hostname.includes('poshmark.com')) {
      currentMarketplace = 'poshmark';
    } else if (hostname.includes('depop.com')) {
      currentMarketplace = 'depop';
    }
    
    if (currentMarketplace) {
      document.getElementById('marketplace-info').textContent = 
        `✅ Detected: ${currentMarketplace.toUpperCase()}`;
      document.getElementById('marketplace-info').className = 'status success';
      
      // Enable buttons
      document.getElementById('save-btn').disabled = false;
      document.getElementById('inject-btn').disabled = false;
      document.getElementById('view-btn').disabled = false;
      
      // Check if we have saved cookies
      checkSavedCookies();
    } else {
      document.getElementById('marketplace-info').textContent = 
        '❌ Not on a supported marketplace';
      document.getElementById('marketplace-info').className = 'status error';
    }
  } catch (error) {
    console.error('Detection error:', error);
    showStatus('error', 'Detection failed: ' + error.message);
  }
}

/**
 * Check if we have saved cookies for this marketplace
 */
async function checkSavedCookies() {
  chrome.runtime.sendMessage({
    type: 'GET_COOKIES',
    marketplace: currentMarketplace
  }, (response) => {
    if (response && response.success && response.count > 0) {
      const timestamp = new Date(response.timestamp).toLocaleString();
      showStatus('success', `${response.count} cookies saved on ${timestamp}`);
    }
  });
}

/**
 * Setup button event listeners
 */
function setupEventListeners() {
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('inject-btn').addEventListener('click', handleInject);
  document.getElementById('view-btn').addEventListener('click', handleView);
  document.getElementById('export-btn').addEventListener('click', handleExport);
  document.getElementById('download-btn').addEventListener('click', handleDownload);
}

/**
 * Handle Save Cookies
 */
async function handleSave() {
  if (!currentMarketplace) return;
  
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = '💾 Saving...';
  
  chrome.runtime.sendMessage({
    type: 'SAVE_COOKIES',
    marketplace: currentMarketplace
  }, (response) => {
    btn.disabled = false;
    btn.textContent = '💾 Save Cookies';
    
    if (chrome.runtime.lastError) {
      showStatus('error', 'Error: ' + chrome.runtime.lastError.message);
      return;
    }
    
    if (response && response.success) {
      showStatus('success', `✅ Saved ${response.cookieCount} cookies!`);
    } else {
      showStatus('error', '❌ Failed: ' + (response?.error || 'Unknown error'));
    }
  });
}

/**
 * Handle Inject Cookies
 */
async function handleInject() {
  if (!currentMarketplace) return;
  
  const btn = document.getElementById('inject-btn');
  btn.disabled = true;
  btn.textContent = '📥 Injecting...';
  
  // First get saved cookies
  chrome.runtime.sendMessage({
    type: 'GET_COOKIES',
    marketplace: currentMarketplace
  }, (getCookiesResponse) => {
    if (!getCookiesResponse || !getCookiesResponse.success || getCookiesResponse.count === 0) {
      btn.disabled = false;
      btn.textContent = '📥 Inject Cookies';
      showStatus('error', '❌ No saved cookies found. Save them first!');
      return;
    }
    
    // Inject the cookies
    chrome.runtime.sendMessage({
      type: 'INJECT_COOKIES',
      marketplace: currentMarketplace,
      cookies: getCookiesResponse.cookies
    }, (injectResponse) => {
      btn.disabled = false;
      btn.textContent = '📥 Inject Cookies';
      
      if (chrome.runtime.lastError) {
        showStatus('error', 'Error: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (injectResponse && injectResponse.success) {
        showStatus('success', 
          `✅ Injected ${injectResponse.injected}/${injectResponse.total} cookies! Refresh page.`);
      } else {
        showStatus('error', '❌ Failed: ' + (injectResponse?.error || 'Unknown error'));
      }
    });
  });
}

/**
 * Handle View Saved Cookies
 */
async function handleView() {
  if (!currentMarketplace) return;
  
  chrome.runtime.sendMessage({
    type: 'GET_COOKIES',
    marketplace: currentMarketplace
  }, (response) => {
    if (response && response.success) {
      if (response.count === 0) {
        showStatus('error', '❌ No saved cookies');
        return;
      }
      
      const timestamp = new Date(response.timestamp).toLocaleString();
      
      // Show summary
      showStatus('success', `📦 ${response.count} cookies saved on ${timestamp}`);
      
      // Show detailed cookie list
      displayCookieDetails(response.cookies);
      
      // Enable export buttons
      document.getElementById('export-btn').disabled = false;
      document.getElementById('download-btn').disabled = false;
    } else {
      showStatus('error', '❌ Failed to get cookies');
    }
  });
}

/**
 * Display cookie details in a scrollable div
 */
function displayCookieDetails(cookies) {
  const detailsEl = document.getElementById('cookie-details');
  
  let html = '<div style="color: #10b981; font-weight: bold; margin-bottom: 8px;">🍪 Cookie Details:</div>';
  
  // Group cookies by importance (auth-related first)
  const authCookies = cookies.filter(c => 
    c.name.toLowerCase().includes('session') ||
    c.name.toLowerCase().includes('auth') ||
    c.name.toLowerCase().includes('token') ||
    c.name.toLowerCase().includes('login') ||
    c.name.toLowerCase().includes('user')
  );
  
  const otherCookies = cookies.filter(c => !authCookies.includes(c));
  
  if (authCookies.length > 0) {
    html += '<div style="color: #fbbf24; margin-top: 8px;">🔐 Authentication Cookies:</div>';
    authCookies.forEach(cookie => {
      html += formatCookie(cookie, true);
    });
  }
  
  if (otherCookies.length > 0) {
    html += '<div style="color: #9ca3af; margin-top: 12px;">📋 Other Cookies:</div>';
    otherCookies.forEach(cookie => {
      html += formatCookie(cookie, false);
    });
  }
  
  detailsEl.innerHTML = html;
  detailsEl.style.display = 'block';
}

/**
 * Format a single cookie for display
 */
function formatCookie(cookie, highlight) {
  const color = highlight ? '#fbbf24' : '#9ca3af';
  const valuePreview = cookie.value.substring(0, 40) + (cookie.value.length > 40 ? '...' : '');
  const secure = cookie.secure ? '🔒' : '🔓';
  const httpOnly = cookie.httpOnly ? 'HttpOnly' : '';
  
  return `
    <div style="margin: 8px 0; padding: 8px; background: #1f2937; border-left: 3px solid ${color}; border-radius: 4px;">
      <div style="color: ${color}; font-weight: bold;">${cookie.name}</div>
      <div style="color: #6b7280; margin-top: 4px; word-break: break-all;">
        Value: ${valuePreview}
      </div>
      <div style="color: #6b7280; font-size: 10px; margin-top: 4px;">
        ${secure} Domain: ${cookie.domain} | Path: ${cookie.path} ${httpOnly ? '| ' + httpOnly : ''}
      </div>
      ${cookie.expirationDate ? `<div style="color: #6b7280; font-size: 10px;">Expires: ${new Date(cookie.expirationDate * 1000).toLocaleString()}</div>` : ''}
    </div>
  `;
}

/**
 * Handle Export to Clipboard
 */
async function handleExport() {
  if (!currentMarketplace) return;
  
  chrome.runtime.sendMessage({
    type: 'GET_COOKIES',
    marketplace: currentMarketplace
  }, (response) => {
    if (response && response.success && response.cookies) {
      const exportData = {
        marketplace: currentMarketplace,
        timestamp: new Date().toISOString(),
        cookieCount: response.cookies.length,
        cookies: response.cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          expirationDate: c.expirationDate,
          sameSite: c.sameSite
        })),
        // Add auth cookie analysis
        authCookies: response.cookies.filter(c => 
          c.name.toLowerCase().includes('session') ||
          c.name.toLowerCase().includes('auth') ||
          c.name.toLowerCase().includes('token') ||
          c.name.toLowerCase().includes('login') ||
          c.name.toLowerCase().includes('user')
        ).map(c => c.name)
      };
      
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Copy to clipboard
      navigator.clipboard.writeText(jsonString).then(() => {
        showStatus('success', '✅ Copied to clipboard! Paste into chat to validate.');
      }).catch(err => {
        showStatus('error', '❌ Failed to copy: ' + err.message);
      });
    }
  });
}

/**
 * Handle Download JSON
 */
async function handleDownload() {
  if (!currentMarketplace) return;
  
  chrome.runtime.sendMessage({
    type: 'GET_COOKIES',
    marketplace: currentMarketplace
  }, (response) => {
    if (response && response.success && response.cookies) {
      const exportData = {
        marketplace: currentMarketplace,
        timestamp: new Date().toISOString(),
        cookieCount: response.cookies.length,
        cookies: response.cookies,
        authCookies: response.cookies.filter(c => 
          c.name.toLowerCase().includes('session') ||
          c.name.toLowerCase().includes('auth') ||
          c.name.toLowerCase().includes('token')
        ).map(c => ({ name: c.name, domain: c.domain }))
      };
      
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Convert to data URL (Chrome downloads API doesn't support blob: URLs)
      const base64 = btoa(unescape(encodeURIComponent(jsonString)));
      const dataUrl = `data:application/json;base64,${base64}`;
      
      const filename = `${currentMarketplace}-cookies-${Date.now()}.json`;
      
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          showStatus('error', '❌ Download failed: ' + chrome.runtime.lastError.message);
        } else {
          showStatus('success', `✅ Downloaded ${filename}`);
        }
      });
    }
  });
}

/**
 * Show status message
 */
function showStatus(type, message) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.whiteSpace = 'pre-line';
}
