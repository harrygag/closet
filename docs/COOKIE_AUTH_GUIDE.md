# Cookie-Based Authentication Guide

## Overview

Instead of automating logins (which triggers anti-bot protection), we use **cookie extraction** from your already-logged-in browser session. This is more reliable and secure.

## How It Works

1. **User logs into marketplace** in their regular browser (Chrome, Firefox, etc.)
2. **User exports cookies** using a browser extension or DevTools
3. **User pastes cookies** into the app
4. **Puppeteer uses those cookies** to authenticate scraping sessions

## Method 1: Using EditThisCookie Extension (Recommended)

### Installation
1. Install **EditThisCookie** extension:
   - Chrome: https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg
   - Firefox: https://addons.mozilla.org/en-US/firefox/addon/etc2/

### Exporting Cookies

#### eBay
1. Go to https://www.ebay.com/sh/lst/active (your seller hub)
2. Make sure you're logged in
3. Click the **EditThisCookie** icon in your browser toolbar
4. Click the **Export** button (looks like a folder icon)
5. Cookies are copied to clipboard as JSON
6. Paste into the app

#### Poshmark
1. Go to https://poshmark.com/closet (your closet)
2. Make sure you're logged in
3. Click **EditThisCookie** icon
4. Click **Export**
5. Paste into the app

#### Depop
1. Go to https://www.depop.com/[your-username]/ (your shop)
2. Make sure you're logged in
3. Click **EditThisCookie** icon
4. Click **Export**
5. Paste into the app

## Method 2: Using Browser DevTools (No Extension Needed)

### Chrome/Edge DevTools

1. **Open DevTools**: Press `F12` or right-click → "Inspect"
2. Go to **Console** tab
3. Paste this code and press Enter:

```javascript
// Export cookies as JSON
copy(JSON.stringify(await cookieStore.getAll()))
```

Or for older browsers:

```javascript
// Alternative method
copy(document.cookie.split('; ').map(c => {
  const [name, ...v] = c.split('=');
  return {
    name,
    value: v.join('='),
    domain: window.location.hostname,
    path: '/',
    secure: true,
    httpOnly: false
  };
}))
```

4. Cookies are now copied to clipboard
5. Paste into the app

### Firefox DevTools

1. **Open DevTools**: Press `F12`
2. Go to **Storage** tab → **Cookies**
3. Right-click on the domain → **Select All**
4. Right-click → **Copy** (or Ctrl+C)
5. You'll need to format this - use the extension method instead

## Method 3: Manual Cookie Export Script

Save this as `export-cookies.html` and open in your browser while logged in:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Cookie Exporter</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        button { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 4px; }
        textarea { width: 100%; height: 400px; margin-top: 20px; padding: 10px; font-family: monospace; }
        .success { color: green; font-weight: bold; }
    </style>
</head>
<body>
    <h1>🍪 Cookie Exporter for Marketplace Scraper</h1>
    
    <h2>Instructions:</h2>
    <ol>
        <li>Open the marketplace website in another tab (eBay, Poshmark, or Depop)</li>
        <li>Make sure you're logged in</li>
        <li>Come back to this tab</li>
        <li>Click "Export Cookies" below</li>
        <li>Copy the JSON and paste it into the app</li>
    </ol>
    
    <p><strong>Current Domain:</strong> <span id="domain">N/A</span></p>
    <p><strong>Cookies Found:</strong> <span id="count">0</span></p>
    
    <button onclick="exportCookies()">Export Cookies</button>
    <button onclick="clearOutput()">Clear</button>
    
    <p id="status"></p>
    <textarea id="output" placeholder="Cookies will appear here..."></textarea>
    
    <script>
        function exportCookies() {
            try {
                // Get all cookies for current domain
                const cookies = document.cookie.split('; ').map(cookie => {
                    const [name, ...valueParts] = cookie.split('=');
                    return {
                        name: name,
                        value: valueParts.join('='),
                        domain: window.location.hostname,
                        path: '/',
                        secure: window.location.protocol === 'https:',
                        httpOnly: false, // Can't access httpOnly cookies from JS
                        sameSite: 'Lax'
                    };
                });
                
                if (cookies.length === 0 || (cookies.length === 1 && !cookies[0].name)) {
                    document.getElementById('status').innerHTML = '❌ No cookies found! Make sure you\'re logged into a marketplace.';
                    document.getElementById('status').style.color = 'red';
                    return;
                }
                
                const json = JSON.stringify(cookies, null, 2);
                document.getElementById('output').value = json;
                document.getElementById('domain').textContent = window.location.hostname;
                document.getElementById('count').textContent = cookies.length;
                document.getElementById('status').innerHTML = '✅ Cookies exported! Copy from textarea below.';
                document.getElementById('status').className = 'success';
                
                // Auto-copy to clipboard
                navigator.clipboard.writeText(json).then(() => {
                    document.getElementById('status').innerHTML = '✅ Cookies copied to clipboard!';
                });
            } catch (error) {
                document.getElementById('status').innerHTML = '❌ Error: ' + error.message;
                document.getElementById('status').style.color = 'red';
            }
        }
        
        function clearOutput() {
            document.getElementById('output').value = '';
            document.getElementById('status').innerHTML = '';
        }
    </script>
</body>
</html>
```

## Cookie Format

Cookies should be in this JSON format:

```json
[
  {
    "name": "session_id",
    "value": "abc123xyz",
    "domain": ".ebay.com",
    "path": "/",
    "secure": true,
    "httpOnly": true,
    "sameSite": "Lax"
  },
  {
    "name": "user_token",
    "value": "def456uvw",
    "domain": ".ebay.com",
    "path": "/",
    "secure": true,
    "httpOnly": false,
    "sameSite": "None"
  }
]
```

## Important Cookie Names by Marketplace

### eBay
- `s` - Session cookie (critical)
- `nonsession` - User session
- `dp1` - User preferences
- `ebay` - Main session token

### Poshmark
- `_posh_session` - Main session cookie (critical)
- `user_id` - User identifier
- `session_id` - Session token

### Depop
- `session_id` - Main session (critical)
- `_depop_session` - Session token
- `user_token` - Authentication token

## Security Best Practices

⚠️ **IMPORTANT**:
1. **Never share your cookies** - They're like passwords
2. **Cookies expire** - You may need to re-export periodically
3. **We encrypt cookies** - Stored securely in the database
4. **Logout invalidates cookies** - Don't log out from the marketplace

## Troubleshooting

### "Scraper says I'm not logged in"
- Re-export cookies while logged in
- Make sure you copied ALL cookies
- Check if cookies expired (try logging in again)

### "No cookies found"
- Make sure you're ON the marketplace domain when exporting
- Try the EditThisCookie extension instead
- Check if cookies are enabled in your browser

### "401 Unauthorized" errors
- Cookies expired - re-export them
- You logged out - log back in and re-export
- Try clearing and re-setting cookies

## Cookie Lifespan

- **eBay**: Usually 1-7 days
- **Poshmark**: Usually 30 days
- **Depop**: Usually 14 days

You'll need to re-export when they expire.




