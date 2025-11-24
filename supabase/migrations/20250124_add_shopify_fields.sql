-- Add Shopify integration fields to Item table
ALTER TABLE "Item"
ADD COLUMN IF NOT EXISTS "shopify_product_id" TEXT,
ADD COLUMN IF NOT EXISTS "shopify_variant_id" TEXT,
ADD COLUMN IF NOT EXISTS "shopify_synced_at" TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS "poshmarkUrl" TEXT,
ADD COLUMN IF NOT EXISTS "depopUrl" TEXT;

-- Add index for faster Shopify product lookups
CREATE INDEX IF NOT EXISTS idx_item_shopify_product_id ON "Item"("shopify_product_id");

-- Add comments for documentation
COMMENT ON COLUMN "Item"."shopify_product_id" IS 'Shopify product ID for synced items';
COMMENT ON COLUMN "Item"."shopify_variant_id" IS 'Shopify variant ID for synced items';
COMMENT ON COLUMN "Item"."shopify_synced_at" IS 'Timestamp when item was last synced to Shopify';
COMMENT ON COLUMN "Item"."poshmarkUrl" IS 'Poshmark listing URL';
COMMENT ON COLUMN "Item"."depopUrl" IS 'Depop listing URL';

