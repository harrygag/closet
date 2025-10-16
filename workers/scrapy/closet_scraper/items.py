import scrapy
from typing import Optional


class ClothingCompItem(scrapy.Item):
    """Scraped clothing comparable item"""

    # Identifiers
    source_marketplace = scrapy.Field()  # 'ebay', 'poshmark', etc.
    listing_id = scrapy.Field()
    url = scrapy.Field()

    # Item details
    title = scrapy.Field()
    brand = scrapy.Field()
    size = scrapy.Field()
    condition = scrapy.Field()
    category = scrapy.Field()

    # Pricing
    price = scrapy.Field()  # Sold price
    original_price = scrapy.Field()  # Original listing price (if available)
    shipping_cost = scrapy.Field()

    # Metadata
    sold_date = scrapy.Field()
    image_urls = scrapy.Field()
    description = scrapy.Field()

    # AI-extracted features
    ai_features = scrapy.Field()  # JSON object with AI-extracted attributes
    similarity_score = scrapy.Field()  # How similar to search query (0-1)

    # Timestamps
    scraped_at = scrapy.Field()
