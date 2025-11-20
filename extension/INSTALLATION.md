# 🚀 Chrome Extension Installation Guide

## Step 1: Add Icon Files

Before loading the extension, you need to add icon files:

1. Go to `extension/icons/` folder
2. Read `ICONS_NEEDED.md` for instructions
3. Add 4 PNG files: `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`

**Quick fix:** You can use any PNG images temporarily, just rename them correctly.

## Step 2: Load Extension in Chrome

1. Open Chrome browser
2. Go to `chrome://extensions/`
3. Enable **"Developer mode"** (toggle in top-right corner)
4. Click **"Load unpacked"** button
5. Navigate to your project's `extension/` folder
6. Select it and click "Open"
7. ✅ Extension should now appear in your extensions list!

## Step 3: Pin the Extension

1. Click the puzzle piece icon (🧩) in Chrome toolbar
2. Find "Virtual Closet - Marketplace Connector"
3. Click the pin icon to keep it visible

## Step 4: Get Your Auth Token

1. Open your Virtual Closet app: http://localhost:5173
2. Make sure you're logged in
3. Open Chrome DevTools (press F12 or right-click → Inspect)
4. Go to **Application** tab
5. In left sidebar: **Local Storage** → **http://localhost:5173**
6. Find the key named `sb-hqmujfbifgpcyqmpuwil-auth-token`
7. Click on it and copy the **entire JSON value**
8. Look for the `access_token` field in that JSON - copy JUST that token value

**Example token format:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbXVqZmJpZmdwY3lxbXB1d2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NjY0NzYsImV4cCI6MjA3NjA0MjQ3Nn0._1HulRiQ3wxfzgDCBRruiJIl4QjXnnhKkuWQOTIa7SQ
```

## Step 5: Connect Extension to Your Account

1. Click the extension icon in your Chrome toolbar
2. Paste your auth token into the input field
3. Click **"Connect to Virtual Closet"**
4. ✅ You should see "Connected to Virtual Closet!"

## Step 6: Test It!

1. Visit one of these marketplaces while logged in:
   - https://www.ebay.com
   - https://poshmark.com
   - https://www.depop.com
   - https://www.vendoo.com

2. After a few seconds, you should see a notification:
   - "✅ eBay cookies synced!" (or whichever marketplace)

3. Click the extension icon to verify:
   - You should see "Synced Xm ago" next to the marketplace

## 🐛 Troubleshooting

### Extension won't load
- **Missing icons:** Add placeholder PNG files to `extension/icons/`
- **Syntax errors:** Check browser console for JavaScript errors

### "Not authenticated" error
- Make sure you copied the ENTIRE access token
- Token should start with `eyJ...`
- Try getting a fresh token (log out and log back in)

### "No cookies found"
- Make sure you're actually logged into the marketplace
- Try refreshing the marketplace page
- Check that you're on the correct domain (e.g., .ebay.com not .ebay.co.uk)

### Cookies not syncing automatically
- Open Chrome DevTools Console (F12)
- Look for logs starting with `[VirtualCloset]`
- Check if there are any error messages

### API connection failed
- Make sure your Virtual Closet app is running on http://localhost:5173
- Check that the auth token hasn't expired
- Look at Network tab in DevTools to see the API call

## 📝 Next Steps

Once the extension is working:

1. Visit each marketplace you use
2. Log in normally
3. Let the extension sync your cookies
4. Go to your Virtual Closet app → Marketplaces page
5. Verify all marketplaces show as "Connected"

## 🎯 For Production Use

To use this extension with a production URL (not localhost):

1. Edit `extension/background.js`
2. Change line 16:
   ```javascript
   const API_BASE_URL = 'https://your-production-url.com';
   ```
3. Save and reload the extension
4. Get a new auth token from production
5. Reconnect the extension

## Need Help?

Check the browser console (F12) for detailed error logs. All extension activity is logged with `[VirtualCloset]` prefix.

