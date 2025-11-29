# eBay Integration Setup Guide

This guide will walk you through setting up the eBay OAuth integration for your closet management application.

## Prerequisites

1. An eBay Developer Account
2. Firebase Project configured
3. Firebase CLI installed (`npm install -g firebase-tools`)

## Step 1: Create eBay Developer Account & Application

1. Go to [eBay Developer Program](https://developer.ebay.com/)
2. Sign in or create an account
3. Navigate to **My Account** > **Application Keys**
4. Click **Create an Application**
5. Fill in the application details:
   - **Application Title**: Your app name (e.g., "My Closet Manager")
   - **Application Type**: Production
   - **Primary Contact**: Your email
6. Accept the terms and create the application

## Step 2: Configure OAuth Settings

1. Once your application is created, go to **User Tokens** tab
2. Click **Get OAuth Credentials** or **Edit** existing credentials
3. Configure the following:

   **RuName (Redirect URL Name)**:
   - Click **Add RuName**
   - **RuName**: Choose a unique identifier (e.g., `my_closet_app_production`)
   - **Privacy Policy URL**: Your privacy policy URL
   - **Redirect URI**: Your Firebase Hosting URL + `/api/ebay/callback`
     - Example: `https://your-project.web.app/api/ebay/callback`
     - For development/testing: `http://localhost:5000/api/ebay/callback`

4. Save and note down:
   - **App ID (Client ID)**
   - **Cert ID (Client Secret)**
   - **RuName** (the one you just created)

## Step 3: Configure Firebase Cloud Functions

### Option A: Using Firebase Config (Recommended for Production)

```bash
# Set eBay credentials
firebase functions:config:set ebay.client_id="YOUR_EBAY_CLIENT_ID"
firebase functions:config:set ebay.client_secret="YOUR_EBAY_CLIENT_SECRET"
firebase functions:config:set ebay.runame="YOUR_EBAY_RUNAME"

# Optional: Enable sandbox mode for testing
firebase functions:config:set ebay.use_sandbox="false"

# View current config
firebase functions:config:get
```

### Option B: Using Environment Variables (Development)

Create a `.env` file in the `functions/` directory:

```env
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_RUNAME=your_ebay_runame
EBAY_USE_SANDBOX=false
```

## Step 4: Update Firestore Security Rules

Add these rules to your `firestore.rules` file:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // eBay credentials - user can only read/write their own
    match /ebay_credentials/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Items collection - user can only access their own items
    match /items/{itemId} {
      allow read, write: if request.auth != null && resource.data.user_id == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.user_id == request.auth.uid;
    }
  }
}
```

## Step 5: Deploy Firebase Functions

```bash
# Navigate to project root
cd /path/to/your/project

# Install dependencies
cd functions
npm install

# Deploy functions
firebase deploy --only functions

# Or deploy everything
firebase deploy
```

## Step 6: Update firebase.json (if not already configured)

Ensure your `firebase.json` has the correct rewrites:

```json
{
  "hosting": {
    "public": "dist",
    "rewrites": [
      {
        "source": "/api/ebay/oauth-url",
        "function": "ebayOAuthUrl"
      },
      {
        "source": "/api/ebay/callback",
        "function": "ebayCallback"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## Step 7: Testing the Integration

### 1. Connect eBay Account

```typescript
import { ebayService } from './services/ebayService';

// Connect eBay account (opens OAuth popup)
await ebayService.connectAccount();
```

### 2. Check Connection Status

```typescript
const status = await ebayService.checkConnection();
console.log('Connected:', status.connected);
console.log('Token Expiry:', status.tokenExpiry);
```

### 3. Sync Listings

```typescript
const result = await ebayService.syncListings();
console.log(`Imported: ${result.imported}, Updated: ${result.updated}`);
```

### 4. Fetch Inventory

```typescript
const inventory = await ebayService.fetchInventory({ limit: 100 });
console.log('Total listings:', inventory.total);
console.log('Listings:', inventory.listings);
```

### 5. Get Orders

```typescript
const orders = await ebayService.getOrders({ limit: 50 });
console.log('Total orders:', orders.total);
console.log('Orders:', orders.orders);
```

## Using the EbayConnector Component

Add the component to your marketplace integrations page:

```tsx
import { EbayConnector } from './components/EbayConnector';

function MarketplacesPage() {
  return (
    <div>
      <h1>Marketplace Integrations</h1>
      <EbayConnector onSyncComplete={() => {
        console.log('eBay sync completed!');
        // Refresh your inventory list
      }} />
    </div>
  );
}
```

## Firestore Data Structure

### ebay_credentials collection

```json
{
  "user_id": "firebase_user_id",
  "access_token": "encrypted_token",
  "refresh_token": "encrypted_refresh_token",
  "expires_at": "2024-12-31T23:59:59Z",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "last_sync": "2024-01-01T12:00:00Z"
}
```

### items collection (after sync)

```json
{
  "user_id": "firebase_user_id",
  "sku": "ITEM-001",
  "title": "Nike Air Max Sneakers",
  "description": "Brand new sneakers...",
  "price": 129.99,
  "quantity": 1,
  "condition": "NEW",
  "images": ["url1", "url2"],
  "ebay_listing_id": "ebay_id_123",
  "marketplace": "ebay",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

## Cloud Functions

The following Cloud Functions are available:

1. **ebayOAuthUrl** - Generate OAuth authorization URL
2. **ebayCallback** - Handle OAuth callback and store tokens
3. **ebayStatus** - Check connection status
4. **ebayFetchInventory** - Fetch inventory from eBay
5. **ebaySyncListings** - Sync all listings to Firestore
6. **ebayGetOrders** - Fetch orders from eBay
7. **ebayDisconnect** - Disconnect eBay account

## Token Refresh

The integration automatically handles token refresh:
- Tokens are checked before each API call
- If expiring within 5 minutes, they are automatically refreshed
- Refresh tokens are stored securely in Firestore

## Troubleshooting

### OAuth popup blocked
- Ensure popup blockers are disabled for your domain
- The OAuth flow uses `window.open()` which may be blocked by browsers

### "eBay credentials not configured" error
- Verify Firebase Functions config: `firebase functions:config:get`
- Ensure all three values are set (client_id, client_secret, runame)
- Redeploy functions after setting config

### Token expired errors
- The system should auto-refresh, but you can manually reconnect if needed
- Check Firestore `ebay_credentials` collection for token expiry

### Sync fails
- Verify eBay account has active listings
- Check Cloud Functions logs: `firebase functions:log`
- Ensure proper scopes are granted during OAuth

### CORS errors
- Ensure Firebase Hosting rewrites are configured correctly
- Check that functions are deployed and accessible

## Production Checklist

- [ ] eBay Production credentials configured (not sandbox)
- [ ] Firebase Functions deployed
- [ ] Firestore security rules updated
- [ ] Firebase Hosting deployed with proper rewrites
- [ ] Privacy Policy URL configured in eBay app
- [ ] RuName redirect URI matches deployed URL
- [ ] Test OAuth flow end-to-end
- [ ] Test listing sync with real data
- [ ] Monitor Cloud Functions logs for errors

## Security Best Practices

1. **Never commit credentials** - Use Firebase Functions config or environment variables
2. **Enable Firestore security rules** - Ensure users can only access their own data
3. **Use HTTPS** - Always use secure connections in production
4. **Monitor token usage** - Regularly check for unauthorized access
5. **Rotate credentials** - Periodically update eBay app credentials
6. **Audit logs** - Monitor Cloud Functions logs for suspicious activity

## API Rate Limits

eBay has rate limits on API calls:
- **Production**: 5,000 calls per day per application
- **Sandbox**: 5,000 calls per day per application
- Monitor your usage in eBay Developer Dashboard

## Support

For issues related to:
- **eBay API**: [eBay Developer Forums](https://community.ebay.com/t5/Developer-Forums/ct-p/ebaydev)
- **Firebase**: [Firebase Support](https://firebase.google.com/support)
- **This Integration**: Check Cloud Functions logs and Firestore data

## Resources

- [eBay Sell API Documentation](https://developer.ebay.com/api-docs/sell/static/selling-ig-landing.html)
- [eBay Inventory API](https://developer.ebay.com/api-docs/sell/inventory/overview.html)
- [eBay OAuth](https://developer.ebay.com/api-docs/static/oauth-tokens.html)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
