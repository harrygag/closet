# eBay OAuth Redirecting to Localhost - FIX REQUIRED

## 🔴 Problem

eBay OAuth is redirecting to `localhost` instead of the production Firebase Cloud Function callback URL.

## Root Cause

The **RUNAME in your eBay Developer Portal** is configured with a localhost redirect URL. eBay redirects to whatever URL is configured in the Developer Portal for that RUNAME, regardless of the `redirect_uri` parameter in the OAuth request.

## ✅ Solution: Update eBay Developer Portal

You **MUST** update the RUNAME configuration in the eBay Developer Portal:

### Step 1: Access eBay Developer Portal

1. Go to: https://developer.ebay.com/my/auth/?env=production&index=0
2. Sign in with your eBay Developer account

### Step 2: Find Your RUNAME

Look for your RUNAME: `James_Kennedy-JamesKen-eba-PR-jwqknyy` (or whatever your actual RUNAME is)

### Step 3: Edit the RUNAME

1. Click **"Edit"** next to your RUNAME
2. Find the **"OAuth Redirect URL"** field
3. **Change it from** (current - probably localhost):
   ```
   http://localhost:3001/api/ebay/callback
   ```
   **To** (production Firebase URL):
   ```
   https://us-central1-closet-da8f2.cloudfunctions.net/ebayCallback
   ```
4. Click **"Save"**

### Step 4: Verify Configuration

After saving, verify:
- ✅ RuName: `James_Kennedy-JamesKen-eba-PR-jwqknyy` (your RUNAME value)
- ✅ OAuth Redirect URL: `https://us-central1-closet-da8f2.cloudfunctions.net/ebayCallback`

## Important Notes

### How eBay OAuth Works

1. **Authorization Request**: Your code sends `redirect_uri=EBAY_RUNAME` (the RUNAME value)
2. **eBay Authorization**: User authorizes on eBay
3. **eBay Redirect**: eBay redirects to the **actual URL configured in Developer Portal** for that RUNAME
4. **Token Exchange**: Your callback handler receives the code and exchanges it for tokens

### Why This Happens

- The `redirect_uri` parameter in the OAuth request is just a **validation check**
- eBay uses it to verify the request matches the configured RUNAME
- But the **actual redirect** goes to whatever URL is configured in the Developer Portal
- This is why updating the Developer Portal is **required**

## Testing After Fix

1. **Clear browser cache** (important - old redirects may be cached)
2. Try connecting eBay again
3. After authorization, you should be redirected to:
   ```
   https://us-central1-closet-da8f2.cloudfunctions.net/ebayCallback?code=...&state=...
   ```
4. The callback should complete successfully
5. Tokens should be stored in Firestore

## Alternative: Create New RUNAME for Production

If you want to keep localhost for development:

1. **Create a NEW RUNAME** in eBay Developer Portal:
   - RuName: `James_Kennedy-JamesKen-eba-PR-production` (or any name)
   - OAuth Redirect URL: `https://us-central1-closet-da8f2.cloudfunctions.net/ebayCallback`

2. **Update Firebase Functions Config**:
   ```bash
   firebase functions:config:set ebay.runame="James_Kennedy-JamesKen-eba-PR-production"
   ```

3. **Redeploy Functions**:
   ```bash
   firebase deploy --only functions
   ```

## Verification Checklist

After updating the Developer Portal:

- [ ] RUNAME OAuth Redirect URL updated to production URL
- [ ] Changes saved in eBay Developer Portal
- [ ] Firebase Functions deployed
- [ ] Browser cache cleared
- [ ] OAuth flow tested
- [ ] Redirect goes to production URL (not localhost)
- [ ] Tokens stored successfully

## Current Configuration

- **Production Callback URL**: `https://us-central1-closet-da8f2.cloudfunctions.net/ebayCallback`
- **Firebase Project**: `closet-da8f2`
- **Cloud Function**: `ebayCallback`

## Support

If the redirect still goes to localhost after updating:
1. Wait 5-10 minutes (eBay may cache redirect URLs)
2. Clear browser cache completely
3. Try incognito/private browsing mode
4. Verify the RUNAME was saved correctly in Developer Portal
5. Check Cloud Functions logs: `firebase functions:log`










