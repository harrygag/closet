# Quick Start: RAG-Powered Clothing Comps

Get the AI-powered comparable sales feature working in 5 minutes.

## Prerequisites

- Supabase account with project created
- OpenAI API key
- Node.js and Python installed

## Step 1: Create Database Tables (2 minutes)

1. Open Supabase SQL Editor:
   https://supabase.com/dashboard/project/hqmujfbifgpcyqmpuwil/sql

2. Copy and paste ALL SQL from:
   `supabase/SETUP_INSTRUCTIONS.md`

3. Click "Run"

4. Verify success:
   ```bash
   npx tsx quick-test.ts
   ```

   Should see: `✅ Table exists!`

## Step 2: Add Test Data (1 minute)

```bash
# Install Python deps
cd workers/scrapy
pip install supabase python-dotenv

# Add 8 test comps
python add-test-comps.py
```

Should see:
```
[1/8] Adding: Nike Air Force 1 Low White Size 10
  ✅ Success - ID: abc-123
...
✅ Test comps added!
```

## Step 3: Generate Embeddings (1 minute)

```bash
# Install Node deps
npm install openai @supabase/supabase-js dotenv tsx

# Generate embeddings
npx tsx workers/scrapy/test-embedding-pipeline.ts
```

Should see:
```
=== TEST 1: Batch Save Comps ===
✅ Saved comp: Nike Air Force 1 Low White Size 10
🤖 Generating OpenAI embedding...
✅ Saved embedding to comp_sections
...
✅ EMBEDDING PIPELINE TEST COMPLETE!
```

## Step 4: Test in UI (1 minute)

```bash
# Start the app
npm run dev
```

1. Open http://localhost:5173
2. Click "Add New Item" button
3. Fill in:
   - Name: `Nike Air Force 1`
   - Size: `10`
   - Tags: `Sneakers`
4. Click "Find Comparable Sales"

You should see:
- Stats: Avg Price, Median, Range
- 2-3 comp cards with images and similarity scores
- Links to eBay/Poshmark listings

## Step 5: Add Real Scrapy Data (Optional)

```bash
cd workers/scrapy

# Install Scrapy deps
pip install -r requirements.txt

# Scrape eBay for Nike sneakers
scrapy crawl ebay -a query="Nike Air Force 1 Size 10"

# The spider will:
# 1. Scrape sold listings
# 2. Generate embeddings
# 3. Save to Supabase
# 4. Show up in ItemForm search
```

## Troubleshooting

### "Table does not exist"
- Go to Step 1 and run the SQL in Supabase SQL Editor
- The table MUST be created via SQL Editor (not programmatically)

### "No comps found" in UI
- Run: `python workers/scrapy/add-test-comps.py`
- Then: `npx tsx workers/scrapy/test-embedding-pipeline.ts`
- Verify data in Supabase dashboard

### OpenAI API errors
- Check `.env` has `OPENAI_API_KEY=sk-proj-...`
- Verify your OpenAI account has billing enabled
- Test: `echo $OPENAI_API_KEY` (should not be empty)

### Embeddings not generating
- Verify both tables exist in Supabase
- Check service role key is correct in `.env`
- Look for errors in console output

## Next Steps

1. **Real Scrapy Integration**
   - Configure ScrapFly for bot protection
   - Set up scheduled scraping (cron job)
   - Scrape eBay, Poshmark, Mercari continuously

2. **API Endpoint**
   - Deploy `/api/search-comps` endpoint
   - Call from ItemForm instead of direct query
   - Enable real-time RAG search

3. **Advanced Features**
   - Image similarity (CLIP embeddings)
   - Price prediction ML model
   - Market analytics dashboard

## Architecture Summary

```
ItemForm
   │
   ├─> Extract item details (name, brand, size)
   │
   ├─> Generate OpenAI embedding
   │
   ├─> Vector similarity search (pgvector)
   │
   └─> Display comps with stats
```

## Key Files

- `supabase/SETUP_INSTRUCTIONS.md` - Complete SQL setup
- `workers/scrapy/README.md` - Full RAG pipeline docs
- `workers/scrapy/embed-comps.ts` - Embedding generation
- `workers/scrapy/add-test-comps.py` - Test data script
- `src/components/ItemForm.tsx` - UI integration

## Success Criteria

After completing all steps, you should have:

- ✅ 2 Supabase tables (`clothing_comps`, `comp_sections`)
- ✅ 8 test comps with embeddings
- ✅ "Find Comparable Sales" button working in ItemForm
- ✅ Real marketplace data displayed with similarity scores
- ✅ Stats calculated (avg, median, min, max)

## Support

If you get stuck:

1. Check [workers/scrapy/README.md](workers/scrapy/README.md) for detailed docs
2. Verify all SQL ran successfully in Supabase
3. Test each step independently using the test scripts
4. Check console for error messages

The RAG system is now ready for production use!
