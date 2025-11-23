-- Marketplace Listing Drafts
-- Stores imported listings from external marketplaces so they can be
-- managed long-term and staged for future cross-posting flows.

CREATE TABLE IF NOT EXISTS marketplace_listing_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('ebay', 'poshmark', 'depop')),
  marketplace_listing_id TEXT NOT NULL,
  source_account TEXT,
  title TEXT,
  description TEXT,
  status TEXT,
  price_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  quantity INTEGER DEFAULT 1,
  sku TEXT,
  url TEXT,
  image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  raw_payload JSONB,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  ready_for_crosspost BOOLEAN DEFAULT FALSE,
  crosspost_targets TEXT[] DEFAULT ARRAY[]::TEXT[],
  crosspost_status JSONB DEFAULT '{}'::JSONB,
  closet_item_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_uuid, marketplace, marketplace_listing_id)
);

-- Allow linking to closet inventory without hard FK constraint to avoid
-- blocking inserts when the items table name differs per environment.
COMMENT ON COLUMN marketplace_listing_drafts.closet_item_id IS
  'Optional reference to the closet inventory item created from this draft';

ALTER TABLE marketplace_listing_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own listing drafts"
  ON marketplace_listing_drafts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_uuid)
  WITH CHECK (auth.uid() = user_uuid);

CREATE INDEX IF NOT EXISTS idx_listing_drafts_user
  ON marketplace_listing_drafts(user_uuid, marketplace);

CREATE INDEX IF NOT EXISTS idx_listing_drafts_ready
  ON marketplace_listing_drafts(user_uuid, ready_for_crosspost);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_listing_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listing_drafts_updated_at
  BEFORE UPDATE ON marketplace_listing_drafts
  FOR EACH ROW
  EXECUTE FUNCTION set_listing_drafts_updated_at();

