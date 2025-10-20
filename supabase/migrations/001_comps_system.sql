-- ============================================================================
-- COMPS SYSTEM: Complete Database Schema
-- ============================================================================

-- ============================================================================
-- 1. MARKETPLACE SNAPSHOTS: Raw scraped data
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    card_id UUID REFERENCES items(id) ON DELETE CASCADE,

    -- Source info
    source_marketplace TEXT NOT NULL CHECK (source_marketplace IN ('ebay', 'poshmark', 'mercari', 'depop', 'grailed')),
    url TEXT NOT NULL,
    item_identifier TEXT, -- Marketplace-specific ID

    -- Listing details
    title TEXT NOT NULL,
    sale_price_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'USD',
    sold_date DATE,
    condition TEXT,
    size TEXT,
    color TEXT,
    brand TEXT,

    -- Seller info
    seller_type TEXT CHECK (seller_type IN ('Individual', 'Store', 'Unknown')),
    shipping_cents INTEGER DEFAULT 0,

    -- Media
    image_url TEXT,
    image_urls TEXT[], -- Multiple images

    -- Metadata
    relevance_score DECIMAL(3,2), -- Computed by match_signals
    sanitized_snippet JSONB,
    scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),

    -- Prevent duplicates
    UNIQUE(source_marketplace, item_identifier)
);

-- Indexes for fast queries
CREATE INDEX idx_snapshots_card_id ON marketplace_snapshots(card_id);
CREATE INDEX idx_snapshots_marketplace ON marketplace_snapshots(source_marketplace);
CREATE INDEX idx_snapshots_sold_date ON marketplace_snapshots(sold_date DESC);
CREATE INDEX idx_snapshots_relevance ON marketplace_snapshots(relevance_score DESC NULLS LAST);
CREATE INDEX idx_snapshots_brand_size ON marketplace_snapshots(brand, size);

-- ============================================================================
-- 2. SCRAPE JOBS: Queue for scraping work
-- ============================================================================
CREATE TABLE IF NOT EXISTS scrape_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    card_id UUID REFERENCES items(id) ON DELETE CASCADE,

    -- Job metadata
    metadata_hash TEXT NOT NULL, -- Fingerprint of item metadata
    spider_name TEXT NOT NULL, -- Which spider to use
    url_list TEXT[], -- Optional direct URLs to scrape

    -- State management
    state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'completed', 'failed')),
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,

    -- Timing
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    finished_at TIMESTAMP,

    -- Worker assignment
    worker_id TEXT,
    heartbeat_at TIMESTAMP
);

CREATE INDEX idx_scrape_jobs_state ON scrape_jobs(state);
CREATE INDEX idx_scrape_jobs_card_id ON scrape_jobs(card_id);
CREATE INDEX idx_scrape_jobs_created ON scrape_jobs(created_at DESC);

-- ============================================================================
-- 3. MATCH SIGNALS: Relevance scoring between items and snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS match_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    card_id UUID REFERENCES items(id) ON DELETE CASCADE,
    snapshot_id UUID REFERENCES marketplace_snapshots(id) ON DELETE CASCADE,

    -- Component scores (0-1)
    brand_score DECIMAL(3,2) DEFAULT 0,
    title_score DECIMAL(3,2) DEFAULT 0,
    size_score DECIMAL(3,2) DEFAULT 0,
    color_score DECIMAL(3,2) DEFAULT 0,
    image_similarity_score DECIMAL(3,2),

    -- Composite
    composite_relevance_score DECIMAL(3,2) NOT NULL,

    -- Metadata
    computed_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(card_id, snapshot_id)
);

CREATE INDEX idx_match_signals_card ON match_signals(card_id);
CREATE INDEX idx_match_signals_composite ON match_signals(composite_relevance_score DESC);

-- ============================================================================
-- 4. AI JOBS: OpenAI analysis queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    card_id UUID REFERENCES items(id) ON DELETE CASCADE,
    snapshot_ids UUID[], -- Top K snapshots to analyze

    -- Job config
    job_type TEXT NOT NULL DEFAULT 'market_research',
    model TEXT DEFAULT 'gpt-4o-mini',

    -- State
    state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'completed', 'failed')),
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,

    -- Results
    result_json JSONB,
    tokens_used INTEGER,

    -- Timing
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_ai_jobs_state ON ai_jobs(state);
CREATE INDEX idx_ai_jobs_card_id ON ai_jobs(card_id);
CREATE INDEX idx_ai_jobs_created ON ai_jobs(created_at DESC);

-- ============================================================================
-- 5. USER FEEDBACK: Training data for ML
-- ============================================================================
CREATE TABLE IF NOT EXISTS comp_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    card_id UUID REFERENCES items(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    ai_job_id UUID REFERENCES ai_jobs(id),

    -- Feedback
    accepted_price_cents INTEGER, -- If accepted AI suggestion
    user_override_price_cents INTEGER, -- If user changed it
    reason TEXT,

    -- Context
    ai_suggested_price_cents INTEGER,
    ai_confidence_score INTEGER,
    comparable_count INTEGER,

    -- Metadata
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_feedback_card ON comp_feedback(card_id);
CREATE INDEX idx_feedback_user ON comp_feedback(user_id);
CREATE INDEX idx_feedback_timestamp ON comp_feedback(timestamp DESC);

-- ============================================================================
-- 6. EXTEND ITEMS TABLE: Add comp-related fields
-- ============================================================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS metadata_hash TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS suggested_price_cents INTEGER;
ALTER TABLE items ADD COLUMN IF NOT EXISTS market_summary TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS comparable_count INTEGER DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS market_confidence INTEGER; -- 0-100
ALTER TABLE items ADD COLUMN IF NOT EXISTS last_market_refresh TIMESTAMP;
ALTER TABLE items ADD COLUMN IF NOT EXISTS demand_trend TEXT CHECK (demand_trend IN ('Rising', 'Steady', 'Falling'));
ALTER TABLE items ADD COLUMN IF NOT EXISTS median_price_cents INTEGER;
ALTER TABLE items ADD COLUMN IF NOT EXISTS price_90th_percentile_cents INTEGER;
ALTER TABLE items ADD COLUMN IF NOT EXISTS price_stddev DECIMAL(10,2);

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

-- marketplace_snapshots
ALTER TABLE marketplace_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own snapshots"
    ON marketplace_snapshots FOR SELECT
    TO authenticated
    USING (
        card_id IN (
            SELECT id FROM items WHERE user_id = auth.uid()
        )
    );

-- scrape_jobs
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own scrape jobs"
    ON scrape_jobs FOR SELECT
    TO authenticated
    USING (
        card_id IN (
            SELECT id FROM items WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage scrape jobs"
    ON scrape_jobs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- match_signals
ALTER TABLE match_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own match signals"
    ON match_signals FOR SELECT
    TO authenticated
    USING (
        card_id IN (
            SELECT id FROM items WHERE user_id = auth.uid()
        )
    );

-- ai_jobs
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own AI jobs"
    ON ai_jobs FOR SELECT
    TO authenticated
    USING (
        card_id IN (
            SELECT id FROM items WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage AI jobs"
    ON ai_jobs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- comp_feedback
ALTER TABLE comp_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own feedback"
    ON comp_feedback FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 8. FUNCTIONS: Helper functions for aggregation
-- ============================================================================

-- Function to compute metadata hash
CREATE OR REPLACE FUNCTION compute_metadata_hash(
    p_title TEXT,
    p_brand TEXT,
    p_size TEXT,
    p_condition TEXT,
    p_image_url TEXT
) RETURNS TEXT AS $$
BEGIN
    RETURN md5(
        COALESCE(p_title, '') || '|' ||
        COALESCE(p_brand, '') || '|' ||
        COALESCE(p_size, '') || '|' ||
        COALESCE(p_condition, '') || '|' ||
        COALESCE(p_image_url, '')
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get comp aggregates for a card
CREATE OR REPLACE FUNCTION get_comp_aggregates(p_card_id UUID)
RETURNS TABLE(
    comparable_count INTEGER,
    median_price_cents INTEGER,
    price_90th_percentile_cents INTEGER,
    price_stddev DECIMAL(10,2),
    avg_price_cents INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ms.sale_price_cents)::INTEGER,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ms.sale_price_cents)::INTEGER,
        STDDEV(ms.sale_price_cents)::DECIMAL(10,2),
        AVG(ms.sale_price_cents)::INTEGER
    FROM marketplace_snapshots ms
    JOIN match_signals sig ON sig.snapshot_id = ms.id
    WHERE sig.card_id = p_card_id
        AND sig.composite_relevance_score >= 0.6
        AND ms.sale_price_cents > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. TRIGGERS: Auto-update metadata hash
-- ============================================================================

CREATE OR REPLACE FUNCTION update_item_metadata_hash()
RETURNS TRIGGER AS $$
BEGIN
    NEW.metadata_hash = compute_metadata_hash(
        NEW.name,
        NEW.brand,
        NEW.size,
        NEW.status,
        NEW.imageUrl
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_metadata_hash
    BEFORE INSERT OR UPDATE OF name, brand, size, status, imageUrl
    ON items
    FOR EACH ROW
    EXECUTE FUNCTION update_item_metadata_hash();

COMMENT ON TABLE marketplace_snapshots IS 'Raw scraped sold listings from marketplaces';
COMMENT ON TABLE scrape_jobs IS 'Queue for Scrapy worker jobs';
COMMENT ON TABLE match_signals IS 'Relevance scores between items and snapshots';
COMMENT ON TABLE ai_jobs IS 'Queue for OpenAI analysis jobs';
COMMENT ON TABLE comp_feedback IS 'User feedback for ML training';
