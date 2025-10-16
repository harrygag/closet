-- PRD-Compliant Schema for Pokemon Closet Inventory
-- Based on Product Requirements Document specifications

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  prefs JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Decks (Energy Type Collections)
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  energy_type TEXT NOT NULL CHECK (energy_type IN ('Steel', 'Fairy', 'Fire', 'Grass', 'Water', 'Metal', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Dragon')),
  color_hex TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Cards (Clothing Items)
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
  
  -- Required Metadata (for research gating)
  title TEXT NOT NULL,
  brand TEXT NOT NULL,
  size_normalized TEXT NOT NULL,
  primary_image_url TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('New', 'Like New', 'Good', 'Fair', 'Poor')),
  
  -- Optional Metadata
  sku TEXT,
  barcode TEXT,
  price_cents_entered INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  size_region TEXT,
  color_normalized TEXT,
  material TEXT,
  measurements_json JSONB,
  hanger_assignment TEXT,
  
  -- Images
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  image_quality_score DECIMAL(3,2) DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'SOLD', 'Eliminated')),
  listing_date DATE,
  acquisition_date DATE,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Market Research Results
  suggested_price_cents INTEGER,
  suggested_price_source TEXT,
  market_summary TEXT,
  demand_trend TEXT,
  comparable_count INTEGER DEFAULT 0,
  market_confidence INTEGER DEFAULT 0, -- 0-100
  last_market_refresh TIMESTAMPTZ,
  
  -- Idempotency
  metadata_hash TEXT UNIQUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Marketplace Snapshots (Sold Comps)
CREATE TABLE marketplace_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Snapshot Data
  source_marketplace TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  sale_price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  sold_date TIMESTAMPTZ NOT NULL,
  condition TEXT,
  size TEXT,
  color TEXT,
  seller_type TEXT,
  shipping_cents INTEGER DEFAULT 0,
  image_url TEXT,
  item_identifier TEXT,
  
  -- Relevance Scoring
  relevance_score DECIMAL(3,2) DEFAULT 0,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  sanitized_snippet TEXT,
  
  CONSTRAINT sold_date_recent CHECK (sold_date >= NOW() - INTERVAL '12 months')
);

-- Scrape Jobs Queue
CREATE TABLE scrape_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  
  -- Job Configuration
  url_list TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata_hash TEXT NOT NULL,
  spider_name TEXT NOT NULL,
  
  -- Job State
  state TEXT DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  result_snapshot_ids UUID[] DEFAULT ARRAY[]::UUID[],
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

-- AI Jobs Queue
CREATE TABLE ai_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  snapshot_ids UUID[] NOT NULL,
  
  -- Job Configuration
  job_type TEXT DEFAULT 'market_research' CHECK (job_type IN ('market_research', 'image_analysis', 'pricing_suggestion')),
  
  -- Job State
  state TEXT DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  result_json JSONB,
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Match Signals (for ML training)
CREATE TABLE match_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES marketplace_snapshots(id) ON DELETE CASCADE,
  
  -- Scoring Components
  brand_score DECIMAL(3,2) DEFAULT 0,
  title_score DECIMAL(3,2) DEFAULT 0,
  size_score DECIMAL(3,2) DEFAULT 0,
  color_score DECIMAL(3,2) DEFAULT 0,
  image_similarity_score DECIMAL(3,2) DEFAULT 0,
  composite_relevance_score DECIMAL(3,2) DEFAULT 0,
  
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Feedback for AI Training
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ai_job_id UUID REFERENCES ai_jobs(id) ON DELETE SET NULL,
  
  accepted_price_cents INTEGER,
  user_override_price_cents INTEGER,
  reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX idx_cards_user_id ON cards(user_id);
CREATE INDEX idx_cards_deck_id ON cards(deck_id);
CREATE INDEX idx_cards_status ON cards(status);
CREATE INDEX idx_cards_metadata_hash ON cards(metadata_hash);
CREATE INDEX idx_snapshots_card_id ON marketplace_snapshots(card_id);
CREATE INDEX idx_snapshots_sold_date ON marketplace_snapshots(sold_date);
CREATE INDEX idx_scrape_jobs_state ON scrape_jobs(state);
CREATE INDEX idx_scrape_jobs_card_id ON scrape_jobs(card_id);
CREATE INDEX idx_ai_jobs_state ON ai_jobs(state);
CREATE INDEX idx_ai_jobs_card_id ON ai_jobs(card_id);

-- Row Level Security (RLS) Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY users_policy ON users
  FOR ALL USING (auth.uid() = id);

CREATE POLICY decks_policy ON decks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY cards_policy ON cards
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY snapshots_policy ON marketplace_snapshots
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY scrape_jobs_policy ON scrape_jobs
  FOR ALL USING (auth.uid() = (SELECT user_id FROM cards WHERE cards.id = scrape_jobs.card_id));

CREATE POLICY ai_jobs_policy ON ai_jobs
  FOR ALL USING (auth.uid() = (SELECT user_id FROM cards WHERE cards.id = ai_jobs.card_id));

CREATE POLICY match_signals_policy ON match_signals
  FOR ALL USING (auth.uid() = (SELECT user_id FROM cards WHERE cards.id = match_signals.card_id));

CREATE POLICY feedback_policy ON feedback
  FOR ALL USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate metadata hash
CREATE OR REPLACE FUNCTION calculate_metadata_hash(
  p_title TEXT,
  p_brand TEXT,
  p_size TEXT,
  p_primary_image_url TEXT,
  p_condition TEXT
) RETURNS TEXT AS $$
BEGIN
  RETURN encode(
    digest(
      CONCAT(
        LOWER(TRIM(p_title)),
        LOWER(TRIM(p_brand)),
        LOWER(TRIM(p_size)),
        p_primary_image_url,
        p_condition
      ),
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to auto-generate metadata_hash on insert/update
CREATE OR REPLACE FUNCTION auto_metadata_hash()
RETURNS TRIGGER AS $$
BEGIN
  NEW.metadata_hash := calculate_metadata_hash(
    NEW.title,
    NEW.brand,
    NEW.size_normalized,
    NEW.primary_image_url,
    NEW.condition
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cards_metadata_hash
  BEFORE INSERT OR UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION auto_metadata_hash();

-- Insert default energy type decks for new users
CREATE OR REPLACE FUNCTION create_default_decks()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO decks (user_id, name, energy_type, color_hex) VALUES
    (NEW.id, 'Polos', 'Steel', '#C0C0C0'),
    (NEW.id, 'Hoodies', 'Fairy', '#FFB6C1'),
    (NEW.id, 'Jackets', 'Fire', '#FF4500'),
    (NEW.id, 'Jerseys', 'Grass', '#32CD32'),
    (NEW.id, 'Shirts', 'Water', '#1E90FF'),
    (NEW.id, 'Bottoms', 'Metal', '#778899');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_user_decks
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_decks();
