# eBay OAuth Implementation Analysis

## Current Issues Identified

### 🔴 CRITICAL ISSUE #1: Redirect URI Mismatch

**Problem**: The code uses the Cloud Function callback URL (`CALLBACK_URL`) in the token exchange, but eBay requires the `redirect_uri` parameter to match the **RUNAME** value configured in the eBay Developer Portal.

**Current Code** (Line 250 in `functions/src/index.ts`):
```typescript
redirect_uri: CALLBACK_URL,  // ❌ WRONG - Using Cloud Function URL
```

**Should Be**:
```typescript
redirect_uri: EBAY_RUNAME,  // ✅ CORRECT - Use RUNAME value
```

**eBay Documentation Reference**:
> The `redirect_uri` parameter in the token exchange request must exactly match the RUNAME value configured in your eBay Developer Portal, not the actual callback URL.

### 🔴 CRITICAL ISSUE #2: Authorization Code Encoding

**Problem**: The authorization code is being URL-encoded before sending to the token endpoint, but `URLSearchParams` already handles encoding automatically.

**Current Code** (Line 249):
```typescript
code: encodeURIComponent(code),  // ❌ Double encoding
```

**Should Be**:
```typescript
code: code,  // ✅ URLSearchParams handles encoding
```

### 🟡 ISSUE #3: Authorization URL Redirect URI

**Problem**: The authorization URL uses `CALLBACK_URL` but should use `EBAY_RUNAME` as the redirect_uri parameter.

**Current Code** (Line 199):
```typescript
redirect_uri=${encodeURIComponent(CALLBACK_URL)}  // ❌ Should use RUNAME
```

**Should Be**:
```typescript
redirect_uri=${encodeURIComponent(EBAY_RUNAME)}  // ✅ Use RUNAME
```

### 📋 Understanding eBay OAuth Flow

According to eBay API documentation:

1. **RUNAME Configuration**: In the eBay Developer Portal, you configure a RUNAME (Redirect URL Name) which is an identifier, not necessarily a URL.

2. **Authorization Request**: The `redirect_uri` parameter should be the RUNAME value:
   ```
   https://auth.ebay.com/oauth2/authorize?
     client_id=YOUR_CLIENT_ID&
     redirect_uri=YOUR_RUNAME&  ← RUNAME value, not actual URL
     response_type=code&
     scope=...
   ```

3. **Token Exchange**: The `redirect_uri` parameter must match the RUNAME:
   ```
   POST https://api.ebay.com/identity/v1/oauth2/token
   Content-Type: application/x-www-form-urlencoded
   
   grant_type=authorization_code&
   code=AUTHORIZATION_CODE&
   redirect_uri=YOUR_RUNAME  ← Must match RUNAME from step 2
   ```

4. **Actual Callback**: eBay redirects to the actual callback URL configured in the Developer Portal (which is associated with the RUNAME), but the `redirect_uri` parameter in requests should be the RUNAME value itself.

## Required Fixes

### Fix 1: Update Authorization URL Generation

```typescript
// Line 199 in functions/src/index.ts
const authUrl = `https://auth.ebay.com/oauth2/authorize?client_id=${EBAY_CLIENT_ID}&redirect_uri=${encodeURIComponent(EBAY_RUNAME)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;
```

### Fix 2: Update Token Exchange

```typescript
// Lines 247-251 in functions/src/index.ts
body: new URLSearchParams({
  grant_type: 'authorization_code',
  code: code,  // Remove encodeURIComponent
  redirect_uri: EBAY_RUNAME,  // Use RUNAME, not CALLBACK_URL
}),
```

### Fix 3: Remove Hardcoded CALLBACK_URL

The `CALLBACK_URL` constant is no longer needed for the OAuth flow. The actual callback URL is configured in the eBay Developer Portal and associated with the RUNAME.

## eBay Developer Portal Configuration

Ensure your RUNAME in the eBay Developer Portal is configured with:
- **RuName**: `James_Kennedy-JamesKen-eba-PR-jwqknyy` (or your actual RUNAME)
- **OAuth Redirect URL**: `https://us-central1-closet-da8f2.cloudfunctions.net/ebayCallback`

The RUNAME value is what you use in the `redirect_uri` parameter, while the actual redirect URL is what eBay uses to redirect after authorization.

## Testing Checklist

After applying fixes:
- [ ] Authorization URL uses RUNAME in redirect_uri parameter
- [ ] Token exchange uses RUNAME in redirect_uri parameter
- [ ] Authorization code is NOT double-encoded
- [ ] OAuth flow completes successfully
- [ ] Tokens are stored in Firestore
- [ ] API calls work with stored tokens

## References

- [eBay OAuth Documentation](https://developer.ebay.com/api-docs/static/oauth-tokens.html)
- [eBay OAuth 2.0 Guide](https://developer.ebay.com/api-docs/static/oauth-consent-request.html)
- Current implementation: `functions/src/index.ts` lines 137-372










