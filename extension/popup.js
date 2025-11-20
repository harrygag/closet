/**
 * Popup UI Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadStatus();
  setupEventListeners();
});

/**
 * Load current status from background script
 */
async function loadStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    
    // Update auth UI
    updateAuthUI(status.isAuthenticated);
    
    // Update marketplace statuses
    updateMarketplaceStatuses(status.marketplaces);
    
    // Show content, hide loading
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading status:', error);
    showError('Failed to load status');
  }
}

/**
 * Update authentication UI
 */
function updateAuthUI(isAuthenticated) {
  const authSection = document.getElementById('authSection');
  const disconnected = document.getElementById('authDisconnected');
  const connected = document.getElementById('authConnected');
  
  if (isAuthenticated) {
    authSection.classList.add('connected');
    authSection.classList.remove('disconnected');
    disconnected.classList.add('hidden');
    connected.classList.remove('hidden');
  } else {
    authSection.classList.add('disconnected');
    authSection.classList.remove('connected');
    disconnected.classList.remove('hidden');
    connected.classList.add('hidden');
  }
}

/**
 * Update marketplace sync statuses
 */
function updateMarketplaceStatuses(marketplaces) {
  for (const [marketplace, data] of Object.entries(marketplaces)) {
    const statusEl = document.getElementById(`${marketplace}-status`);
    if (!statusEl) continue;
    
    const indicator = statusEl.querySelector('.indicator');
    
    if (data.lastSync) {
      const timeAgo = formatTimeAgo(data.lastSync);
      indicator.className = 'indicator green';
      statusEl.innerHTML = `<span class="indicator green"></span>Synced ${timeAgo}`;
    } else {
      indicator.className = 'indicator red';
      statusEl.innerHTML = `<span class="indicator red"></span>Not synced`;
    }
  }
}

/**
 * Format timestamp as "X ago"
 */
function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Connect button
  document.getElementById('connectBtn').addEventListener('click', async () => {
    const token = document.getElementById('authTokenInput').value.trim();
    
    if (!token) {
      showError('Please enter your auth token');
      return;
    }
    
    try {
      await chrome.storage.local.set({ authToken: token });
      showSuccess('Connected to Virtual Closet!');
      await loadStatus();
    } catch (error) {
      showError('Failed to save token');
    }
  });
  
  // Disconnect button
  document.getElementById('disconnectBtn').addEventListener('click', async () => {
    try {
      await chrome.storage.local.remove(['authToken']);
      showSuccess('Disconnected');
      await loadStatus();
    } catch (error) {
      showError('Failed to disconnect');
    }
  });
  
  // Sync buttons
  document.querySelectorAll('[data-marketplace]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const marketplace = e.target.dataset.marketplace;
      const originalText = e.target.textContent;
      
      try {
        e.target.textContent = 'Syncing...';
        e.target.disabled = true;
        
        const result = await chrome.runtime.sendMessage({
          type: 'SYNC_MARKETPLACE',
          marketplace
        });
        
        if (result.success) {
          showSuccess(`${marketplace} synced! (${result.cookieCount} cookies)`);
          await loadStatus();
        } else {
          throw new Error(result.error || 'Sync failed');
        }
      } catch (error) {
        showError(error.message);
      } finally {
        e.target.textContent = originalText;
        e.target.disabled = false;
      }
    });
  });
}

/**
 * Show success message
 */
function showSuccess(message) {
  // Create a temporary toast notification
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(76, 175, 80, 0.95);
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 13px;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Show error message
 */
function showError(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(244, 67, 54, 0.95);
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 13px;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 4000);
}

