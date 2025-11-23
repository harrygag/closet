# Marketplace Selector Research

## Current Selector Status (as of November 2024)

### eBay Seller Hub

**URL**: `https://www.ebay.com/sh/lst/active`

**Known Working Selectors** (based on eBay's current structure):
- Listings container: `.sh-ListingCard, [data-testid="listing-card"]`
- Title: `.sh-ListingCard__title, [data-testid="listing-title"]`
- Price: `.sh-ListingCard__price, [data-testid="listing-price"]`
- Image: `.sh-ListingCard__image img`
- Status indicators: `.sh-ListingCard__status`

**Alternative Selectors** (fallback):
- Classic view: `.s-item`
- Title: `.s-item__title`
- Price: `.s-item__price`

### Poshmark Closet

**URL**: `https://poshmark.com/closet/[username]`

**Known Working Selectors**:
- Listings: `.tile, [data-et-name="listing"]`
- Title: `.tile__title, .title--body`
- Price: `.tile__price`
- Image: `.tile__covershot img, .img__container img`
- Brand: `.tile__details__pipe__brand`
- Size: `.tile__details__pipe__size`
- Sold badge: `.sold__out__overlay, .badge--sold-out`

**Notes**: Poshmark uses dynamic class names, so multiple fallbacks needed

### Depop Shop

**URL**: `https://www.depop.com/[username]/`

**Known Working Selectors**:
- Product grid: `[data-testid="products__item"], .styles__ProductCard`
- Title: `[data-testid="product__title"], h2, h3`
- Price: `[data-testid="product__price"], .styles__PriceText`
- Image: `[data-testid="product__image"] img`
- Sold badge: `[data-testid="product__soldLabel"]`

**Notes**: Depop heavily uses data-testid attributes, which are more stable

## Selector Testing Strategy

### 1. Use Multiple Fallback Selectors

Always provide comma-separated selectors from most specific to most generic:

```typescript
const selectors = [
  '[data-testid="specific-id"]',  // Most specific
  '.modern-class-name',            // Current class
  '.legacy-class-name',            // Fallback class
  'semantic-tag'                   // Last resort
].join(', ');
```

### 2. Test Selector Stability

Run this in browser console on each marketplace:

```javascript
// Test if selector returns elements
const testSelector = (selector) => {
  const elements = document.querySelectorAll(selector);
  console.log(`${selector}: Found ${elements.length} elements`);
  return elements.length > 0;
};

// Test all selectors
testSelector('.sh-ListingCard');
testSelector('[data-testid="listing-card"]');
```

### 3. Handle Dynamic Content

Many marketplaces load content via JavaScript. Always:

```typescript
await page.waitForSelector(selector, { 
  timeout: 15000,
  visible: true 
});

// Additional wait for JS execution
await page.waitForTimeout(2000);
```

### 4. Verify Data Extraction

After selecting elements, verify data quality:

```typescript
if (!title || !url) {
  console.warn('Skipping item: missing required data');
  continue;
}
```

## Recommendations for Each Scraper

### eBay Scraper Improvements

1. **Add login verification**:
```typescript
// After login, verify we're on the right page
const currentUrl = page.url();
if (!currentUrl.includes('ebay.com/sh')) {
  throw new Error('Login failed or redirected incorrectly');
}
```

2. **Handle pagination**:
```typescript
// eBay seller hub has lazy loading
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(2000);
```

3. **Extract more data**:
```typescript
// Get quantity, views, watchers
const quantity = element.querySelector('.quantity')?.textContent;
const views = element.querySelector('.views')?.textContent;
```

### Poshmark Scraper Improvements

1. **Handle infinite scroll**:
```typescript
// Poshmark uses infinite scroll
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
}
```

2. **Extract share status**:
```typescript
const lastShared = element.querySelector('.last-shared')?.textContent;
```

3. **Get listing ID from URL**:
```typescript
const listingId = url.match(/\/listing\/([\w-]+)/)?.[1];
```

### Depop Scraper Improvements

1. **No login needed approach**:
```typescript
// Public shop pages work without auth
const shopUrl = `https://www.depop.com/${username}/`;
await page.goto(shopUrl, { waitUntil: 'networkidle2' });
```

2. **Extract additional metadata**:
```typescript
const likes = element.querySelector('[data-testid="product__likes"]')?.textContent;
const description = element.querySelector('[data-testid="product__description"]')?.textContent;
```

3. **Handle sold items filter**:
```typescript
// Depop shows sold items mixed with active
const isSold = element.querySelector('[data-testid="product__soldLabel"]') !== null;
```

## Testing Checklist

- [ ] Selectors work on current marketplace version
- [ ] Fallback selectors tested
- [ ] Data extraction validates required fields
- [ ] Handles empty/missing data gracefully
- [ ] Works with both desktop and mobile layouts
- [ ] Pagination/infinite scroll handled
- [ ] Login flow succeeds
- [ ] Error messages are clear

## Maintenance Notes

**Update Frequency**: Check selectors every 3-6 months

**Breaking Changes to Watch For**:
1. Marketplace redesigns (usually announced)
2. Data-testid changes (rare but possible)
3. Class name obfuscation (common in React apps)
4. New bot detection measures

**Quick Test Command**:
```bash
# Open test page
start tests/scraper-manual-test.html

# Or test directly in browser
open https://ebay.com/sh/lst/active
# Then run selector tests in console
```




















