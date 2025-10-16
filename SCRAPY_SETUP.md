# Clothing Comp Scraper Setup Guide

This guide will help you set up the AI-powered web scraper to find comparable sold clothing items.

## Prerequisites

- Python 3.9+ installed
- Supabase project with `clothing_comps` table
- OpenAI API key
- Your clothing inventory app running

## Step 1: Install Python Dependencies

```bash
cd workers/scrapy
pip install -r requirements.txt
playwright install chromium
```

## Step 2: Configure Environment

The `.env` file has already been created with your credentials. Verify it contains:

```bash
SUPABASE_URL=https://hqmujfbifgpcyqmpuwil.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
OPENAI_API_KEY=your-key
```

## Step 3: Create Supabase Table

1. Go to your Supabase project: https://hqmujfbifgpcyqmpuwil.supabase.co
2. Navigate to SQL Editor
3. Run the SQL script from `workers/scrapy/schema.sql`

This creates the `clothing_comps` table with proper indexes and RLS policies.

## Step 4: Test the Scraper

Run a test scrape for a Nike hoodie:

```bash
cd workers/scrapy
python run_spider.py --spider ebay --query "Nike Hoodie Size L sold"
```

You should see output like:
```
Running spider: ebay
Query: Nike Hoodie Size L sold
[scrapy] INFO: Scraped 15 items
Saved comp: Nike Tech Fleece Hoodie - $65.00
Saved comp: Nike Sportswear Club Hoodie - $42.00
...
```

## Step 5: Integrate with Your App

The scraped comps are automatically saved to Supabase. To view them in your Pokemon app:

1. Click any clothing item card
2. Click the **TrendingUp icon** (📈) button
3. The CompsDrawer will open showing:
   - Average sold price
   - Price range
   - Similar items from eBay, Poshmark, Mercari
   - AI similarity scores

## Usage Examples

### Scrape eBay for specific item:
```bash
python run_spider.py --spider ebay --query "Supreme Box Logo Hoodie XL"
```

### Scrape all marketplaces:
```bash
python run_spider.py --spider all --query "Carhartt Jacket Medium"
```

### Use AI feature matching:
```bash
python run_spider.py --spider ebay --features '{"category": "hoodie", "brand": "Nike", "size": "L"}'
```

## How It Works

1. **AI Query Generation** - OpenAI generates optimized search queries from your item attributes
2. **Smart Scraping** - Playwright-powered scraping of sold listings
3. **Feature Extraction** - AI extracts brand, size, color, condition from listings
4. **Similarity Scoring** - AI compares scraped items to your inventory (0-1 score)
5. **Auto-Storage** - Items with >50% similarity saved to Supabase
6. **Real-time Display** - CompsDrawer shows comps instantly in your app

## Marketplace Coverage

- ✅ **eBay** - Sold listings with shipping costs
- ✅ **Poshmark** - Sold items with standard shipping
- ✅ **Mercari** - Sold listings
- 🚧 **Depop** - Coming soon
- 🚧 **Grailed** - Coming soon

## Tips

- Run scraper before pricing new items
- Use specific queries for better matches
- Check similarity scores (>0.7 is very similar)
- Run daily to keep comp data fresh
- Use `--features` for highly targeted searches

## Troubleshooting

**No results found:**
- Try broader search queries
- Check marketplace URLs are accessible
- Verify Supabase credentials

**AI errors:**
- Verify OpenAI API key is valid
- Check API quota/rate limits

**Scraping errors:**
- Update Playwright: `playwright install --force chromium`
- Check if websites changed their HTML structure

## Next Steps

1. Create a cron job to run scraper daily
2. Add more marketplaces (Depop, Grailed)
3. Build price prediction model from comps
4. Auto-suggest pricing based on comps
