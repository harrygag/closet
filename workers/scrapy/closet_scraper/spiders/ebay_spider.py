import scrapy
from datetime import datetime
from urllib.parse import urlencode, quote_plus
from closet_scraper.items import ClothingCompItem
from closet_scraper.ai_agent import ClothingCompAgent


class EbaySpider(scrapy.Spider):
    name = "ebay"
    allowed_domains = ["ebay.com"]

    def __init__(self, query=None, item_features=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.query = query
        self.item_features = item_features or {}
        self.ai_agent = ClothingCompAgent()

        # Generate optimized queries if we have item features
        if self.item_features:
            self.search_queries = self.ai_agent.generate_search_query(self.item_features)
        else:
            self.search_queries = [query] if query else []

    def start_requests(self):
        """Generate initial requests for sold listings"""
        for search_query in self.search_queries:
            # eBay sold listings search
            params = {
                '_nkw': search_query,
                'LH_Sold': '1',  # Sold listings only
                'LH_Complete': '1',  # Completed listings
                '_sop': '13',  # Sort by newest
            }

            url = f"https://www.ebay.com/sch/i.html?{urlencode(params)}"

            yield scrapy.Request(
                url=url,
                callback=self.parse_search_results,
                meta={
                    'playwright': True,
                    'playwright_include_page': True,
                    'search_query': search_query
                }
            )

    async def parse_search_results(self, response):
        """Parse eBay search results page"""
        page = response.meta['playwright_page']
        search_query = response.meta['search_query']

        try:
            # Extract all listing items
            listings = response.css('.s-item')

            for listing in listings[:20]:  # Limit to top 20 results per query
                try:
                    # Extract basic info
                    title = listing.css('.s-item__title::text').get()
                    price_text = listing.css('.s-item__price::text').get()
                    url = listing.css('.s-item__link::attr(href)').get()
                    image_url = listing.css('.s-item__image-img::attr(src)').get()

                    # Skip if missing essential data
                    if not title or not price_text or not url:
                        continue

                    # Extract price (remove $ and commas)
                    price = float(price_text.replace('$', '').replace(',', '').split()[0])

                    # Extract sold date if available
                    sold_date_text = listing.css('.s-item__title--tag::text').get()
                    sold_date = sold_date_text if sold_date_text else None

                    # Extract shipping cost
                    shipping_text = listing.css('.s-item__shipping::text').get()
                    shipping_cost = 0.0
                    if shipping_text and '$' in shipping_text:
                        try:
                            shipping_cost = float(shipping_text.replace('$', '').replace(',', '').split()[0])
                        except:
                            pass

                    # Create item
                    item = ClothingCompItem(
                        source_marketplace='ebay',
                        listing_id=url.split('/')[-1].split('?')[0] if url else None,
                        url=url,
                        title=title,
                        price=price,
                        shipping_cost=shipping_cost,
                        sold_date=sold_date,
                        image_urls=[image_url] if image_url else [],
                        scraped_at=datetime.utcnow().isoformat()
                    )

                    # Use AI to extract features and calculate similarity
                    if title:
                        ai_features = self.ai_agent.extract_features(
                            title=title,
                            description="",  # eBay search results don't have full description
                            brand=None
                        )
                        item['ai_features'] = ai_features

                        # Calculate similarity if we have item features to compare
                        if self.item_features:
                            similarity = self.ai_agent.calculate_similarity(
                                self.item_features,
                                ai_features
                            )
                            item['similarity_score'] = similarity

                            # Only yield items with similarity > 0.5
                            if similarity > 0.5:
                                yield item
                        else:
                            # No features to compare, yield all results
                            item['similarity_score'] = 1.0
                            yield item

                except Exception as e:
                    self.logger.error(f"Error parsing listing: {e}")
                    continue

        finally:
            await page.close()

    def closed(self, reason):
        """Spider cleanup"""
        self.logger.info(f"eBay spider closed: {reason}")
