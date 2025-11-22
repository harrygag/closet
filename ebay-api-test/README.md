# eBay API Test Application

Standalone test app for eBay API integration before adding to main Virtual Closet app.

## 🎯 What This Tests

1. ✅ eBay OAuth flow (user authorization)
2. ✅ Access token retrieval
3. ✅ Inventory item fetching via official API
4. ✅ Token storage and reuse

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd ebay-api-test
npm install
```

### 2. Get eBay API Credentials

1. Go to: https://developer.ebay.com/my/keys
2. Sign in with your eBay account
3. Create a new application (or use existing)
4. **For Sandbox (recommended first):**
   - Click "Application Keys" under "Sandbox"
   - Copy your **App ID (Client ID)**
   - Copy your **Cert ID (Client Secret)**
5. Click "Get RuName" and create one:
   - Redirect URL: `http://localhost:3002/auth/ebay/callback`
   - Copy the generated **RuName**

### 3. Configure Environment

```bash
# Copy template
cp env.template .env

# Edit .env and add your credentials:
EBAY_APP_ID=YourSandboxAppID
EBAY_CERT_ID=YourSandboxCertID
EBAY_REDIRECT_URI=http://localhost:3002/auth/ebay/callback
EBAY_ENVIRONMENT=SANDBOX
```

### 4. Start Server

```bash
npm start
```

Server will run on: http://localhost:3002

### 5. Run OAuth Test

In a **new terminal**:

```bash
npm test
```

This will:
- Open a browser
- Navigate through OAuth flow
- Prompt you to log in to eBay (manual step)
- Capture access token
- Test inventory API call
- Save results to `tokens.json` and `inventory.json`

## 📁 Output Files

After successful test:

- `tokens.json` - OAuth access/refresh tokens
- `inventory.json` - Sample inventory items from your eBay account

## 🔄 Testing Flow

```
1. npm start (terminal 1)
2. npm test (terminal 2)
3. Browser opens automatically
4. You log in to eBay manually
5. Grant permissions
6. Redirect back to localhost
7. Token captured ✅
8. Inventory fetched ✅
```

## 🛡️ Sandbox vs Production

### Sandbox (Recommended First)
- Safe testing environment
- Won't affect real account
- Uses test data
- Set: `EBAY_ENVIRONMENT=SANDBOX`

### Production (After Testing Works)
- Real eBay account
- Real inventory data
- Get production credentials from eBay Developer Portal
- Set: `EBAY_ENVIRONMENT=PRODUCTION`

## ✅ Success Criteria

After running `npm test`, you should see:

```
✅ OAuth Success
✅ Access Token saved
✅ Inventory API call successful
✅ X inventory items retrieved
```

## 🔧 Troubleshooting

### "Missing EBAY_APP_ID"
- Make sure you copied `env.template` to `.env`
- Add your credentials to `.env`

### "401 Unauthorized"
- Check your App ID and Cert ID are correct
- Make sure you're using Sandbox credentials for Sandbox environment

### "404 Not Found" on inventory
- Sandbox may have no inventory items (this is normal!)
- Try Production mode to see real items

### "redirect_uri mismatch"
- Make sure RuName is configured with exact URL: `http://localhost:3002/auth/ebay/callback`

## 🎯 Next Steps

Once this works:
1. ✅ Integrate OAuth flow into main app
2. ✅ Add inventory sync to database
3. ✅ Create unified marketplace interface
4. ✅ Keep Depop/Poshmark using cookie scraping

