# Trading API Implementation - Code Summary

## Quick Reference: What Was Added

### Backend (Cloud Functions)

**File:** `c:\Users\mickk\closet-4\functions\src\index.ts`

#### 1. Constants Added (Top of file, after admin.initializeApp())
```typescript
// eBay Trading API Configuration
const EBAY_TRADING_API_URL = 'https://api.ebay.com/ws/api.dll';
const EBAY_SANDBOX_TRADING_API_URL = 'https://api.sandbox.ebay.com/ws/api.dll';
const EBAY_API_VERSION = '1209';
```

#### 2. XML Helper Functions (After getValidAccessToken())
```typescript
// Helper function to parse XML response from Trading API
function parseXMLValue(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 's');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

// Helper function to parse all occurrences of a tag
function parseXMLArray(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 'gs');
  const matches = xml.matchAll(regex);
  return Array.from(matches, m => m[1].trim());
}

// Helper function to call eBay Trading API
async function callTradingAPI(
  userId: string,
  apiCallName: string,
  requestBody: string
): Promise<string> {
  const accessToken = await getValidAccessToken(userId);
  const { USE_SANDBOX } = getEbayCredentials();
  const apiUrl = USE_SANDBOX ? EBAY_SANDBOX_TRADING_API_URL : EBAY_TRADING_API_URL;

  const headers = {
    'Content-Type': 'text/xml;charset=UTF-8',
    'X-EBAY-API-COMPATIBILITY-LEVEL': EBAY_API_VERSION,
    'X-EBAY-API-IAF-TOKEN': accessToken,
    'X-EBAY-API-SITEID': '0',
    'X-EBAY-API-CALL-NAME': apiCallName,
  };

  console.log(`Trading API call: ${apiCallName}`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Trading API error: ${response.status} - ${errorText}`);
    throw new Error(`Trading API error (${response.status}): ${errorText}`);
  }

  return await response.text();
}
```

#### 3. Main Cloud Function (End of file, after importCSVData)
```typescript
// Get ALL eBay Listings using Trading API GetSellerList
export const ebayGetAllListings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const allListings: any[] = [];

    // eBay Trading API requires date range < 120 days
    // We'll query in 90-day chunks going back 1 year
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Create 90-day date ranges
    const dateRanges: Array<{ start: Date; end: Date }> = [];
    let rangeStart = oneYearAgo;

    while (rangeStart < now) {
      const rangeEnd = new Date(rangeStart.getTime() + 90 * 24 * 60 * 60 * 1000);
      const finalRangeEnd = rangeEnd > now ? now : rangeEnd;
      dateRanges.push({ start: rangeStart, end: finalRangeEnd });
      rangeStart = new Date(finalRangeEnd.getTime() + 1000);
    }

    console.log(`Fetching listings across ${dateRanges.length} date ranges`);

    // Fetch listings for each date range
    for (const dateRange of dateRanges) {
      let pageNumber = 1;
      let hasMoreItems = true;

      while (hasMoreItems) {
        const endTimeFrom = dateRange.start.toISOString();
        const endTimeTo = dateRange.end.toISOString();

        const requestBody = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${EBAY_API_VERSION}</Version>
  <DetailLevel>ReturnAll</DetailLevel>
  <EndTimeFrom>${endTimeFrom}</EndTimeFrom>
  <EndTimeTo>${endTimeTo}</EndTimeTo>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>${pageNumber}</PageNumber>
  </Pagination>
  <IncludeWatchCount>false</IncludeWatchCount>
</GetSellerListRequest>`;

        const xmlResponse = await callTradingAPI(userId, 'GetSellerList', requestBody);

        // Parse XML response
        const ack = parseXMLValue(xmlResponse, 'Ack');
        if (ack === 'Failure') {
          const errorMessage = parseXMLValue(xmlResponse, 'LongMessage');
          console.error(`GetSellerList error: ${errorMessage}`);
          throw new Error(`eBay API error: ${errorMessage}`);
        }

        // Parse HasMoreItems flag
        const hasMoreItemsStr = parseXMLValue(xmlResponse, 'HasMoreItems');
        hasMoreItems = hasMoreItemsStr === 'true';

        // Parse Item elements
        const itemXMLs = xmlResponse.match(/<Item>([\s\S]*?)<\/Item>/g) || [];

        console.log(`Page ${pageNumber} of range ${endTimeFrom.slice(0, 10)} to ${endTimeTo.slice(0, 10)}: Found ${itemXMLs.length} items`);

        for (const itemXML of itemXMLs) {
          const itemId = parseXMLValue(itemXML, 'ItemID');
          const title = parseXMLValue(itemXML, 'Title');
          const listingType = parseXMLValue(itemXML, 'ListingType');
          const viewItemURL = parseXMLValue(itemXML, 'ViewItemURL');

          let currentPrice = '0.00';
          let currency = 'USD';

          const sellingStatusXML = itemXML.match(/<SellingStatus>([\s\S]*?)<\/SellingStatus>/)?.[1] || '';
          if (sellingStatusXML) {
            const currentPriceXML = sellingStatusXML.match(/<CurrentPrice[^>]*>([\s\S]*?)<\/CurrentPrice>/)?.[0] || '';
            currentPrice = parseXMLValue(currentPriceXML, 'CurrentPrice') || currentPrice;
            const currencyMatch = currentPriceXML.match(/currencyID="([^"]+)"/);
            currency = currencyMatch ? currencyMatch[1] : currency;
          }

          const quantity = parseXMLValue(itemXML, 'Quantity') || '0';
          const pictureURL = parseXMLValue(itemXML, 'PictureURL') || '';
          const pictureURLs = parseXMLArray(itemXML, 'PictureURL');
          const sku = parseXMLValue(itemXML, 'SKU') || itemId;
          const conditionDisplayName = parseXMLValue(itemXML, 'ConditionDisplayName') || 'Not Specified';

          allListings.push({
            itemId,
            title,
            currentPrice: parseFloat(currentPrice),
            currency,
            quantity: parseInt(quantity, 10),
            listingType,
            viewItemURL,
            pictureURL,
            pictureURLs,
            sku,
            condition: conditionDisplayName,
          });
        }

        pageNumber++;

        if (pageNumber > 50) {
          console.warn('Reached page limit (50) for this date range');
          break;
        }
      }
    }

    console.log(`Total listings fetched: ${allListings.length}`);

    return {
      success: true,
      total: allListings.length,
      listings: allListings,
    };
  } catch (error) {
    console.error('Error fetching all eBay listings:', error);
    throw new functions.https.HttpsError('internal', `Failed to fetch all eBay listings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});
```

### Frontend (Service Layer)

**File:** `c:\Users\mickk\closet-4\src\services\ebayService.ts`

#### 1. Interface Added (After SyncResult interface)
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

#### 2. Method Added (End of EbayService class, after getStats())
```typescript
/**
 * Get ALL eBay listings using Trading API GetSellerList
 * This method fetches ALL listings (~2000) created through eBay's website
 * (not just the 118 "managed inventory" items from Inventory API)
 * @returns {Promise<{ success: boolean; total: number; listings: TradingAPIListing[] }>}
 */
async getAllListings(): Promise<{ success: boolean; total: number; listings: TradingAPIListing[] }> {
  try {
    const getAllListingsFn = httpsCallable(functions, 'ebayGetAllListings');
    const result = await getAllListingsFn();
    return result.data as { success: boolean; total: number; listings: TradingAPIListing[] };
  } catch (error) {
    console.error('Failed to get all eBay listings:', error);
    throw error;
  }
}
```

## Usage Example

```typescript
import { ebayService } from '@/services/ebayService';

// In your component or page
async function loadAllEbayListings() {
  try {
    const result = await ebayService.getAllListings();

    console.log(`Found ${result.total} total listings`);

    result.listings.forEach(listing => {
      console.log(`${listing.itemId}: ${listing.title} - $${listing.currentPrice}`);
    });

    return result.listings;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}
```

## Deployment Command

```bash
cd c:\Users\mickk\closet-4\functions
npm run build
firebase deploy --only functions:ebayGetAllListings
```

## Test from Browser Console

```javascript
// After authenticating user
const { getFunctions, httpsCallable } = await import('firebase/functions');
const functions = getFunctions();
const getAllListings = httpsCallable(functions, 'ebayGetAllListings');

const result = await getAllListings();
console.log('Total:', result.data.total);
console.log('First 10:', result.data.listings.slice(0, 10));
```

## Key Points

✅ **No external XML libraries needed** - Uses regex parsing
✅ **Automatic token refresh** - Uses existing `getValidAccessToken()`
✅ **Handles 120-day limit** - Splits into 90-day chunks
✅ **Pagination support** - Fetches all pages via `HasMoreItems`
✅ **Type-safe frontend** - Full TypeScript interfaces
✅ **Error handling** - Proper error messages and logging

## What Was NOT Modified

- ✅ `ebayOAuthUrl` - OAuth flow unchanged
- ✅ `ebayCallback` - Callback handler unchanged
- ✅ `ebayStatus` - Connection status unchanged
- ✅ `ebayFetchInventory` - Inventory API unchanged
- ✅ `ebaySyncListings` - Sync logic unchanged
- ✅ All other existing functions remain untouched
