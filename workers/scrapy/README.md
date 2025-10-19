# Clothing Comps RAG Pipeline

AI-powered comparable sales system using OpenAI embeddings + pgvector for intelligent matching.

## Architecture

```
USER FLOW (ItemForm)
       │
       │ 1. Click "Find Comparable Sales"
       ▼
┌──────────────────────────────────────────┐
│  Frontend (ItemForm.tsx)                 │
│  • Extract: name, brand, size, category │
│  • Build query text                      │
│  • Call: /api/search-comps               │
└──────────────────────────────────────────┘
       │
       │ 2. POST request
       ▼
┌──────────────────────────────────────────┐
│  API Endpoint (api/search-comps.ts)      │
│  • Generate query embedding (OpenAI)     │
│  • Call match_comp_sections() RPC        │
│  • Return top-K similar comps            │
└──────────────────────────────────────────┘
       │
       │ 3. Vector similarity search
       ▼
┌──────────────────────────────────────────┐
│  Supabase (pgvector + RPC function)      │
│  • Cosine similarity search              │
│  • SQL filters (brand, size, category)   │
│  • Return matches above threshold        │
└──────────────────────────────────────────┘
       │
       │ 4. Results
       ▼
┌──────────────────────────────────────────┐
│  ItemForm UI Display                     │
│  • Stats: avg price, median, range       │
│  • Comp cards with images + similarity % │
│  • Links to original listings            │
└──────────────────────────────────────────┘
```

## Data Flow: Scrapy → Embeddings → Supabase

```
Scrapy Spiders (Python)
  • ebay_spider.py
  • poshmark_spider.py
  • mercari_spider.py
       │
       │ Scraped data
       ▼
Embedding Pipeline (embed-comps.ts)
  1. Save comp to clothing_comps table
  2. Create embedding text
  3. Generate embedding (OpenAI)
  4. Save to comp_sections with vector
       │
       │ Stored in DB
       ▼
Supabase Tables
  • clothing_comps (metadata)
  • comp_sections (embeddings)
```

## Setup Steps

### 1. Create Supabase Tables (REQUIRED)

**Go to:** https://supabase.com/dashboard/project/hqmujfbifgpcyqmpuwil/sql

**Run ALL SQL from:** `supabase/SETUP_INSTRUCTIONS.md`

This creates:
- Vector extension
- `clothing_comps` and `comp_sections` tables
- Vector indexes for performance
- RLS policies
- `match_comp_sections()` function

### 2. Environment Variables

**Create `.env` in project root:**

```env
# Supabase
VITE_SUPABASE_URL=https://hqmujfbifgpcyqmpuwil.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_CLIENT_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
```

### 3. Install Dependencies

```bash
# TypeScript/Node packages
npm install openai @supabase/supabase-js dotenv tsx

# Python packages (for Scrapy)
cd workers/scrapy
pip install -r requirements.txt
```

### 4. Test the Pipeline

#### Option A: Add test data + generate embeddings

```bash
# Add test comps to DB
python workers/scrapy/add-test-comps.py

# Generate embeddings for all comps
npx tsx workers/scrapy/test-embedding-pipeline.ts
```

#### Option B: Verify table exists

```bash
npx tsx quick-test.ts
```

Should see: `✅ Table exists!`

### 5. Test ItemForm Integration

1. Run the app: `npm run dev`
2. Open ItemForm
3. Fill in: Name = "Nike Air Force 1", Size = "10", Tags = ["Sneakers"]
4. Click "Find Comparable Sales"
5. Should show real comps with similarity scores

## Files Overview

### Backend (Scrapy + Embeddings)

| File | Purpose |
|------|---------|
| `embed-comps.ts` | Core embedding pipeline - save comps with vectors |
| `test-embedding-pipeline.ts` | Test script for RAG system |
| `add-test-comps.py` | Add test data to Supabase |
| `spiders/ebay_spider.py` | Scrape eBay sold listings |
| `spiders/poshmark_spider.py` | Scrape Poshmark sold listings |
| `spiders/mercari_spider.py` | Scrape Mercari sold listings |
| `ai_agent.py` | OpenAI GPT for feature extraction |
| `pipelines.py` | Supabase storage pipeline |

### Frontend (React)

| File | Purpose |
|------|---------|
| `src/components/ItemForm.tsx` | "Find Comparable Sales" button |
| `src/services/rag-comps.ts` | RAG comp search service |
| `api/search-comps.ts` | API endpoint for vector search |

### Database

| File | Purpose |
|------|---------|
| `supabase/SETUP_INSTRUCTIONS.md` | Complete SQL setup guide |
| `schema.sql` | Database schema (reference) |

## How RAG Works

### Query Processing

When user searches for comps:

1. **Input:** `"Nike Air Force 1 white sneakers size 10"`

2. **Embedding Generation:**
   ```typescript
   const embedding = await openai.embeddings.create({
     model: 'text-embedding-ada-002',
     input: 'Nike Air Force 1 | Brand: Nike | Size: 10 | Category: Sneakers'
   })
   // Returns: [0.002, -0.015, 0.008, ...] (1536 dimensions)
   ```

3. **Vector Search:**
   ```sql
   SELECT * FROM match_comp_sections(
     query_embedding := [0.002, -0.015, ...],
     match_threshold := 0.5,
     match_count := 10,
     filter_brand := 'Nike',
     filter_size := '10'
   )
   ```

4. **Results:**
   ```json
   [
     {
       "title": "Nike Air Force 1 Low White Size 10",
       "similarity": 0.95,
       "price": 85.00,
       "url": "https://ebay.com/itm/123"
     }
   ]
   ```

## Next Steps

### Phase 1: Verify Setup
- [ ] Run SQL from `supabase/SETUP_INSTRUCTIONS.md`
- [ ] Add test data: `python workers/scrapy/add-test-comps.py`
- [ ] Test embeddings: `npx tsx workers/scrapy/test-embedding-pipeline.ts`

### Phase 2: Real Scrapy Integration
- [ ] Configure ScrapFly for bot protection
- [ ] Test eBay spider with real queries
- [ ] Integrate embedding pipeline into Scrapy pipeline
- [ ] Set up cron job for continuous scraping

### Phase 3: Production RAG
- [ ] Deploy API endpoint
- [ ] Optimize vector search parameters
- [ ] Add caching for common queries

## Troubleshooting

### "Table does not exist"
Run SQL from `supabase/SETUP_INSTRUCTIONS.md` in Supabase SQL Editor

### "No comps found"
```bash
python workers/scrapy/add-test-comps.py
npx tsx workers/scrapy/test-embedding-pipeline.ts
```

### "OpenAI API error"
Check `OPENAI_API_KEY` in `.env`

## Key Lessons

1. ❌ **Don't create tables programmatically** - Use SQL Editor
2. ✅ **Vector search + SQL filters = powerful**
3. ✅ **IVFFlat index is critical for performance**
