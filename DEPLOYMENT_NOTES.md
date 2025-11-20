# Deployment Notes

## Architecture Overview

### Frontend (Vercel)
- **URL**: https://your-app.vercel.app
- **Stack**: React + TypeScript + Vite
- **Features**: 
  - Virtual Closet inventory management
  - Barcode scanning
  - Stats dashboard
  - Marketplace connection status page
  - Vercel Analytics enabled

### API Server (Separate Deployment Required)
- **Location**: `server/api.js`
- **Port**: 3001 (configurable)
- **Purpose**: Handle Chrome extension requests
- **Endpoints**:
  - `POST /api/marketplace/save-credentials` - Save marketplace cookies
  - `GET /api/marketplace/credentials` - Get stored credentials
  - `DELETE /api/marketplace/credentials/:marketplace` - Remove credentials
  - `GET /api/health` - Health check

### Why Separate?

**Vercel Hobby Plan Limitation:**
- Max 12 serverless functions
- We had 19+ API functions
- Solution: Removed Vercel API functions, use standalone Express server

## Deployment Instructions

### 1. Frontend (Vercel) - Already Deployed ✅
- Automatic deployment on git push
- No additional configuration needed
- Analytics enabled by default

### 2. API Server (Manual Setup Required)

#### Option A: Deploy to Railway (Recommended)
```bash
# 1. Install Railway CLI
npm i -g @railway/cli

# 2. Login to Railway
railway login

# 3. Deploy from server directory
cd server
railway init
railway up
```

#### Option B: Deploy to Heroku
```bash
# 1. Create Procfile in server/
echo "web: node api.js" > Procfile

# 2. Deploy
heroku create your-app-api
git subtree push --prefix server heroku master
```

#### Option C: Deploy to Render
1. Go to https://render.com
2. Create new Web Service
3. Point to `/server` directory
4. Set start command: `node api.js`
5. Add environment variables

### 3. Update Extension Configuration

After deploying API server:

1. Get your API server URL (e.g., `https://your-api.railway.app`)
2. Edit `extension/background.js`:
   ```javascript
   const API_BASE_URL = 'https://your-api.railway.app';
   ```
3. Reload extension in Chrome

## Environment Variables

### Frontend (.env in root)
```
VITE_SUPABASE_URL=https://hqmujfbifgpcyqmpuwil.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### API Server (.env in server/)
```
VITE_SUPABASE_URL=https://hqmujfbifgpcyqmpuwil.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
API_PORT=3001
NODE_ENV=production
```

## Extension Installation

### For Users:

**Windows:**
```bash
# Run installer
install-extension.bat
```

**Mac/Linux:**
```bash
# Run installer
chmod +x install-extension.sh
./install-extension.sh
```

This will:
1. Copy extension files to `~/Downloads/VirtualCloset-Extension`
2. Generate placeholder icons
3. Open the folder for you

Then:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension folder

## Testing

### Frontend
```bash
npm run dev
# Open http://localhost:5173
```

### API Server
```bash
cd server
npm start
# Test: curl http://localhost:3001/api/health
```

### Extension
1. Load in Chrome
2. Get auth token from app (DevTools → Application → Local Storage)
3. Connect extension with token
4. Visit a marketplace (eBay, Poshmark, etc.)
5. Check extension popup for sync status

## Troubleshooting

### "Missing Supabase environment variables"
- Check `.env` file exists in root
- Verify all required variables are set
- Restart dev server

### Extension "Not authenticated" error
- Token expired - get fresh token from app
- API server not running - start `server/api.js`
- Wrong API URL - check `extension/background.js`

### Vercel build errors
- TypeScript errors - run `npm run build` locally first
- Missing dependencies - commit `package-lock.json`
- Function limit - we removed API functions to fix this

## Current Status

✅ Frontend deployed to Vercel  
✅ Vercel Analytics enabled  
✅ Chrome extension code ready  
⚠️ API server needs separate deployment  
⚠️ Extension needs configuration after API deployment  

## Next Steps

1. **Deploy API Server** - Choose Railway/Heroku/Render
2. **Update Extension** - Point to production API URL
3. **Test Extension** - Verify cookie sync works
4. **Distribute Extension** - Share installer scripts with users

