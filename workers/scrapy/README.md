# Clothing Comp Scraper

AI-powered web scraper for finding comparable sold clothing items across multiple marketplaces.

## Features

- 🤖 **AI-Powered Matching** - Uses OpenAI GPT-4o-mini to extract features and calculate similarity scores
- 🛒 **Multi-Marketplace** - Scrapes eBay, Poshmark, and Mercari sold listings
- 💾 **Supabase Storage** - Automatically saves comps to Supabase database
- 🎯 **Smart Search** - AI generates optimized search queries from item features
- 📊 **Similarity Scoring** - Only returns items with >50% similarity to your query

## Setup

1. **Install Python dependencies:**
```bash
cd workers/scrapy
pip install -r requirements.txt
playwright install chromium
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your API keys
```

3. **Create Supabase table:**
- Go to Supabase SQL Editor
- Run the SQL in `schema.sql`

## Usage

### Run a single spider with query:
```bash
python run_spider.py --spider ebay --query "Nike Hoodie Size L"
```

### Run all spiders:
```bash
python run_spider.py --spider all --query "Vintage Champion Sweatshirt XL"
```

### Run with AI feature matching:
```bash
python run_spider.py --spider ebay --features '{"category": "hoodie", "brand": "Nike", "size": "L"}'
```

### Direct scrapy commands:
```bash
# eBay spider
scrapy crawl ebay -a query="Supreme Box Logo Hoodie"

# Poshmark spider
scrapy crawl poshmark -a query="Carhartt Jacket Medium"

# Mercari spider
scrapy crawl mercari -a query="Vintage NFL Jersey XL"
```

## Architecture

- **Spiders** - Scrapy spiders for each marketplace
- **AI Agent** - OpenAI-powered feature extraction and similarity scoring
- **Pipeline** - Automatic storage to Supabase
- **Items** - Structured data models for clothing comps

## API Integration

The scraped comps are stored in Supabase `clothing_comps` table and can be queried from your React app:

```typescript
const { data: comps } = await supabase
  .from('clothing_comps')
  .select('*')
  .eq('category', 'hoodie')
  .gte('similarity_score', 0.7)
  .order('price', { ascending: false })
  .limit(10)
```

## Environment Variables

See `.env.example` for required configuration:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for inserting data
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `OPENAI_MODEL` - Model to use (default: gpt-4o-mini)
