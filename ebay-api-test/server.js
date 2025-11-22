import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Enable CORS for main app
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

// Serve static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// eBay API endpoints
const EBAY_ENDPOINTS = {
  SANDBOX: {
    oauth: 'https://auth.sandbox.ebay.com/oauth2/authorize',
    token: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
    inventory: 'https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item'
  },
  PRODUCTION: {
    oauth: 'https://auth.ebay.com/oauth2/authorize',
    token: 'https://api.ebay.com/identity/v1/oauth2/token',
    inventory: 'https://api.ebay.com/sell/inventory/v1/inventory_item'
  }
};

const ENV = process.env.EBAY_ENVIRONMENT || 'SANDBOX';
const ENDPOINTS = EBAY_ENDPOINTS[ENV];

// Store tokens - persist to file
let accessToken = null;
let refreshToken = null;
const TOKENS_FILE = path.join(__dirname, 'tokens.json');

// Load tokens on startup
function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
      accessToken = data.accessToken;
      refreshToken = data.refreshToken;
      console.log('✅ Loaded saved tokens from file');
      console.log(`   Token expires: ${new Date(data.timestamp + (data.expiresIn * 1000)).toLocaleString()}`);
      return true;
    }
  } catch (error) {
    console.error('❌ Failed to load tokens:', error.message);
  }
  return false;
}

// Save tokens to file
function saveTokens(access, refresh, expiresIn) {
  try {
    const data = {
      accessToken: access,
      refreshToken: refresh,
      expiresIn,
      timestamp: Date.now(),
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Tokens saved to tokens.json');
    return true;
  } catch (error) {
    console.error('❌ Failed to save tokens:', error.message);
    return false;
  }
}

// Delete tokens
function deleteTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      fs.unlinkSync(TOKENS_FILE);
      console.log('✅ Tokens deleted');
    }
    accessToken = null;
    refreshToken = null;
    return true;
  } catch (error) {
    console.error('❌ Failed to delete tokens:', error.message);
    return false;
  }
}

// Load tokens on startup
loadTokens();

// API: Check auth status (for AJAX requests)
app.get('/api/auth/status', (req, res) => {
  res.json({
    authenticated: !!accessToken,
    tokenPresent: !!accessToken,
    expiresIn: accessToken ? 3600 : 0, // Placeholder
    timestamp: Date.now()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>eBay API Test Server</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: #1a1a1a;
          color: #fff;
        }
        button {
          padding: 12px 24px;
          font-size: 16px;
          cursor: pointer;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          margin: 8px 0;
          transition: all 0.2s;
        }
        .primary { background: #8b5cf6; color: white; }
        .primary:hover { background: #7c3aed; }
        .success { background: #059669; color: white; }
        .success:hover { background: #047857; }
        .danger { background: #dc2626; color: white; }
        .danger:hover { background: #b91c1c; }
        .status { 
          padding: 12px 20px; 
          margin: 20px 0; 
          border-radius: 8px;
          background: rgba(255,255,255,0.05);
        }
      </style>
    </head>
    <body>
      <h1>eBay API Test Server (${ENV})</h1>
      <div class="status" id="auth-status">
        Status: <span id="status-text">${accessToken ? '✅ Authenticated' : '❌ Not authenticated'}</span>
      </div>
      
      ${!accessToken ? `
        <button class="primary" onclick="connectEbay()">
          🔐 Connect eBay Account
        </button>
      ` : `
        <a href="/import/inventory">
          <button class="success">📥 Import Inventory (Full)</button>
        </a><br>
        <a href="/test/inventory">
          <button class="primary">📦 Test Inventory Fetch</button>
        </a><br>
        <a href="/auth/logout">
          <button class="danger">🚪 Logout</button>
        </a>
      `}
      
      <h3>Setup Instructions:</h3>
      <ol>
        <li>Copy <code>env.template</code> to <code>.env</code></li>
        <li>Get credentials from <a href="https://developer.ebay.com/my/keys" target="_blank">eBay Developer Portal</a></li>
        <li>Add your App ID and Cert ID to .env</li>
        <li>Click "Connect eBay Account" above</li>
      </ol>
      
      <script>
        console.log('🎯 Auth listeners initialized');
        
        // Method 1: Listen for postMessage from popup
        window.addEventListener('message', (event) => {
          console.log('📨 Received message:', event.data);
          if (event.data.type === 'EBAY_AUTH_SUCCESS') {
            console.log('✅ OAuth successful via postMessage!');
            showAuthSuccess();
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        });
        
        // Method 2: Listen for localStorage changes
        window.addEventListener('storage', (event) => {
          console.log('💾 Storage changed:', event.key);
          if (event.key === 'ebay_auth_complete') {
            console.log('✅ OAuth successful via localStorage!');
            showAuthSuccess();
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        });
        
        // Method 3: Poll for changes (most reliable)
        let lastCheck = localStorage.getItem('ebay_auth_complete') || '0';
        setInterval(() => {
          const current = localStorage.getItem('ebay_auth_complete') || '0';
          if (current !== lastCheck && current !== '0') {
            console.log('✅ OAuth successful via polling!');
            lastCheck = current;
            showAuthSuccess();
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        }, 500);
        
        // Method 4: BroadcastChannel
        try {
          const bc = new BroadcastChannel('ebay_auth');
          bc.onmessage = (event) => {
            console.log('📡 Broadcast received:', event.data);
            if (event.data.type === 'AUTH_SUCCESS') {
              console.log('✅ OAuth successful via BroadcastChannel!');
              showAuthSuccess();
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            }
          };
        } catch (e) {
          console.log('⚠️ BroadcastChannel not available');
        }
        
        // Show success banner
        function showAuthSuccess() {
          const banner = document.createElement('div');
          banner.style.cssText = \`
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 10000;
            font-weight: bold;
            animation: slideIn 0.3s ease-out;
          \`;
          banner.innerHTML = '✅ eBay Connected! Refreshing...';
          document.body.appendChild(banner);
          
          // Add animation
          const style = document.createElement('style');
          style.textContent = \`
            @keyframes slideIn {
              from { transform: translateX(400px); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          \`;
          document.head.appendChild(style);
        }
        
        // Check auth status on page load
        async function checkAuthStatus() {
          try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            console.log('🔍 Auth status:', data);
            
            if (data.authenticated) {
              console.log('✅ Already authenticated!');
              document.getElementById('status-text').textContent = '✅ Authenticated';
              // Hide connect button, show authenticated features
              updateUI(true);
            } else {
              console.log('❌ Not authenticated');
              document.getElementById('status-text').textContent = '❌ Not authenticated';
              updateUI(false);
            }
          } catch (e) {
            console.error('Failed to check auth:', e);
          }
        }
        
        // Update UI based on auth state
        function updateUI(isAuthenticated) {
          // This would dynamically show/hide elements
          // For now, just log
          console.log('UI updated, authenticated:', isAuthenticated);
          
          if (isAuthenticated) {
            // Show success message if just authenticated
            if (localStorage.getItem('ebay_auth_complete')) {
              showAuthSuccess();
              // Clear flag
              localStorage.removeItem('ebay_auth_complete');
            }
          }
        }
        
        // Check status on load
        window.addEventListener('DOMContentLoaded', checkAuthStatus);
        
        // Also check when window regains focus (after popup closes)
        window.addEventListener('focus', () => {
          console.log('🎯 Window focused, checking auth...');
          checkAuthStatus();
        });
        
        // Open OAuth in popup
        function connectEbay() {
          const width = 600;
          const height = 700;
          const left = window.screen.width / 2 - width / 2;
          const top = window.screen.height / 2 - height / 2;
          
          const popup = window.open(
            '/auth/ebay',
            'eBay OAuth',
            \`width=\${width},height=\${height},left=\${left},top=\${top}\`
          );
          
          if (!popup) {
            alert('Popup blocked! Please allow popups for this site.');
            return;
          }
          
          // Check if popup closed
          const checkClosed = setInterval(() => {
            if (popup.closed) {
              clearInterval(checkClosed);
              console.log('Popup closed, checking auth status...');
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            }
          }, 500);
        }
      </script>
    </body>
    </html>
  `);
});

// Step 1: Redirect to eBay OAuth
app.get('/auth/ebay', (req, res) => {
  const appId = process.env.EBAY_APP_ID;
  const ruName = process.env.EBAY_RUNAME;
  
  if (!appId || !ruName) {
    return res.status(500).send('Missing EBAY_APP_ID or EBAY_RUNAME in .env file');
  }
  
  // Scopes needed for inventory access
  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly'
  ].join(' ');
  
  const authUrl = `${ENDPOINTS.oauth}?` + new URLSearchParams({
    client_id: appId,
    response_type: 'code',
    redirect_uri: ruName,  // Use RuName instead of direct URL
    scope: scopes
  });
  
  console.log('🔐 Redirecting to eBay OAuth:', authUrl);
  res.redirect(authUrl);
});

// Step 2: Handle OAuth callback
app.get('/auth/ebay/callback', async (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    return res.status(400).send('No authorization code received');
  }
  
  console.log('✅ Received auth code:', code.substring(0, 20) + '...');
  
  try {
    // Exchange code for access token
    const appId = process.env.EBAY_APP_ID;
    const certId = process.env.EBAY_CERT_ID;
    const ruName = process.env.EBAY_RUNAME;
    
    const credentials = Buffer.from(`${appId}:${certId}`).toString('base64');
    
    const response = await axios.post(
      ENDPOINTS.token,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: ruName  // Use RuName in token exchange too
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      }
    );
    
    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;
    
    // Save tokens using our persistent save function
    saveTokens(accessToken, refreshToken, response.data.expires_in);
    
    console.log('🎉 Successfully authenticated with eBay!');
    console.log('✅ Access token saved to tokens.json');
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>eBay Connected!</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
          }
          .checkmark {
            font-size: 80px;
            animation: scaleIn 0.5s ease-out;
          }
          @keyframes scaleIn {
            from { transform: scale(0); }
            to { transform: scale(1); }
          }
          h1 { margin: 20px 0; }
          .closing { 
            color: #10b981; 
            font-weight: bold; 
            animation: pulse 1s infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          button {
            margin-top: 20px;
            padding: 12px 24px;
            font-size: 16px;
            background: white;
            color: #667eea;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
          }
          button:hover {
            background: #f0f0f0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="checkmark">✅</div>
          <h1>eBay Connected Successfully!</h1>
          <p>Token expires in: ${response.data.expires_in} seconds</p>
          <p class="closing">Closing automatically...</p>
          <button id="closeBtn">Close Window Now</button>
        </div>
        
        <script>
          console.log('🔔 Auth successful! Notifying parent and closing...');
          
          // Multi-method notification system
          function notifyParent() {
            const message = {
              type: 'EBAY_AUTH_SUCCESS',
              success: true,
              timestamp: Date.now()
            };
            
            console.log('📤 Sending notifications...');
            
            // Method 1: postMessage to opener
            if (window.opener && !window.opener.closed) {
              try {
                window.opener.postMessage(message, '*');
                console.log('✅ Sent postMessage to opener');
              } catch (e) {
                console.error('❌ postMessage failed:', e);
              }
            } else {
              console.warn('⚠️ No window.opener available');
            }
            
            // Method 2: localStorage (cross-window)
            try {
              localStorage.setItem('ebay_auth_complete', Date.now().toString());
              console.log('✅ Set localStorage flag');
            } catch (e) {
              console.error('❌ localStorage failed:', e);
            }
            
            // Method 3: BroadcastChannel
            try {
              const bc = new BroadcastChannel('ebay_auth');
              bc.postMessage(message);
              bc.close();
              console.log('✅ Broadcast sent');
            } catch (e) {
              console.error('❌ BroadcastChannel failed:', e);
            }
          }
          
          // Close window function with aggressive fallbacks
          function closeWindow() {
            console.log('🚪 Attempting to close window...');
            
            // Notify parent one more time before closing
            notifyParent();
            
            // Try to close immediately
            try {
              window.close();
              console.log('✅ window.close() called');
            } catch (e) {
              console.error('❌ window.close() failed:', e);
            }
            
            // If still here after 500ms, try harder
            setTimeout(() => {
              console.log('⚠️ Still open after 500ms, trying harder...');
              
              // Focus opener and try to close
              if (window.opener && !window.opener.closed) {
                try {
                  window.opener.focus();
                  window.close();
                } catch (e) {
                  console.error('❌ Opener-based close failed:', e);
                }
              }
              
              // Last resort after another 500ms
              setTimeout(() => {
                console.log('⚠️ Final attempt: navigating to about:blank');
                try {
                  window.location.href = 'about:blank';
                  window.close();
                } catch (e) {
                  console.error('❌ All close methods failed:', e);
                }
              }, 500);
            }, 500);
          }
          
          // Send notification immediately on load
          notifyParent();
          
          // Manual close button
          const btn = document.getElementById('closeBtn');
          if (btn) {
            btn.addEventListener('click', function(e) {
              e.preventDefault();
              console.log('👆 Manual close button clicked');
              closeWindow();
            });
          }
          
          // Auto-close after 1.5 seconds (shortened for faster UX)
          console.log('⏱️ Auto-close scheduled in 1.5 seconds...');
          setTimeout(() => {
            console.log('⏱️ Auto-close timer fired!');
            closeWindow();
          }, 1500);
        </script>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('❌ Token exchange failed:', error.response?.data || error.message);
    res.status(500).send(`
      <h1>❌ Authentication Failed</h1>
      <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
      <a href="/">Back to Home</a>
    `);
  }
});

// Import endpoint: Full import with transformation
app.get('/import/inventory', async (req, res) => {
  if (!accessToken) {
    return res.status(401).send('Not authenticated. <a href="/auth/ebay">Login first</a>');
  }
  
  try {
    console.log('📥 Starting full inventory import...');
    
    const { importInventory } = await import('./import-inventory.js');
    const result = await importInventory(accessToken, {
      limit: 100,
      savePath: path.join(__dirname, 'imported-inventory.json')
    });
    
    if (result.success) {
      res.send(`
        <h1>✅ Import Successful!</h1>
        <p>Imported ${result.total} items from eBay</p>
        <p>Saved to: ${result.savedTo}</p>
        <br>
        <h3>Sample Items:</h3>
        <pre>${JSON.stringify(result.items.slice(0, 3), null, 2)}</pre>
        <br>
        <a href="/">
          <button style="padding: 12px 24px;">🏠 Back to Home</button>
        </a>
      `);
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    res.status(500).send(`
      <h1>❌ Import Failed</h1>
      <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
      <a href="/">Back to Home</a>
    `);
  }
});

// Test endpoint: Fetch inventory items
app.get('/test/inventory', async (req, res) => {
  if (!accessToken) {
    return res.status(401).send('Not authenticated. <a href="/auth/ebay">Login first</a>');
  }
  
  try {
    console.log('📦 Fetching inventory items...');
    
    const response = await axios.get(ENDPOINTS.inventory, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      params: {
        limit: 10
      }
    });
    
    const items = response.data.inventoryItems || [];
    
    console.log(`✅ Found ${items.length} inventory items`);
    
    // Save to file for inspection
    fs.writeFileSync(
      path.join(__dirname, 'inventory.json'),
      JSON.stringify(response.data, null, 2)
    );
    
    res.send(`
      <h1>📦 Inventory Items (${items.length} found)</h1>
      <pre>${JSON.stringify(response.data, null, 2)}</pre>
      <p>✅ Saved to inventory.json</p>
      <a href="/">
        <button style="padding: 12px 24px;">🏠 Back to Home</button>
      </a>
    `);
    
  } catch (error) {
    console.error('❌ Inventory fetch failed:', error.response?.data || error.message);
    res.status(500).send(`
      <h1>❌ Inventory Fetch Failed</h1>
      <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
      <a href="/">Back to Home</a>
    `);
  }
});

// Logout
app.get('/auth/logout', (req, res) => {
  accessToken = null;
  refreshToken = null;
  
  if (fs.existsSync(path.join(__dirname, 'tokens.json'))) {
    fs.unlinkSync(path.join(__dirname, 'tokens.json'));
  }
  
  res.send(`
    <h1>👋 Logged Out</h1>
    <a href="/">
      <button style="padding: 12px 24px; font-size: 16px;">
        🏠 Back to Home
      </button>
    </a>
  `);
});

// API Endpoints for main app integration
app.get('/api/ebay/status', (req, res) => {
  // Load token info from file if available
  let tokenInfo = null;
  if (fs.existsSync(TOKENS_FILE)) {
    try {
      tokenInfo = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch (e) {
      console.error('Failed to read token file:', e);
    }
  }
  
  res.json({
    connected: !!accessToken,
    hasToken: !!accessToken,
    lastSync: tokenInfo?.savedAt || null,
    tokenExpiry: tokenInfo ? new Date(tokenInfo.timestamp + (tokenInfo.expiresIn * 1000)).toISOString() : null,
    timestamp: Date.now()
  });
});

app.get('/api/ebay/stats', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    // Use the eBay API service to fetch REAL data
    const { EbayAPI } = await import('./services/ebay-api.js');
    const ebayClient = new EbayAPI(accessToken);
    
    // Fetch inventory items
    const inventoryResult = await ebayClient.getInventoryItems(100);
    
    if (!inventoryResult.success) {
      throw new Error('Failed to fetch inventory');
    }
    
    const items = inventoryResult.data.inventoryItems || [];
    
    // Calculate stats
    const stats = {
      totalListings: items.length,
      activeListings: items.filter(item => item.availability?.shipToLocationAvailability?.quantity > 0).length,
      totalOrders: 0, // Would need fulfillment API call
      revenue: 0, // Would need analytics API call
      lastSync: new Date().toISOString()
    };
    
    console.log('📊 Stats fetched:', stats);
    
    res.json(stats);
  } catch (error) {
    console.error('❌ Stats fetch failed:', error);
    
    // Return mock data if API fails
    res.json({
      totalListings: 0,
      activeListings: 0,
      totalOrders: 0,
      revenue: 0,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 eBay API Test Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Environment: ${ENV}
Server: http://localhost:${PORT}

Next Steps:
1. Copy env.template to .env
2. Add eBay credentials to .env
3. Visit http://localhost:${PORT}
4. Click "Connect eBay Account"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

