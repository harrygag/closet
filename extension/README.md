# Virtual Closet - Marketplace Connector Extension

Auto-sync your marketplace cookies to Virtual Closet for seamless scraping.

## 🚀 Features

- **Auto-detect**: Automatically detects when you visit eBay, Poshmark, Depop, or Vendoo
- **Auto-sync**: Extracts and syncs cookies to your Virtual Closet account
- **Smart timing**: Only syncs every 5 minutes to avoid spam
- **Manual control**: Sync any marketplace on-demand from the popup
- **Status tracking**: See last sync time for each marketplace

## 📦 Installation (Development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/` folder from your Virtual Closet project
5. The extension icon should appear in your browser toolbar

## 🔧 Setup

1. Click the extension icon in your toolbar
2. Copy your auth token from Virtual Closet app:
   - Go to http://localhost:5173
   - Open DevTools (F12)
   - Go to Application tab → Local Storage → http://localhost:5173
   - Copy the value of `supabase.auth.token` (the access_token part)
3. Paste the token into the extension popup
4. Click "Connect to Virtual Closet"
5. You're ready! Visit any marketplace while logged in

## 🎯 Usage

### Automatic Sync
1. Log into eBay, Poshmark, Depop, or Vendoo
2. Extension automatically detects you're logged in
3. Cookies are synced to Virtual Closet
4. You'll see a notification: "✅ [Marketplace] cookies synced!"

### Manual Sync
1. Click the extension icon
2. Click "Sync Now" next to any marketplace
3. Cookies are immediately synced

## 🔐 Security

- Cookies are encrypted before being sent to the API
- Auth token is stored locally in your browser
- Only sends cookies when you're authenticated
- Requires explicit permission for each marketplace domain

## 🐛 Troubleshooting

### "Not authenticated" error
- Make sure you've pasted a valid auth token
- Token format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- Get a fresh token from your Virtual Closet app

### "No cookies found"
- Make sure you're logged into the marketplace
- Try refreshing the page
- Clear your browser cache and log in again

### "API returned 401"
- Your auth token has expired
- Get a new token from Virtual Closet app
- Reconnect the extension

## 🛠️ Development

### File Structure
```
extension/
├── manifest.json       # Extension config
├── background.js       # Service worker (auto-sync logic)
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic
├── content.js         # Runs on marketplace pages
├── icons/             # Extension icons
└── README.md          # This file
```

### API Endpoint

The extension calls:
```
POST http://localhost:5173/api/marketplace/save-credentials
Authorization: Bearer {authToken}

Body:
{
  "marketplace": "ebay" | "poshmark" | "depop" | "vendoo",
  "cookies": [...],
  "email": "user@example.com",
  "autoSynced": true
}
```

### Logging

Open Chrome DevTools Console to see extension logs:
- `[VirtualCloset] Detected ebay visit`
- `[VirtualCloset] User is logged in to eBay`
- `[VirtualCloset] Syncing ebay cookies...`

## 📝 TODO

- [ ] Add icon assets (16x16, 32x32, 48x48, 128x128)
- [ ] Add expiration warning before cookies expire
- [ ] Support custom API URL (for production)
- [ ] Add settings page for advanced config
- [ ] Auto-refresh expired cookies when detected

## 📄 License

Same as Virtual Closet project

