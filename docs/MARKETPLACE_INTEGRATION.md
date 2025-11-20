# Marketplace Integration Documentation

## Overview

The Puppeteer Marketplace Integration allows you to automatically scrape listings from eBay, Poshmark, and Depop to either import new items into your inventory or fill marketplace URL links for existing items.

## Features

- **eBay Scraper**: Scrapes active and sold listings from eBay Seller Hub
- **Poshmark Scraper**: Imports items from your Poshmark closet
- **Depop Scraper**: Scrapes your Depop shop listings
- **Two Modes**:
  - **Import**: Creates new items from scraped listings (skips duplicates)
  - **Fill Links**: Matches scraped items to existing inventory and adds marketplace URLs
- **Secure Credentials**: Encrypted storage of marketplace credentials
- **Fuzzy Matching**: 80%+ similarity matching algorithm for linking items

## Database Schema

### New Columns in `Item` Table

```sql
ebayUrl TEXT
poshmarkUrl TEXT
depopUrl TEXT
```

### Credentials Table

```sql
user_marketplace_credentials (
  user_uuid UUID,
  marketplace TEXT,
  email TEXT,
  password_encrypted TEXT,
  session_cookie TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

## API Endpoints

### 1. eBay Scraper

**Endpoint**: `POST /api/ebay/scrape-listings`

**Request Body**:
```json
{
  "action": "import" | "fill-links",
  "username": "your-ebay-username",
  "password": "your-password",
  "sessionCookie": "optional-session-cookie"
}
```

**Response**:
```json
{
  "success": true,
  "scrapedCount": 25,
  "importedCount": 10,
  "updatedCount": 15,
  "skippedCount": 0,
  "errors": [],
  "items": [
    {
      "title": "Nike Hoodie",
      "action": "imported",
      "itemId": "abc-123"
    }
  ]
}
```

### 2. Poshmark Scraper

**Endpoint**: `POST /api/poshmark/scrape-listings`

**Request Body**:
```json
{
  "action": "import" | "fill-links",
  "username": "your-poshmark-username",
  "password": "your-password"
}
```

### 3. Depop Scraper

**Endpoint**: `POST /api/depop/scrape-listings`

**Request Body**:
```json
{
  "action": "import" | "fill-links",
  "username": "your-depop-username",
  "password": "your-password",
  "shopUrl": "https://depop.com/@username" // Alternative to credentials
}
```

### 4. Save Credentials

**Endpoint**: `POST /api/marketplace/save-credentials`

**Request Body**:
```json
{
  "marketplace": "ebay" | "poshmark" | "depop",
  "email": "username@example.com",
  "password": "your-password",
  "sessionCookie": "optional"
}
```

## Usage Guide

### From the UI

1. Click the **"Markets"** button in the header
2. Select a marketplace (eBay, Poshmark, or Depop)
3. Choose an action:
   - **Fill Links Only**: Updates existing items with marketplace URLs
   - **Import New Items**: Creates new inventory items from listings
4. Enter credentials or use saved credentials
5. Click **"Start Scraping"**
6. Review results and close when complete

### From the ItemForm

When editing an item, expand "Advanced Options" to manually add marketplace URLs:
- **Vendoo URL**
- **eBay URL**
- **Poshmark URL**
- **Depop URL**

## Matching Algorithm

The fuzzy matching algorithm uses Levenshtein distance to calculate similarity:

```typescript
calculateSimilarity("Nike Air Max", "Nike Air Max 90") // Returns ~0.85
```

**Matching Thresholds**:
- Import mode: 95% similarity to skip duplicates
- Fill-links mode: 80% similarity to match items

## Security

### Password Encryption

Passwords are encrypted using AES-256-CBC before storage:

```typescript
const key = scryptSync(ENCRYPTION_KEY, 'salt', 32);
const cipher = createCipheriv('aes-256-cbc', key, iv);
```

**Environment Variable Required**:
```env
CREDENTIALS_ENCRYPTION_KEY=your-32-byte-encryption-key
```

### Row Level Security

All credentials are protected with RLS policies:
```sql
CREATE POLICY "Users can view their own marketplace credentials" 
  ON user_marketplace_credentials FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_uuid);
```

## Running Migrations

Run the new migrations on your Supabase project:

```bash
# Add marketplace URL columns
psql $DATABASE_URL -f supabase/migrations/005_add_marketplace_urls.sql

# Add credentials table
psql $DATABASE_URL -f supabase/migrations/006_add_marketplace_credentials.sql
```

Or use Supabase CLI:
```bash
supabase db push
```

## Testing

### Local Testing

1. Start the development server:
```bash
npm run dev
```

2. Test scrapers with `vercel dev`:
```bash
vercel dev
```

3. Make a test request:
```bash
curl -X POST http://localhost:3000/api/ebay/scrape-listings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"fill-links","username":"test@example.com","password":"test"}'
```

### Production Testing

1. Deploy to Vercel
2. Test with real credentials through the UI
3. Monitor Vercel logs for errors
4. Check Supabase for updated items

## Troubleshooting

### Common Issues

**1. "Browser launch failed"**
- Cause: Chromium not available in serverless environment
- Solution: Ensure `@sparticuz/chromium` is installed and Vercel Pro plan is active

**2. "Credentials not found"**
- Cause: No saved credentials or invalid session
- Solution: Re-enter credentials or check RLS policies

**3. "No items matched"**
- Cause: Title similarity below threshold
- Solution: Lower threshold in code or manually add URLs

**4. "Timeout error"**
- Cause: Marketplace taking too long to load
- Solution: Increase `maxDuration` in API config or use session cookies

### Debug Mode

Enable verbose logging:
```typescript
console.log('Scraped items:', scrapedItems);
console.log('DB items:', dbItems);
console.log('Match result:', match);
```

## Performance Considerations

### Vercel Limitations

- **maxDuration**: 300s (5 minutes) on Pro plan
- **Memory**: ~150MB per browser instance
- **Cold starts**: 5-10 seconds on first request

### Optimization Tips

1. **Use session cookies** instead of login (faster, less detectable)
2. **Batch scraping**: Process multiple items in one session
3. **Cache results**: Store scraped data temporarily
4. **Limit concurrent requests**: One scrape at a time per user

## Anti-Bot Measures

Marketplaces may detect headless Chrome. Mitigations:

1. **Use chromium.args** to mask headless mode
2. **Add random delays** between actions (500-2000ms)
3. **Rotate user agents** (optional)
4. **Use session cookies** instead of repeated logins

## Future Enhancements

- [ ] Mercari scraper
- [ ] Grailed scraper
- [ ] Scheduled automatic scraping
- [ ] Email notifications for new matches
- [ ] Bulk import from CSV
- [ ] API rate limiting
- [ ] Scrape job queue system
- [ ] Manual review UI for ambiguous matches

## Support

For issues or questions:
1. Check Vercel logs: `vercel logs`
2. Check Supabase logs in dashboard
3. Review Notion error queue: `ops/logging/notion-queue.jsonl`
4. File an issue in Linear with label "marketplace-scraper"

## License

Part of Virtual Closet inventory management system.







