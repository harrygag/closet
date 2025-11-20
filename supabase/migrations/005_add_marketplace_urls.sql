-- Add marketplace URL columns to Item table
-- These columns store direct links to item listings on various marketplaces

ALTER TABLE "Item" 
  ADD COLUMN IF NOT EXISTS ebayUrl TEXT,
  ADD COLUMN IF NOT EXISTS poshmarkUrl TEXT,
  ADD COLUMN IF NOT EXISTS depopUrl TEXT;

-- Create indexes for efficient querying by marketplace URL
CREATE INDEX IF NOT EXISTS idx_item_ebay_url ON "Item"(ebayUrl) WHERE ebayUrl IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_poshmark_url ON "Item"(poshmarkUrl) WHERE poshmarkUrl IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_depop_url ON "Item"(depopUrl) WHERE depopUrl IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN "Item".ebayUrl IS 'Direct URL to eBay listing';
COMMENT ON COLUMN "Item".poshmarkUrl IS 'Direct URL to Poshmark listing';
COMMENT ON COLUMN "Item".depopUrl IS 'Direct URL to Depop listing';



