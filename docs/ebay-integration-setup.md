e# eBay OAuth Integration Setup Guide

## Overview

The Virtual Closet now supports importing active eBay listings directly into your inventory through OAuth 2.0 authentication.

## Prerequisites

1. **eBay Developer Account**: Sign up at [developer.ebay.com](https://developer.ebay.com)
2. **eBay Application**: Create an application in the eBay Developer Portal
3. **RuName**: Obtain your OAuth Redirect URL Name (RuName) from eBay
4. **API Credentials**: Get your Client ID (App ID) and Client Secret (Cert ID)

## Environment Configuration

Add the following environment variables to your deployment (Vercel, etc.):

```env
# Supabase (already configured)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# eBay API Configuration
EBAY_CLIENT_ID=your_ebay_app_client_id
EBAY_CLIENT_SECRET=your_ebay_app_client_secret
EBAY_RUNAME=James_Kennedy-JamesKen-eba-PR-xivxnp
EBAY_REDIRECT_URI=your_callback_url
```

### Getting eBay Credentials

1. **Create eBay App**:
   - Go to [developer.ebay.com/my/keys](https://developer.ebay.com/my/keys)
   - Create a new Keyset
   - Note your App ID (Client ID) and Cert ID (Client Secret)

2. **Configure OAuth Settings**:
   - In your app settings, go to "User Tokens"
   - Add a redirect URL (your callback endpoint)
   - You'll receive a RuName

3. **Set Scopes**:
   Required scopes for this integration:
   - `https://api.ebay.com/oauth/api_scope/sell.inventory`
   - `https://api.ebay.com/oauth/api_scope/sell.inventory.readonly`

## Database Setup

The database migration has already been applied to your Supabase instance:

### Tables Created

1. **ebay_credentials**:
   - Stores OAuth tokens securely
   - Automatic token refresh
   - One credential per user

2. **Item table updates**:
   - `ebay_item_id`: eBay listing ID for deduplication
   - `imported_from`: Track source ('manual', 'ebay', 'csv')
   - `ebay_imported_at`: Import timestamp

## How to Use

### Connect eBay Account

1. Click the **"Connect eBay"** button in the header
2. Click **"Connect eBay Account"** in the settings modal
3. Authorize in the popup window
4. You'll be redirected back after authorization

### Import Listings

1. Click the **"eBay ✓"** dropdown in the header
2. Select **"Import from eBay"**
3. Review your active listings
4. Select items to import (already imported items are grayed out)
5. Click **"Import X Items"**
6. Wait for import to complete

### Disconnect eBay

1. Click **"eBay ✓"** dropdown → **"Marketplace Settings"**
2. Click **"Disconnect"**
3. Your credentials will be removed

## Data Mapping

| eBay Field | Virtual Closet Field | Notes |
|-----------|---------------------|-------|
| Title | Name | Direct copy |
| PictureURL[0] | ImageUrl | First image only |
| Price | SellingPrice | From listing price |
| ItemID | ebay_item_id | For deduplication |
| ViewItemURL | Notes | Stored in notes |
| Size (from specifics) | Size | Extracted from item specifics |
| Brand (from specifics) | Brand | Extracted or parsed from title |
| Category | Tags | Mapped to closest tag |

### Missing Data Handling

- **Cost Price**: Set to 0 (user must add manually)
- **Size**: Extracted from specifics or title if possible
- **Brand**: Extracted from specifics or parsed from title
- **Tags**: Auto-mapped or left empty for manual addition
- **Hanger Info**: Left empty

## API Routes

All API routes are in the `/api/ebay/` directory:

- `oauth-url.ts`: Generate OAuth URL
- `callback.ts`: Handle OAuth callback
- `check-connection.ts`: Check connection status
- `disconnect.ts`: Revoke and delete credentials
- `get-listings.ts`: Fetch active listings
- `import-items.ts`: Import selected items

## Security

- ✅ Tokens stored server-side only
- ✅ RLS policies on credentials table
- ✅ Automatic token refresh
- ✅ User can only access their own data
- ✅ Client Secret never exposed to frontend

## Troubleshooting

### "eBay not connected" error
- Check if OAuth completed successfully
- Verify tokens haven't expired
- Try disconnecting and reconnecting

### "Failed to fetch listings" error
- Check eBay API credentials in environment variables
- Verify API scopes are correct
- Check eBay API status

### Items not showing up after import
- Check browser console for errors
- Verify Supabase RLS policies
- Check that items have unique `ebay_item_id`

### Duplicate import prevention not working
- Ensure `ebay_item_id` is being stored correctly
- Check unique index on `Item` table

## Testing Checklist

- [x] Database migration applied
- [x] API routes created
- [x] Frontend components built
- [x] OAuth flow implemented
- [x] Connection status checking
- [x] Listing fetch from eBay
- [x] Data transformation logic
- [x] Duplicate detection
- [x] Bulk import with progress
- [x] Error handling
- [ ] Test with real eBay account (requires credentials)
- [ ] Test token refresh
- [ ] Test disconnect flow

## Future Enhancements

- [ ] Auto-sync prices with eBay
- [ ] Import sold listings
- [ ] Export to eBay
- [ ] Bulk price updates
- [ ] Category auto-detection improvements
- [ ] Image gallery import
- [ ] Poshmark integration
- [ ] Mercari integration



