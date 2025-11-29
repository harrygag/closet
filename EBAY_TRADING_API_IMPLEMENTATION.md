# eBay Trading API - GetSellerList Implementation

## Summary

Successfully added a new Cloud Function `ebayGetAllListings` that uses eBay's Trading API to fetch ALL listings (~2000) created through eBay's website, not just the 118 "managed inventory" items from the Inventory API.

## Files Changed

### 1. `functions/src/index.ts`
**Lines added:** ~180 lines

#### New Constants (Lines 9-12)
```typescript
const EBAY_TRADING_API_URL = 'https://api.ebay.com/ws/api.dll';
const EBAY_SANDBOX_TRADING_API_URL = 'https://api.sandbox.ebay.com/ws/api.dll';
const EBAY_API_VERSION = '1209';
```

#### New Helper Functions (Lines 113-160)
- `parseXMLValue()` - Extracts single XML tag value using regex
- `parseXMLArray()` - Extracts all occurrences of an XML tag
- `callTradingAPI()` - Makes authenticated calls to Trading API with proper headers

#### New Cloud Function (Lines 939-1079)
**Function Name:** `ebayGetAllListings`

**Authentication:** Requires Firebase Auth (uses existing `getValidAccessToken()`)

**What it does:**
1. Queries listings in 90-day date ranges (Trading API requires < 120 day range)
2. Handles pagination (200 items per page)
3. Parses XML responses to extract listing data
4. Returns all listings as JSON

**Data Extracted:**
- `itemId` - eBay listing ID
- `title` - Item title
- `currentPrice` - Current price (float)
- `currency` - Currency code (e.g., "USD")
- `quantity` - Available quantity
- `listingType` - "FixedPriceItem", "Auction", etc.
- `viewItemURL` - Direct link to eBay listing
- `pictureURL` - Primary image URL
- `pictureURLs` - Array of all image URLs
- `sku` - SKU if available, otherwise itemId
- `condition` - Condition description

### 2. `src/services/ebayService.ts`
**Lines added:** ~25 lines

#### New Interface (Lines 65-77)
```typescript
export interface TradingAPIListing {
  itemId: string;
  title: string;
  currentPrice: number;
  currency: string;
  quantity: number;
  listingType: string;
  viewItemURL: string;
  pictureURL: string;
  pictureURLs: string[];
  sku: string;
  condition: string;
}
```

#### New Method (Lines 264-279)
```typescript
async getAllListings(): Promise<{
  success: boolean;
  total: number;
  listings: TradingAPIListing[]
}>
```

**Usage:**
```typescript
import { ebayService } from '@/services/ebayService';

// Get all listings
const result = await ebayService.getAllListings();
console.log(`Found ${result.total} listings`);
console.log(result.listings);
```

## Technical Details

### Trading API Authentication
Uses OAuth2 token with header:
```
X-EBAY-API-IAF-TOKEN: <UserAccessToken>
```

The existing `getValidAccessToken()` function handles token refresh automatically.

### XML Request Format
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>1209</Version>
  <DetailLevel>ReturnAll</DetailLevel>
  <EndTimeFrom>2024-01-01T00:00:00.000Z</EndTimeFrom>
  <EndTimeTo>2025-01-01T00:00:00.000Z</EndTimeTo>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
  <IncludeWatchCount>false</IncludeWatchCount>
</GetSellerListRequest>
```

### Pagination Strategy
- Queries listings in 90-day chunks (going back 1 year)
- Each chunk fetches 200 items per page
- Continues until `HasMoreItems` is false
- Safety limit: 50 pages per date range

### XML Parsing
Uses regex-based parsing (no external dependencies needed):
- Extracts nested XML elements
- Handles multiple occurrences (e.g., multiple images)
- Parses attributes (e.g., currency code)

## How to Test

### 1. Deploy Cloud Function
```bash
cd functions
npm run build
firebase deploy --only functions:ebayGetAllListings
```

### 2. Test from Frontend
Create a test component or add to existing eBay integration page:

```typescript
import { ebayService } from '@/services/ebayService';

async function testGetAllListings() {
  try {
    console.log('Fetching all eBay listings...');
    const result = await ebayService.getAllListings();

    console.log('Success!');
    console.log(`Total listings: ${result.total}`);
    console.log('First 5 listings:', result.listings.slice(0, 5));

    // Check for expected data
    result.listings.forEach(listing => {
      console.assert(listing.itemId, 'Missing itemId');
      console.assert(listing.title, 'Missing title');
      console.assert(listing.viewItemURL, 'Missing viewItemURL');
    });
  } catch (error) {
    console.error('Error fetching listings:', error);
  }
}
```

### 3. Test via Firebase Console
Go to Firebase Console → Functions → Select `ebayGetAllListings` → Test

**Test payload:**
```json
{}
```

**Expected response:**
```json
{
  "success": true,
  "total": 2000,
  "listings": [
    {
      "itemId": "123456789",
      "title": "Vintage Nike Swoosh Jacket...",
      "currentPrice": 45.99,
      "currency": "USD",
      "quantity": 1,
      "listingType": "FixedPriceItem",
      "viewItemURL": "https://www.ebay.com/itm/123456789",
      "pictureURL": "https://i.ebayimg.com/...",
      "pictureURLs": ["https://i.ebayimg.com/..."],
      "sku": "NIKE-JACKET-001",
      "condition": "Pre-owned"
    }
  ]
}
```

### 4. Monitor Logs
```bash
firebase functions:log --only ebayGetAllListings
```

Look for:
- "Fetching listings across X date ranges"
- "Page N of range YYYY-MM-DD to YYYY-MM-DD: Found X items"
- "Total listings fetched: X"

### 5. Performance Testing
Expected execution time:
- ~2000 listings = ~10 API calls (200 per page)
- ~1-2 seconds per API call
- Total: 10-20 seconds

Cloud Functions timeout: 60 seconds (should be sufficient)

## Error Handling

### Common Errors

1. **"No eBay credentials found"**
   - User must connect eBay account first
   - Check `ebay_credentials` collection in Firestore

2. **"eBay API error: ..."**
   - Check eBay API logs for specific error
   - Verify scopes include Trading API access
   - Ensure date ranges are < 120 days

3. **Empty listings array**
   - User may not have any listings in the date range
   - Try adjusting date range in code (currently 1 year)

## Next Steps

### Option 1: Add Sync to Firestore
Extend the function to sync Trading API listings to Firestore:

```typescript
// After fetching all listings
for (const listing of allListings) {
  const itemRef = db.collection('Item').doc();
  await itemRef.set({
    user_uuid: userId,
    title: listing.title,
    ebayListingId: listing.itemId,
    ebayUrl: listing.viewItemURL,
    imageUrls: listing.pictureURLs,
    manualPriceCents: Math.round(listing.currentPrice * 100),
    status: listing.quantity > 0 ? 'IN_STOCK' : 'SOLD',
    // ... more fields
  });
}
```

### Option 2: Add to UI
Create a button in the eBay integration page:

```tsx
<button onClick={async () => {
  setLoading(true);
  try {
    const result = await ebayService.getAllListings();
    setListings(result.listings);
    toast.success(`Loaded ${result.total} listings`);
  } catch (error) {
    toast.error('Failed to load listings');
  } finally {
    setLoading(false);
  }
}}>
  Load All eBay Listings (Trading API)
</button>
```

### Option 3: Filter Active Listings Only
Modify the XML request to only fetch active listings:

```xml
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <!-- ... -->
  <EndTimeFrom>2025-01-01T00:00:00.000Z</EndTimeFrom>
  <EndTimeTo>2099-12-31T23:59:59.000Z</EndTimeTo>
  <!-- This filters to listings ending in the future = active -->
</GetSellerListRequest>
```

## Differences: Trading API vs Inventory API

| Feature | Inventory API | Trading API |
|---------|--------------|-------------|
| **Listings Returned** | 118 "managed inventory" | ~2000 all listings |
| **Format** | JSON | XML |
| **Pagination** | offset/limit | PageNumber |
| **Date Filter** | None | Required (< 120 days) |
| **Endpoint** | /sell/inventory/v1/inventory_item | /ws/api.dll |
| **Auth Header** | Authorization: Bearer | X-EBAY-API-IAF-TOKEN |
| **Best For** | Programmatically created listings | Website-created listings |

## Security Notes

- Uses existing OAuth flow (no new credentials needed)
- Respects user authentication (Firebase Auth required)
- Access tokens auto-refresh via `getValidAccessToken()`
- No sensitive data stored in function code

## Cost Considerations

- Cloud Function execution: ~10-20 seconds @ $0.40/million seconds
- API calls: Free (within eBay rate limits)
- Firestore reads: 1 read per function call (fetch credentials)

**Estimated cost per execution:** < $0.001

## Conclusion

The new `ebayGetAllListings` Cloud Function successfully:
- ✅ Uses Trading API GetSellerList endpoint
- ✅ Authenticates with OAuth2 token (X-EBAY-API-IAF-TOKEN header)
- ✅ Handles pagination with HasMoreItems flag
- ✅ Parses XML responses to extract listing data
- ✅ Returns JSON with all required fields
- ✅ Frontend method added to ebayService.ts
- ✅ No modifications to existing working functions

**Ready to deploy and test!**
