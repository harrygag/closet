-- Fix item tags based on category for user f9e6fd3e-01cb-4305-8f1a-71e18e452ba4

-- Update Hoodies
UPDATE "Item"
SET "normalizedTags" = ARRAY['Hoodies']
WHERE user_uuid = 'f9e6fd3e-01cb-4305-8f1a-71e18e452ba4'
AND (category ILIKE '%hoodie%' OR category ILIKE '%sweatshirt%' OR title ILIKE '%hoodie%' OR title ILIKE '%sweatshirt%');

-- Update Jerseys
UPDATE "Item"
SET "normalizedTags" = ARRAY['Jerseys']
WHERE user_uuid = 'f9e6fd3e-01cb-4305-8f1a-71e18e452ba4'
AND (category ILIKE '%jersey%' OR title ILIKE '%jersey%');

-- Update Polos
UPDATE "Item"
SET "normalizedTags" = ARRAY['Polos']
WHERE user_uuid = 'f9e6fd3e-01cb-4305-8f1a-71e18e452ba4'
AND (category ILIKE '%polo%' OR title ILIKE '%polo%');

-- Update Pullovers & Jackets
UPDATE "Item"
SET "normalizedTags" = ARRAY['Pullovers & Jackets']
WHERE user_uuid = 'f9e6fd3e-01cb-4305-8f1a-71e18e452ba4'
AND (category ILIKE '%pullover%' OR category ILIKE '%jacket%' OR category ILIKE '%coat%' OR category ILIKE '%windbreaker%'
     OR title ILIKE '%pullover%' OR title ILIKE '%jacket%' OR title ILIKE '%coat%' OR title ILIKE '%windbreaker%');

-- Update T-Shirts
UPDATE "Item"
SET "normalizedTags" = ARRAY['T-Shirts']
WHERE user_uuid = 'f9e6fd3e-01cb-4305-8f1a-71e18e452ba4'
AND (category ILIKE '%shirt%' OR category ILIKE '%tee%' OR category ILIKE '%t-shirt%'
     OR title ILIKE '%shirt%' OR title ILIKE '%tee%' OR title ILIKE '%t-shirt%')
AND "normalizedTags" = ARRAY[]::text[]; -- Only update if not already categorized

-- Update Bottoms (pants, shorts, etc.)
UPDATE "Item"
SET "normalizedTags" = ARRAY['Bottoms']
WHERE user_uuid = 'f9e6fd3e-01cb-4305-8f1a-71e18e452ba4'
AND (category ILIKE '%pant%' OR category ILIKE '%short%' OR category ILIKE '%jean%' OR category ILIKE '%trouser%'
     OR title ILIKE '%pant%' OR title ILIKE '%short%' OR title ILIKE '%jean%' OR title ILIKE '%trouser%')
AND "normalizedTags" = ARRAY[]::text[];

-- For any remaining uncategorized items, default to T-Shirts
UPDATE "Item"
SET "normalizedTags" = ARRAY['T-Shirts']
WHERE user_uuid = 'f9e6fd3e-01cb-4305-8f1a-71e18e452ba4'
AND "normalizedTags" = ARRAY[]::text[];

