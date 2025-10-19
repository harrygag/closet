#!/usr/bin/env python3
"""
Add test clothing comps to Supabase for testing the embedding pipeline
This simulates what the Scrapy spiders will do
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_CLIENT_SERVICE_KEY")
supabase: Client = create_client(url, key)

# Test comps (simulating scraped data)
test_comps = [
    {
        "source_marketplace": "ebay",
        "listing_id": "test-001",
        "url": "https://ebay.com/itm/123",
        "title": "Nike Air Force 1 Low White Size 10",
        "brand": "Nike",
        "size": "10",
        "category": "Sneakers",
        "condition": "Used - Good",
        "price": 85.00,
        "shipping_cost": 12.00,
        "image_urls": ["https://i.ebayimg.com/images/g/test1.jpg"]
    },
    {
        "source_marketplace": "poshmark",
        "listing_id": "test-002",
        "url": "https://poshmark.com/listing/456",
        "title": "Nike Air Force 1 Classic White Mens 10",
        "brand": "Nike",
        "size": "10",
        "category": "Sneakers",
        "condition": "Pre-owned",
        "price": 90.00,
        "shipping_cost": 7.97,
        "image_urls": ["https://di2ponv0v5otw.cloudfront.net/test2.jpg"]
    },
    {
        "source_marketplace": "ebay",
        "listing_id": "test-003",
        "url": "https://ebay.com/itm/789",
        "title": "Adidas Superstar White Black Stripes Size 10",
        "brand": "Adidas",
        "size": "10",
        "category": "Sneakers",
        "condition": "New with box",
        "price": 110.00,
        "shipping_cost": 0,
        "image_urls": ["https://i.ebayimg.com/images/g/test3.jpg"]
    },
    {
        "source_marketplace": "mercari",
        "listing_id": "test-004",
        "url": "https://mercari.com/us/item/xyz",
        "title": "Champion Reverse Weave Hoodie Navy Blue XL",
        "brand": "Champion",
        "size": "XL",
        "category": "Hoodie",
        "condition": "Like new",
        "price": 45.00,
        "shipping_cost": 0,
        "image_urls": ["https://mercari-images.global.ssl.fastly.net/test4.jpg"]
    },
    {
        "source_marketplace": "poshmark",
        "listing_id": "test-005",
        "url": "https://poshmark.com/listing/abc",
        "title": "Champion Hoodie Reverse Weave Navy Size XL",
        "brand": "Champion",
        "size": "XL",
        "category": "Hoodie",
        "condition": "Gently used",
        "price": 42.00,
        "shipping_cost": 7.97,
        "image_urls": ["https://di2ponv0v5otw.cloudfront.net/test5.jpg"]
    },
    {
        "source_marketplace": "ebay",
        "listing_id": "test-006",
        "url": "https://ebay.com/itm/jordan1",
        "title": "Air Jordan 1 Retro High OG Chicago Size 10.5",
        "brand": "Nike",
        "size": "10.5",
        "category": "Sneakers",
        "condition": "Used - Very Good",
        "price": 425.00,
        "shipping_cost": 15.00,
        "image_urls": ["https://i.ebayimg.com/images/g/jordan1.jpg"]
    },
    {
        "source_marketplace": "poshmark",
        "listing_id": "test-007",
        "url": "https://poshmark.com/listing/supreme-box",
        "title": "Supreme Box Logo Hoodie Black Size L",
        "brand": "Supreme",
        "size": "L",
        "category": "Hoodie",
        "condition": "Pre-owned",
        "price": 850.00,
        "shipping_cost": 7.97,
        "image_urls": ["https://di2ponv0v5otw.cloudfront.net/supreme.jpg"]
    },
    {
        "source_marketplace": "mercari",
        "listing_id": "test-008",
        "url": "https://mercari.com/us/item/yeezy",
        "title": "Adidas Yeezy Boost 350 V2 Zebra Size 11",
        "brand": "Adidas",
        "size": "11",
        "category": "Sneakers",
        "condition": "New without box",
        "price": 280.00,
        "shipping_cost": 0,
        "image_urls": ["https://mercari-images.global.ssl.fastly.net/yeezy.jpg"]
    }
]

def add_test_comps():
    print("🧪 Adding test comps to Supabase...\n")

    for i, comp in enumerate(test_comps, 1):
        try:
            print(f"[{i}/{len(test_comps)}] Adding: {comp['title']}")

            result = supabase.table('clothing_comps').insert(comp).execute()

            if result.data:
                print(f"  ✅ Success - ID: {result.data[0]['id']}")
            else:
                print(f"  ❌ Failed - No data returned")

        except Exception as e:
            print(f"  ❌ Error: {str(e)}")

    print("\n✅ Test comps added!")
    print("\nNext steps:")
    print("  1. Run: npx tsx workers/scrapy/test-embedding-pipeline.ts")
    print("  2. This will generate embeddings for all comps")
    print("  3. Then test RAG search in ItemForm")

if __name__ == "__main__":
    add_test_comps()
