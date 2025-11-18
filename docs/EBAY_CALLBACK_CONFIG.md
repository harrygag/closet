# eBay OAuth Callback Configuration

## Your eBay Credentials

Based on what you provided:
- **Client ID (App ID)**: `YOUR_EBAY_CLIENT_ID`
- **Client Secret (Cert ID)**: `YOUR_EBAY_CLIENT_SECRET`
- **RuName**: `James_Kennedy-JamesKen-eba-PR-jwqknyy`

## ⚠️ The Problem

Your RuName currently redirects to itself (`James_Kennedy-JamesKen-eba-PR-jwqknyy`), but it needs to redirect to your backend server's callback URL: `http://localhost:3001/api/ebay/callback`

## 🔧 How to Fix This

### Option 1: Update RuName in eBay Developer Portal

1. Go to https://developer.ebay.com/my/auth/?env=production&index=0

2. Find your RuName: `James_Kennedy-JamesKen-eba-PR-jwqknyy`

3. Click "Edit"

4. Set the **OAuth Redirect URL** to:
   ```
   http://localhost:3001/api/ebay/callback
   ```

5. Click "Save"

### Option 2: Create a New RuName for Local Development

1. Go to https://developer.ebay.com/my/auth/?env=production&index=0

2. Click "Add RuName"

3. Fill in:
   - **RuName**: `James_Kennedy-JamesKen-eba-PR-localhost` (or any name)
   - **OAuth Redirect URL**: `http://localhost:3001/api/ebay/callback`

4. Click "Save"

5. Copy the new RuName

6. Update `server/.env`:
   ```env
   EBAY_RUNAME=James_Kennedy-JamesKen-eba-PR-localhost
   ```

7. Restart the backend server

## 🎯 For Production (When Deploying)

When you deploy to Vercel/production:

1. Create another RuName in eBay Developer Portal

2. Set OAuth Redirect URL to:
   ```
   https://your-app-name.vercel.app/api/ebay/callback
   ```

3. Update environment variable in Vercel dashboard

## 🚀 Quick Test Without RuName Update

Actually, there's an alternative! eBay's older Sign-In API you mentioned earlier:

```
https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&runame=James_Kennedy-JamesKen-eba-PR-jwqknyy&SessID=<SESSION_ID>
```

This uses a different flow that might already be configured. Let me create an alternative implementation for this...

## 📝 Current Status

Your backend server is ready and waiting, but the OAuth callback can't complete because eBay doesn't know to redirect to `http://localhost:3001/api/ebay/callback`.

**Next Step**: Update the RuName redirect URL in your eBay developer account, or let me know if you want to try the alternative Sign-In API approach.


