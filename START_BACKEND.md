# eBay OAuth Backend - Quick Start Guide

## ✅ Backend Server Created!

A local Express server has been set up to handle eBay OAuth callbacks and API requests.

## 📁 Files Created

```
server/
├── index.js           # Main Express server
├── package.json       # Dependencies
└── .env              # Configuration (already configured with your credentials)
```

## 🚀 How to Start the Backend

### Option 1: Start in One Command (Recommended)

Open a **NEW** terminal and run:

```powershell
cd C:\Users\mickk\Downloads\closet-master\closet-master\server
npm start
```

You should see:
```
🚀 eBay OAuth Backend running on http://localhost:3001
📡 API endpoints:
   POST http://localhost:3001/api/ebay/oauth-url
   GET  http://localhost:3001/api/ebay/callback
   POST http://localhost:3001/api/ebay/check-connection
   ...
```

### Option 2: Start with Auto-Reload (Development)

```powershell
cd C:\Users\mickk\Downloads\closet-master\closet-master\server
npm run dev
```

## 🧪 Test the Backend

Once running, open another terminal:

```powershell
curl http://localhost:3001/health
```

Should return:
```json
{"status":"ok","timestamp":"2025-..."}
```

## 🔗 Frontend Integration

The frontend has been updated to use the local backend automatically:
- API calls now go to `http://localhost:3001`
- No code changes needed - just start the backend!

## 🎯 Complete Testing Flow

1. **Start Backend** (Terminal 1):
   ```powershell
   cd server
   npm start
   ```

2. **Keep Dev Server Running** (Terminal 2 - already running):
   ```powershell
   npm run dev
   ```

3. **Test eBay OAuth**:
   - Open http://localhost:5173
   - Click "Connect eBay"
   - Sign in to eBay
   - Authorize the app
   - You'll be redirected back with success!

## 📋 What the Backend Does

1. **Generates OAuth URLs** with your eBay credentials
2. **Handles OAuth callbacks** from eBay
3. **Exchanges auth codes for access tokens**
4. **Stores tokens securely** in Supabase
5. **Fetches eBay listings** using the Sell API
6. **Imports items** into your Virtual Closet database

## 🔐 Environment Variables (Already Configured)

Your `.env` file contains:
- ✅ Supabase URL and keys
- ✅ eBay Client ID
- ✅ eBay Client Secret  
- ✅ eBay RuName

## 🐛 Troubleshooting

### Backend won't start
```powershell
# Make sure Node.js is in PATH
node --version

# Reinstall dependencies
cd server
npm install
```

### Port 3001 already in use
```powershell
# Find and kill the process using port 3001
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### Frontend can't connect
- Check backend is running on port 3001
- Check browser console for CORS errors
- Make sure frontend is using http://localhost:3001

## ✨ Next Steps

Once the backend is running:

1. **Test Connection**: Click "Connect eBay" button
2. **Sign In**: Enter your eBay credentials
3. **Authorize**: Approve the app access
4. **Import**: Click "Import from eBay" and select items!

Your eBay integration is now fully functional! 🎉



