# 🎯 REAL Supabase Setup for Clothing Comps - Following Tutorial

Based on the AI email assistant tutorial, here's how to set up the clothing comps system properly.

## Phase 1: Enable Vector Extension

**Go to:** https://supabase.com/dashboard/project/hqmujfbifgpcyqmpuwil/sql

**Run this FIRST:**

```sql
-- Enable vector extension for AI-powered similarity matching
CREATE EXTENSION IF NOT EXISTS vector;
```

## Phase 2: Create Tables (SQL Editor - NOT programmatically!)

**Run this in SQL Editor:**

```sql
-- Main clothing_comps table (stores scraped sold listings)
CREATE TABLE IF NOT EXISTS clothing_comps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Marketplace info
    source_marketplace TEXT NOT NULL,
    listing_id TEXT,
    url TEXT NOT NULL,

    -- Item details
    title TEXT NOT NULL,
    brand TEXT,
    size TEXT,
    category TEXT,
    condition TEXT,

    -- Pricing
    price NUMERIC(10,2) NOT NULL,
    shipping_cost NUMERIC(10,2) DEFAULT 0,

    -- Media
    image_urls TEXT[],

    -- Metadata
    scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(source_marketplace, listing_id)
);

-- Comp sections table (for embeddings - chunked comp data)
CREATE TABLE IF NOT EXISTS comp_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comp_id UUID REFERENCES clothing_comps(id) ON DELETE CASCADE,

    -- Text content for embedding
    content TEXT NOT NULL,

    -- OpenAI embedding (1536 dimensions for text-embedding-ada-002)
    embedding VECTOR(1536),

    -- Metadata
    section_order INT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Phase 3: Create Vector Indexes (CRITICAL for performance)

```sql
-- Create vector index for similarity search
-- Uses cosine distance (most common for embeddings)
CREATE INDEX IF NOT EXISTS idx_comp_sections_embedding
ON comp_sections
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Regular indexes for filtering
CREATE INDEX IF NOT EXISTS idx_comps_category ON clothing_comps(category);
CREATE INDEX IF NOT EXISTS idx_comps_brand ON clothing_comps(brand);
CREATE INDEX IF NOT EXISTS idx_comps_size ON clothing_comps(size);
CREATE INDEX IF NOT EXISTS idx_comps_marketplace ON clothing_comps(source_marketplace);
```

## Phase 4: Enable Row Level Security

```sql
-- Enable RLS on both tables
ALTER TABLE clothing_comps ENABLE ROW LEVEL SECURITY;
ALTER TABLE comp_sections ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated read on comps"
ON clothing_comps FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated read on sections"
ON comp_sections FOR SELECT
TO authenticated
USING (true);

-- Allow service role full access (for backend operations)
CREATE POLICY "Allow service role full access on comps"
ON clothing_comps FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow service role full access on sections"
ON comp_sections FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow anon read access (for unauthenticated users)
CREATE POLICY "Allow anon read on comps"
ON clothing_comps FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow anon read on sections"
ON comp_sections FOR SELECT
TO anon
USING (true);
```

## Phase 5: Create Vector Similarity Search Function

```sql
-- Function to find similar comps based on embedding similarity
CREATE OR REPLACE FUNCTION match_comp_sections(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  filter_category TEXT DEFAULT NULL,
  filter_brand TEXT DEFAULT NULL,
  filter_size TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  comp_id UUID,
  content TEXT,
  similarity FLOAT,
  title TEXT,
  brand TEXT,
  size TEXT,
  category TEXT,
  price NUMERIC,
  url TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    comp_sections.id,
    comp_sections.comp_id,
    comp_sections.content,
    1 - (comp_sections.embedding <=> query_embedding) AS similarity,
    clothing_comps.title,
    clothing_comps.brand,
    clothing_comps.size,
    clothing_comps.category,
    clothing_comps.price,
    clothing_comps.url
  FROM comp_sections
  JOIN clothing_comps ON comp_sections.comp_id = clothing_comps.id
  WHERE
    1 - (comp_sections.embedding <=> query_embedding) > match_threshold
    AND (filter_category IS NULL OR clothing_comps.category = filter_category)
    AND (filter_brand IS NULL OR clothing_comps.brand ILIKE '%' || filter_brand || '%')
    AND (filter_size IS NULL OR clothing_comps.size = filter_size)
  ORDER BY comp_sections.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

## Phase 6: Test the Setup

**Run this to verify everything works:**

```sql
-- Test 1: Check if tables exist
SELECT COUNT(*) FROM clothing_comps;
SELECT COUNT(*) FROM comp_sections;

-- Test 2: Check if vector extension is enabled
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Test 3: Check if indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename IN ('clothing_comps', 'comp_sections');
```

## ✅ Success Criteria

After running all SQL, you should see:
- ✅ 2 tables created (`clothing_comps`, `comp_sections`)
- ✅ Vector extension enabled
- ✅ 5 indexes created
- ✅ RLS enabled on both tables
- ✅ 6 RLS policies created
- ✅ 1 search function created

## 🎯 Next Steps

Once tables are created, I'll build:
1. **OpenAI Embedding Pipeline** - Chunk scraped comps and create embeddings
2. **RAG Query System** - AI-powered similarity matching
3. **Scrapy Worker** - Scrape + embed + store in one workflow
4. **ItemForm Integration** - "Find Comps" button that uses RAG

---

**Key Lesson from Tutorial:**
- ❌ Don't create tables programmatically
- ✅ Use SQL Editor (this is the Supabase way)
- ✅ Service role key bypasses ALL RLS
- ✅ Vector search + SQL filters = powerful combo
