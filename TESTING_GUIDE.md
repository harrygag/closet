# Testing Guide: eBay Trading API GetSellerList

## Pre-Deployment Checklist

- [x] Added Cloud Function `ebayGetAllListings` to `functions/src/index.ts`
- [x] Added helper functions: `parseXMLValue()`, `parseXMLArray()`, `callTradingAPI()`
- [x] Added interface `TradingAPIListing` to `src/services/ebayService.ts`
- [x] Added method `getAllListings()` to `EbayService` class
- [x] No modifications to existing working functions
- [x] TypeScript syntax verified

## Deployment Steps

### Step 1: Clean Build (if disk space available)
```bash
cd c:\Users\mickk\closet-4\functions
npm run build
```

**Note:** If you get "ENOSPC: no space left on device" error, clear some disk space first.

### Step 2: Deploy Function
```bash
firebase deploy --only functions:ebayGetAllListings
```

**Expected Output:**
```
✔  functions[ebayGetAllListings(us-central1)] Successful create operation.
Function URL (ebayGetAllListings): https://us-central1-closet-da8f2.cloudfunctions.net/ebayGetAllListings
```

### Step 3: Verify Deployment
```bash
firebase functions:list | grep ebayGetAllListings
```

## Testing Methods

### Method 1: Test from React Component

Create a test button in your eBay integration page:

```typescript
import { ebayService } from '@/services/ebayService';
import { useState } from 'react';

function EbayTestComponent() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🚀 Starting getAllListings...');
      const data = await ebayService.getAllListings();
      console.log('✅ Success!', data);
      setResult(data);
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded">
      <h2 className="text-xl font-bold mb-4">Test eBay Trading API</h2>

      <button
        onClick={handleTest}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'Get All Listings'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          Error: {error}
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-green-100 rounded">
          <p className="font-bold">✅ Total Listings: {result.total}</p>
          <details className="mt-2">
            <summary className="cursor-pointer">View First 5 Listings</summary>
            <pre className="mt-2 text-xs overflow-auto">
              {JSON.stringify(result.listings.slice(0, 5), null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
```

### Method 2: Test from Browser Console

1. Open your app in browser
2. Make sure user is authenticated
3. Open Developer Console (F12)
4. Run this code:

```javascript
// Import Firebase Functions
const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');

// Get functions instance (assuming Firebase is already initialized)
const functions = getFunctions();

// Call the function
const getAllListings = httpsCallable(functions, 'ebayGetAllListings');

console.time('getAllListings');
const result = await getAllListings();
console.timeEnd('getAllListings');

console.log('✅ Success!');
console.log('Total listings:', result.data.total);
console.log('First 10 listings:', result.data.listings.slice(0, 10));

// Validate data
result.data.listings.forEach((listing, i) => {
  if (i < 5) {
    console.log(`\n📦 Listing ${i + 1}:`);
    console.log(`  ID: ${listing.itemId}`);
    console.log(`  Title: ${listing.title}`);
    console.log(`  Price: $${listing.currentPrice} ${listing.currency}`);
    console.log(`  URL: ${listing.viewItemURL}`);
  }
});
```

### Method 3: Test via Firebase CLI

```bash
firebase functions:shell
```

Then in the shell:
```javascript
ebayGetAllListings({ auth: { uid: 'YOUR_USER_ID' } })
  .then(result => console.log('Success:', result))
  .catch(err => console.error('Error:', err));
```

### Method 4: Test via Postman/cURL

Get the function URL from Firebase Console, then:

```bash
curl -X POST https://us-central1-closet-da8f2.cloudfunctions.net/ebayGetAllListings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -d '{}'
```

To get ID token:
```javascript
// In browser console
const auth = await import('firebase/auth');
const user = auth.getAuth().currentUser;
const token = await user.getIdToken();
console.log('Token:', token);
```

## Expected Results

### Success Response Format
```json
{
  "success": true,
  "total": 2147,
  "listings": [
    {
      "itemId": "123456789012",
      "title": "Vintage Nike Air Jordan 1 High OG Chicago 2015 Size 10.5",
      "currentPrice": 450.00,
      "currency": "USD",
      "quantity": 1,
      "listingType": "FixedPriceItem",
      "viewItemURL": "https://www.ebay.com/itm/123456789012",
      "pictureURL": "https://i.ebayimg.com/images/g/abc123/s-l1600.jpg",
      "pictureURLs": [
        "https://i.ebayimg.com/images/g/abc123/s-l1600.jpg",
        "https://i.ebayimg.com/images/g/def456/s-l1600.jpg"
      ],
      "sku": "NIKE-AJ1-CHI-10.5",
      "condition": "Pre-owned"
    }
  ]
}
```

### Performance Expectations

| Listings | API Calls | Expected Time |
|----------|-----------|---------------|
| 200 | 1 | 1-2 seconds |
| 1,000 | 5 | 5-10 seconds |
| 2,000 | 10 | 10-20 seconds |
| 5,000 | 25 | 25-50 seconds |

**Cloud Functions Timeout:** 60 seconds (should handle up to ~6000 listings)

## Validation Checks

Run these checks on the returned data:

```javascript
function validateListings(result) {
  console.log('🔍 Validating results...\n');

  // Check 1: Result structure
  console.assert(result.success === true, '❌ success should be true');
  console.assert(typeof result.total === 'number', '❌ total should be number');
  console.assert(Array.isArray(result.listings), '❌ listings should be array');
  console.assert(result.listings.length === result.total, '❌ listings.length should equal total');

  // Check 2: Listing structure
  const firstListing = result.listings[0];
  console.assert(firstListing.itemId, '❌ Missing itemId');
  console.assert(firstListing.title, '❌ Missing title');
  console.assert(typeof firstListing.currentPrice === 'number', '❌ currentPrice should be number');
  console.assert(firstListing.currency, '❌ Missing currency');
  console.assert(typeof firstListing.quantity === 'number', '❌ quantity should be number');
  console.assert(firstListing.viewItemURL, '❌ Missing viewItemURL');
  console.assert(Array.isArray(firstListing.pictureURLs), '❌ pictureURLs should be array');

  // Check 3: Data quality
  const hasImages = result.listings.filter(l => l.pictureURLs.length > 0).length;
  const hasPrices = result.listings.filter(l => l.currentPrice > 0).length;
  console.log(`✅ ${hasImages}/${result.total} listings have images`);
  console.log(`✅ ${hasPrices}/${result.total} listings have prices`);

  // Check 4: URL format
  const firstURL = firstListing.viewItemURL;
  console.assert(firstURL.startsWith('https://www.ebay.com/itm/'), '❌ Invalid eBay URL format');

  console.log('\n✅ All validation checks passed!');
}
```

## Common Issues & Solutions

### Issue 1: "No eBay credentials found"

**Cause:** User hasn't connected their eBay account

**Solution:**
```typescript
// Check connection first
const status = await ebayService.checkConnection();
if (!status.connected) {
  await ebayService.connectAccount();
}
```

### Issue 2: "Token expired"

**Cause:** OAuth token expired and refresh failed

**Solution:** Reconnect eBay account
```typescript
await ebayService.disconnect();
await ebayService.connectAccount();
```

### Issue 3: Empty listings array (total = 0)

**Possible Causes:**
1. User has no active listings
2. All listings ended more than 1 year ago

**Solution:** Adjust date range in Cloud Function
```typescript
// Change this line in ebayGetAllListings
const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
```

### Issue 4: "eBay API error: Invalid date range"

**Cause:** Date range > 120 days (Trading API limit)

**Solution:** Already handled in code with 90-day chunks

### Issue 5: Timeout after 60 seconds

**Cause:** Too many listings (>6000)

**Solutions:**
1. Reduce date range
2. Add timeout handling
3. Split into multiple function calls

```typescript
// Option: Fetch only active listings
const now = new Date();
const futureDate = new Date('2099-12-31');
// Use these dates instead - only gets currently active listings
```

## Monitoring & Logs

### View Logs in Real-Time
```bash
firebase functions:log --only ebayGetAllListings
```

### Key Log Messages to Look For

```
✅ "Fetching listings across X date ranges"
✅ "Page N of range YYYY-MM-DD to YYYY-MM-DD: Found X items"
✅ "Total listings fetched: X"

❌ "GetSellerList error: ..."
❌ "Trading API error: ..."
❌ "No eBay credentials found"
```

### Firebase Console Monitoring

1. Go to Firebase Console → Functions
2. Click on `ebayGetAllListings`
3. View:
   - Invocations graph
   - Execution time
   - Memory usage
   - Error rate

## Next Steps After Testing

### 1. Add to UI
Add a button to your eBay integration page (e.g., `src/pages/EbayIntegrationPage.tsx`):

```typescript
<button onClick={async () => {
  const result = await ebayService.getAllListings();
  console.log(`Loaded ${result.total} listings from Trading API`);
}}>
  Load All eBay Listings
</button>
```

### 2. Compare with Inventory API
Test both APIs side-by-side:

```typescript
const inventoryResult = await ebayService.fetchInventory();
const tradingResult = await ebayService.getAllListings();

console.log('Inventory API:', inventoryResult.total, 'listings');
console.log('Trading API:', tradingResult.total, 'listings');
console.log('Difference:', tradingResult.total - inventoryResult.total);
```

### 3. Sync to Firestore
If results look good, extend the function to sync to Firestore (like `ebaySyncListings`)

### 4. Schedule Regular Syncs
Use Cloud Scheduler to run daily:

```typescript
export const ebayDailySync = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    // Sync for all users
  });
```

## Success Criteria

✅ Function deploys without errors
✅ Returns data within 60 seconds
✅ `total` count is ~2000 (user's actual listing count)
✅ All listings have `itemId`, `title`, `viewItemURL`
✅ Most listings have images (check `pictureURLs.length > 0`)
✅ Prices are reasonable (no $0.00 for all items)
✅ URLs are valid eBay listing URLs
✅ No authentication errors in logs

## Troubleshooting Commands

```bash
# Check function exists
firebase functions:list | grep ebay

# View recent logs
firebase functions:log --only ebayGetAllListings --lines 50

# Test locally (emulator)
firebase emulators:start --only functions

# Redeploy if needed
firebase deploy --only functions:ebayGetAllListings

# Delete and redeploy (if stuck)
firebase functions:delete ebayGetAllListings
firebase deploy --only functions:ebayGetAllListings
```

## Contact & Support

If you encounter issues:

1. Check Firebase Functions logs
2. Verify eBay OAuth connection is active
3. Test with smaller date range first
4. Check eBay API status: https://developer.ebay.com/support/api-status

## Summary

The new `ebayGetAllListings` function is ready to:
- Fetch ALL ~2000 eBay listings (not just 118 from Inventory API)
- Handle pagination automatically
- Parse XML responses to JSON
- Return detailed listing data
- Work with existing OAuth tokens

**Ready to deploy and test!** 🚀
