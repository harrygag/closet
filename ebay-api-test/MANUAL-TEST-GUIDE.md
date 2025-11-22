# eBay Integration - Manual Test Guide

## 🎯 Quick Test (5 minutes)

### Current Status:
- ✅ Server running: http://localhost:3002
- ✅ API endpoints working
- ✅ Auto-close OAuth working
- ⏳ Waiting for YOU to complete OAuth

---

## Step-by-Step Test:

### 1. Open Test Page
```
http://localhost:3002/public/test-integration.html
```

**You should see:**
- Red dot + "Disconnected"
- Activity log with status checks
- "Connect eBay" button

---

### 2. Click "Connect eBay"

**Popup opens (600x700)**
- URL: http://localhost:3002/auth/ebay
- Redirects to: https://auth.ebay.com/oauth2/authorize...

---

### 3. Complete eBay Login

**In the popup:**
1. Log in with your eBay credentials
2. Complete CAPTCHA if shown
3. Click "Agree" to grant permissions

**Success page shows:**
- ✅ Animated checkmark
- Purple gradient background
- "Closing automatically..."
- Manual "Close Window Now" button

**Popup auto-closes in 1 second**

---

### 4. Verify Connection

**Back on test page, you should see:**

✅ **Connection Status:**
```
Status: ✅ Connected
Subtitle: "Ready to sync inventory"
Green dot visible
```

✅ **Activity Log:**
```
[time] OAuth window closed, checking status...
[time] ✅ Connected to eBay!
[time] Fetching eBay stats...
[time] ✅ Stats updated: X listings
```

✅ **Stats Dashboard:**
```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ Total Listings  │ Active Listings │ Total Orders    │ Revenue         │
│ 0               │ 0               │ 0               │ $0.00           │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

---

## Troubleshooting

### Problem: Popup blocked
**Solution:** Allow popups for localhost:3002
- Browser will show "Popup blocked" icon in address bar
- Click it and select "Always allow popups"

### Problem: Popup doesn't close
**Solution:** Click "Close Window Now" button manually
- The button works even if auto-close fails

### Problem: Still shows "Disconnected" after OAuth
**Solution:** Click "Refresh Status" button
- Or wait 10 seconds for auto-refresh

### Problem: "Error: invalid_grant"
**Solution:** Complete OAuth again
- Old auth codes expire quickly
- Click "Connect eBay" again

---

## What Gets Tested:

### OAuth Flow
- ✅ Popup opens correctly
- ✅ Redirects to eBay
- ✅ Success page displays
- ✅ Auto-closes
- ✅ Parent receives message
- ✅ UI updates

### API Integration
- ✅ `/api/ebay/status` returns correct state
- ✅ `/api/ebay/stats` fetches data
- ✅ CORS headers enabled
- ✅ Real-time updates work

### User Experience
- ✅ Clear status indicators
- ✅ Activity logging
- ✅ Error handling
- ✅ Auto-refresh

---

## Expected File Changes:

After successful OAuth:

### `ebay-api-test/tokens.json`
```json
{
  "accessToken": "v^1.1#i^1...",
  "refreshToken": "v^1.1#i^1...",
  "expiresIn": 7200,
  "timestamp": 1234567890
}
```

### API Responses:

**GET /api/ebay/status**
```json
{
  "connected": true,
  "lastSync": null,
  "tokenExpiry": null
}
```

**GET /api/ebay/stats**
```json
{
  "totalListings": 0,
  "activeListings": 0,
  "totalOrders": 0,
  "revenue": 0
}
```

---

## Next Steps After Success:

### 1. Test Import
- Server has `/import/inventory` endpoint
- Fetches items from eBay API
- Transforms to Virtual Closet format
- Saves to `imported-inventory.json`

### 2. Integrate with Main App
- React app can call same APIs
- Use `EbayIntegrationPage` component
- Real-time status updates

### 3. Run Cypress Tests
```bash
npm run monitor
```

All tests should pass once authenticated!

---

## Debug Info:

### Check if authenticated:
```bash
# Check tokens file exists
ls ebay-api-test/tokens.json

# Check API status
curl http://localhost:3002/api/ebay/status
```

### Check logs:
```bash
# Server logs
Check terminal running: node server.js

# API logs (created by eBay API service)
ls ebay-api-test/logs/
```

### Cypress Reports:
```bash
ls ebay-api-test/cypress/reports/
- app-state.json
- file-check.json
- integration-report.json
```

---

## Success Criteria:

✅ OAuth completes without errors
✅ Popup closes automatically
✅ Test page shows "Connected"
✅ Green dot appears
✅ Stats dashboard visible
✅ Activity log shows success messages
✅ `/api/ebay/status` returns `connected: true`
✅ No errors in console

---

## Ready to Test?

1. Open: http://localhost:3002/public/test-integration.html
2. Click: "Connect eBay"
3. Complete login in popup
4. Watch it work!

**Report back what you see!** 🚀

