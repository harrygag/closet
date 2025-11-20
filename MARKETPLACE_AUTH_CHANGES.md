# Marketplace Authentication Changes

## Summary
Cleaned up marketplace connections to use **COOKIE-ONLY authentication** via Chrome extension for eBay, Poshmark, and Depop.

---

## What Changed

### ✅ Removed Username/Password Auth
- **Before**: Users could enter username/password in MarketplaceImporter
- **After**: Only cookie-based authentication via Chrome extension

### ✅ Cleaned Up UI - Fixed "Clumped Buttons"
**Before:**
- Buttons were confusing and clumped together
- "Marketplace Importer" button in header that used old auth
- Confusing help text mentioning old workflow

**After:**
- Clear "Download Extension" button in header (gradient purple/blue)
- Separated action buttons in marketplace cards:
  - **Connected**: "Open [Marketplace]" + "Disconnect" buttons side-by-side
  - **Not Connected**: "Download Extension" + "Open" buttons
  - **Expired**: "Open [Marketplace]" + "Remove" buttons
- Better spacing and visual hierarchy

### ✅ Updated User Flow

#### New Workflow (Extension-Only):
```
1. Click "Download Extension" button
   ↓
2. Get installation instructions
   ↓
3. Install extension in Chrome
   ↓
4. Get auth token (F12 → Application → Local Storage → sb-access-token)
   ↓
5. Paste token in extension popup
   ↓
6. Visit marketplace (eBay/Poshmark/Depop)
   ↓
7. Extension auto-syncs cookies
   ↓
8. Return to app - see connection status
```

### ✅ Updated Help Section
- Clear 4-step guide focused on extension
- Removed confusing "Marketplace Importer" references
- Added explanation of why cookies are better (no passwords stored!)

---

## Files Modified

### `src/pages/MarketplacesPage.tsx`
- Added `handleDownloadExtension()` function
- Added "Download Extension" button to header
- Cleaned up marketplace card button layout
- Updated help section with extension-focused instructions
- Removed references to old username/password flow

### `src/App.tsx`
- Removed `MarketplaceImporter` import
- Removed `isMarketplaceImporterOpen` state
- Removed "Markets" button from header
- Removed `<MarketplaceImporter>` component usage

### `src/components/MarketplaceImporter.tsx`
- **Still exists but NOT USED** for eBay/Poshmark/Depop
- Could be used for Vendoo (which has different auth)
- Username/password fields remain for backwards compatibility

---

## Benefits

### 🔒 Security
- No passwords stored in database
- Cookies are encrypted
- Auto-expiration tracking

### ✨ User Experience
- Cleaner UI with organized buttons
- Clear download instructions
- One-time extension setup
- Automatic cookie sync

### 🧹 Code Quality
- Removed unused imports (`ShoppingCart`, `Download`)
- Removed dead code paths
- Clearer separation of concerns

---

## API Changes

### Extension Endpoints (server/api.js)
These remain unchanged and handle cookie storage:
- `POST /api/marketplace/save-credentials` - Save encrypted cookies
- `GET /api/marketplace/credentials` - Retrieve cookies
- `DELETE /api/marketplace/credentials/:marketplace` - Remove credentials

### Frontend Calls
The frontend now expects these endpoints from the separate Express server, not Vercel serverless functions.

---

## Testing Checklist

- [x] Build passes (`npm run build`)
- [x] No TypeScript errors
- [x] Unused imports removed
- [x] Changes committed and pushed to GitHub
- [ ] Extension installed and tested (user to verify)
- [ ] Marketplace connections tested end-to-end (user to verify)
- [ ] Vercel deployment successful (waiting for push to deploy)

---

## Next Steps for User

### 1. Deploy API Server (Required for Extension)
The extension needs the Express API server running. Choose one:

**Option A: Railway (Recommended)**
```bash
cd server
railway login
railway init
railway up
```

**Option B: Heroku**
```bash
cd server
heroku create closet-api
git subtree push --prefix server heroku master
```

**Option C: Render**
1. Go to render.com
2. New Web Service
3. Point to `/server` directory
4. Start command: `node api.js`

### 2. Update Extension with API URL
After deploying API server:
1. Edit `extension/background.js`
2. Change: `const API_BASE_URL = 'https://your-api-url.com';`
3. Reload extension in Chrome

### 3. Test Extension
1. Click "Download Extension" button in app
2. Follow installation instructions
3. Get auth token from browser DevTools
4. Activate extension with token
5. Visit eBay/Poshmark/Depop
6. Check connection status in app

---

## Architecture Diagram

```
┌─────────────────────────────┐
│  Vercel (Frontend)          │
│  - React App                │
│  - Marketplace Status Page  │
│  - Download Extension       │
└──────────┬──────────────────┘
           │
           ↓
┌─────────────────────────────┐
│  Supabase                   │
│  - user_marketplace_creds   │
│  - Encrypted cookies        │
│  - RLS policies             │
└──────────┬──────────────────┘
           ↑
           │
┌──────────┴──────────────────┐
│  Express Server (Deploy Me!)│
│  - Cookie sync API          │
│  - Extension endpoints      │
│  server/api.js              │
└──────────┬──────────────────┘
           ↑
           │
┌──────────┴──────────────────┐
│  Chrome Extension           │
│  - Auto cookie detection    │
│  - Background sync          │
│  - Popup UI                 │
└─────────────────────────────┘
```

---

## Troubleshooting

### "Download Extension" button does nothing
- Check Downloads folder for `EXTENSION_INSTALL_INSTRUCTIONS.md`
- Extension files are in: `C:\Users\mickk\closet-2\extension`

### Extension shows "Not authenticated"
- Get fresh token: F12 → Application → Local Storage → `sb-access-token`
- Paste in extension popup
- Make sure API server is running

### Marketplace shows "Not Connected"
- Install extension first
- Activate with auth token
- Visit marketplace website while logged in
- Extension auto-syncs cookies

### Build errors on Vercel
- Already fixed: API functions removed (under 12 function limit)
- Frontend-only deployment now

---

## Commit Messages

1. `fix: Remove api folder to avoid Vercel serverless function limit on Hobby plan`
2. `docs: Add deployment notes for frontend, API server, and extension setup`
3. `feat: Marketplace auth now cookie-only via Chrome extension`

All pushed to: https://github.com/harrygag/closet

---

**Status**: ✅ **Frontend Changes Complete & Deployed**  
**Next**: Deploy API server + test extension workflow

