#!/usr/bin/env python3
"""Add test comps to Supabase to test the UI"""

import os
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("ERROR: Missing Supabase credentials in .env")
    exit(1)

supabase = create_client(supabase_url, supabase_key)

# Test comps data
test_comps = [
    {
        "source_marketplace": "ebay",
        "listing_id": "test-1",
        "url": "https://www.ebay.com/itm/123456789",
        "title": "Nike Tech Fleece Hoodie Size L Black",
        "brand": "Nike",
        "size": "L",
        "category": "hoodie",
        "price": 65.00,
        "shipping_cost": 8.50,
        "image_urls": ["https://i.ebayimg.com/images/g/abc123/s-l500.jpg"],
        "similarity_score": 0.95,
        "scraped_at": datetime.utcnow().isoformat()
    },
    {
        "source_marketplace": "poshmark",
        "listing_id": "test-2",
        "url": "https://poshmark.com/listing/nike-hoodie-123",
        "title": "Nike Sportswear Club Hoodie Large Grey",
        "brand": "Nike",
        "size": "L",
        "category": "hoodie",
        "price": 42.00,
        "shipping_cost": 7.97,
        "image_urls": [],
        "similarity_score": 0.88,
        "scraped_at": datetime.utcnow().isoformat()
    },
    {
        "source_marketplace": "mercari",
        "listing_id": "test-3",
        "url": "https://www.mercari.com/us/item/m12345678",
        "title": "Nike Dri-FIT Hoodie Men's L Blue",
        "brand": "Nike",
        "size": "L",
        "category": "hoodie",
        "price": 55.00,
        "shipping_cost": 0.00,
        "image_urls": [],
        "similarity_score": 0.82,
        "scraped_at": datetime.utcnow().isoformat()
    },
    {
        "source_marketplace": "ebay",
        "listing_id": "test-4",
        "url": "https://www.ebay.com/itm/987654321",
        "title": "Nike Air Jordan Hoodie Size Large Red",
        "brand": "Nike",
        "size": "L",
        "category": "hoodie",
        "price": 78.00,
        "shipping_cost": 10.00,
        "image_urls": [],
        "similarity_score": 0.75,
        "scraped_at": datetime.utcnow().isoformat()
    },
    {
        "source_marketplace": "poshmark",
        "listing_id": "test-5",
        "url": "https://poshmark.com/listing/nike-hoodie-456",
        "title": "Nike Therma Hoodie L Black Pullover",
        "brand": "Nike",
        "size": "L",
        "category": "hoodie",
        "price": 48.00,
        "shipping_cost": 7.97,
        "image_urls": [],
        "similarity_score": 0.90,
        "scraped_at": datetime.utcnow().isoformat()
    }
]

try:
    print("Adding test comps to Supabase...")
    result = supabase.table('clothing_comps').insert(test_comps).execute()
    print(f"✓ Added {len(test_comps)} test comps successfully!")
    print("\nNow try:")
    print("1. Open your app")
    print("2. Click + to add new item")
    print("3. Enter: Name='Nike Hoodie', Size='L', Tag='Hoodie'")
    print("4. Click 'Find Comparable Sales'")
    print("5. You should see the test comps!")
except Exception as e:
    print(f"✗ Error: {e}")
