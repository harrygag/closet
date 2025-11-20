# Cookie Authentication Testing Guide

## Testing with Real Chrome Browser

The Chrome DevTools MCP gets detected as a bot, so we need to test with your actual browser.

## Step-by-Step Testing Process

### 1. Start Dev Server

```bash
npm run dev
```

The app should start at `http://localhost:5173`

### 2. Test Cookie Exporter Page

1. **Open in your real Chrome browser**: http://localhost:5173/cookie-exporter.html
2. You should see a purple gradient page with the Cookie Exporter UI

### 3. Login to eBay (or other marketplace)

**Option A: Open from Cookie Exporter**
- Click the "Open eBay" button on the cookie exporter page
- It will open eBay in a new tab
- Log into your account

**Option B: Manually open**
- Open new tab: https://www.ebay.com/sh/lst/active
- Log into your seller account

### 4. Export Cookies from eBay

**Method 1: Using Cookie Exporter (Easy)**

1. Go back to the Cookie Exporter tab (http://localhost:5173/cookie-exporter.html)
2. Click "eBay" button to select eBay
3. Click "🍪 Export Cookies" button
4. ⚠️ **Problem**: You'll get "No cookies found" because you're on localhost, not ebay.com

**Method 2: Open Cookie Exporter FROM eBay (Correct Way)**

1. While logged into eBay, open DevTools (F12)
2. Go to Console tab
3. Paste this code and press Enter:

```javascript
window.open('http://localhost:5173/cookie-exporter.html', '_blank', 'width=1000,height=800');
```

4. In the new popup, click "🍪 Export Cookies"
5. Cookies should appear in the textarea!

**Method 3: Using DevTools Console Directly**

While on eBay (logged in):
1. Press F12 to open DevTools
2. Go to Console tab
3. Paste this code:

```javascript
// Get all cookies and format as JSON
const cookies = document.cookie.split('; ').map(c => {
  const [name, ...v] = c.split('=');
  return {
    name,
    value: v.join('='),
    domain: window.location.hostname,
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'Lax'
  };
});

// Copy to clipboard
copy(JSON.stringify(cookies, null, 2));
console.log(`✅ Copied ${cookies.length} cookies to clipboard!`);
console.log('Cookies:', cookies);
```

4. The cookies are now in your clipboard!
5. Paste them somewhere to save

**Method 4: Using EditThisCookie Extension (Most Reliable)**

1. Install EditThisCookie: https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg
2. Go to eBay (logged in)
3. Click the EditThisCookie icon in toolbar
4. Click the Export button (folder icon at bottom)
5. Cookies are copied as JSON!

### 5. Save Cookies to Database

Once you have cookies copied:

1. Open the main app: http://localhost:5173
2. Click the "Marketplaces" button in header (blue button with +)
3. Select eBay marketplace
4. Select "Cookies" authentication method
5. Paste your cookies JSON into the textarea
6. Click "Save Cookies for Future Use"

### 6. Test Scraping with Cookies

1. In the Marketplace Importer modal
2. Make sure "Cookies" is selected
3. Paste your cookies (if not already saved)
4. Select "Fill Links" or "Import"
5. Click "Start Scraping"
6. Wait for results!

## Expected Cookie Format

```json
[
  {
    "name": "s",
    "value": "CgAD4ACB...",
    "domain": ".ebay.com",
    "path": "/",
    "secure": true,
    "httpOnly": true,
    "sameSite": "Lax"
  },
  {
    "name": "nonsession",
    "value": "CgADKACB...",
    "domain": ".ebay.com",
    "path": "/",
    "secure": true,
    "httpOnly": false,
    "sameSite": "Lax"
  }
]
```

## Important eBay Cookies to Look For

When you export cookies, make sure these are present:

- ✅ `s` - Session cookie (CRITICAL - this is the main one!)
- ✅ `nonsession` - User session data
- ✅ `dp1` - User preferences
- ✅ `ebay` - Additional session info

If these are missing, the scraper won't work!

## Troubleshooting

### "No cookies found"
- Make sure you're executing the export FROM the marketplace domain
- Try Method 3 or 4 above
- Check if cookies are enabled in browser

### "Invalid JSON format"
- Make sure you copied the entire JSON output
- Check for syntax errors (missing brackets, commas)
- Try the EditThisCookie extension for clean export

### "Scraper says not logged in"
- Cookies expired - re-export them
- You logged out after exporting - log back in
- Missing critical cookies (check for `s` cookie on eBay)

### Bot Detection
- Don't use browser automation tools
- Use your real browser
- Don't export cookies from the DevTools MCP - it gets detected

## Testing Checklist

- [ ] Dev server running on localhost:5173
- [ ] Cookie exporter page loads correctly
- [ ] Can log into eBay successfully
- [ ] Can export cookies using DevTools console method
- [ ] Cookies are valid JSON format
- [ ] Contains critical cookies (s, nonsession for eBay)
- [ ] Can save cookies via Marketplace Importer
- [ ] Can trigger scraping with saved cookies
- [ ] Scraper successfully authenticates
- [ ] Items are scraped and imported/updated

## Next Steps After Successful Test

1. Test with Poshmark cookies
2. Test with Depop cookies
3. Test cookie expiration handling
4. Test error messages when cookies are invalid
5. Update documentation with real-world examples




