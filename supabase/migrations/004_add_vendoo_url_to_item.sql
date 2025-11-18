-- Add vendooUrl column to Item table
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "vendooUrl" TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_item_vendoo_url ON "Item"("vendooUrl") WHERE "vendooUrl" IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN "Item"."vendooUrl" IS 'Vendoo marketplace listing URL for this item';

