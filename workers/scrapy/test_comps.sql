-- Add test comps for testing the UI
-- Run this AFTER creating the clothing_comps table

INSERT INTO clothing_comps (
    source_marketplace, listing_id, url, title, brand, size, category,
    price, shipping_cost, similarity_score, scraped_at
) VALUES
(
    'ebay',
    'test-1',
    'https://www.ebay.com/itm/123456789',
    'Nike Tech Fleece Hoodie Size L Black',
    'Nike',
    'L',
    'hoodie',
    65.00,
    8.50,
    0.95,
    NOW()
),
(
    'poshmark',
    'test-2',
    'https://poshmark.com/listing/nike-hoodie-123',
    'Nike Sportswear Club Hoodie Large Grey',
    'Nike',
    'L',
    'hoodie',
    42.00,
    7.97,
    0.88,
    NOW()
),
(
    'mercari',
    'test-3',
    'https://www.mercari.com/us/item/m12345678',
    'Nike Dri-FIT Hoodie Mens L Blue',
    'Nike',
    'L',
    'hoodie',
    55.00,
    0.00,
    0.82,
    NOW()
),
(
    'ebay',
    'test-4',
    'https://www.ebay.com/itm/987654321',
    'Nike Air Jordan Hoodie Size Large Red',
    'Nike',
    'L',
    'hoodie',
    78.00,
    10.00,
    0.75,
    NOW()
),
(
    'poshmark',
    'test-5',
    'https://poshmark.com/listing/nike-hoodie-456',
    'Nike Therma Hoodie L Black Pullover',
    'Nike',
    'L',
    'hoodie',
    48.00,
    7.97,
    0.90,
    NOW()
);
