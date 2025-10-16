-- Supabase table for clothing comps
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS clothing_comps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identifiers
    source_marketplace TEXT NOT NULL CHECK (source_marketplace IN ('ebay', 'poshmark', 'mercari', 'depop', 'grailed')),
    listing_id TEXT,
    url TEXT NOT NULL,

    -- Item details
    title TEXT NOT NULL,
    brand TEXT,
    size TEXT,
    condition TEXT,
    category TEXT,

    -- Pricing
    price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2),
    shipping_cost DECIMAL(10,2) DEFAULT 0,

    -- Metadata
    sold_date TIMESTAMP,
    image_urls TEXT[],
    description TEXT,

    -- AI-extracted features
    ai_features JSONB,
    similarity_score DECIMAL(3,2),

    -- Timestamps
    scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),

    -- Index for faster queries
    UNIQUE(source_marketplace, listing_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_clothing_comps_marketplace ON clothing_comps(source_marketplace);
CREATE INDEX IF NOT EXISTS idx_clothing_comps_category ON clothing_comps(category);
CREATE INDEX IF NOT EXISTS idx_clothing_comps_brand ON clothing_comps(brand);
CREATE INDEX IF NOT EXISTS idx_clothing_comps_similarity ON clothing_comps(similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_clothing_comps_price ON clothing_comps(price);
CREATE INDEX IF NOT EXISTS idx_clothing_comps_scraped_at ON clothing_comps(scraped_at DESC);

-- Enable Row Level Security
ALTER TABLE clothing_comps ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read
CREATE POLICY "Allow authenticated users to read clothing_comps"
    ON clothing_comps
    FOR SELECT
    TO authenticated
    USING (true);

-- Create policy to allow service role to insert/update
CREATE POLICY "Allow service role to insert clothing_comps"
    ON clothing_comps
    FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Allow service role to update clothing_comps"
    ON clothing_comps
    FOR UPDATE
    TO service_role
    USING (true);
