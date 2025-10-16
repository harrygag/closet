import scrapy
from datetime import datetime
from urllib.parse import urlencode
from closet_scraper.items import ClothingCompItem
from closet_scraper.ai_agent import ClothingCompAgent


class MercariSpider(scrapy.Spider):
    name = "mercari"
    allowed_domains = ["mercari.com"]

    def __init__(self, query=None, item_features=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.query = query
        self.item_features = item_features or {}
        self.ai_agent = ClothingCompAgent()

        if self.item_features:
            self.search_queries = self.ai_agent.generate_search_query(self.item_features)
        else:
            self.search_queries = [query] if query else []

    def start_requests(self):
        """Generate initial requests for sold listings"""
        for search_query in self.search_queries:
            params = {
                'keyword': search_query,
                'status': 'sold_out',
                'sort': 'created_time',
                'order': 'desc'
            }

            url = f"https://www.mercari.com/search/?{urlencode(params)}"

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
        """Parse Mercari search results"""
        page = response.meta['playwright_page']
        search_query = response.meta['search_query']

        try:
            # Wait for items to load
            await page.wait_for_selector('[data-testid="SearchResults"]', timeout=5000)

            # Extract listings
            listings = response.css('[data-testid="SearchResults"] > div')

            for listing in listings[:20]:
                try:
                    title = listing.css('span[data-testid="ItemName"]::text').get()
                    price_text = listing.css('span[data-testid="ItemPrice"]::text').get()
                    url = listing.css('a::attr(href)').get()
                    image_url = listing.css('img::attr(src)').get()

                    if not title or not price_text or not url:
                        continue

                    # Clean price
                    price = float(price_text.replace('$', '').replace(',', '').strip())

                    # Build full URL
                    full_url = f"https://www.mercari.com{url}" if url.startswith('/') else url

                    # Mercari shipping varies - estimate
                    shipping_cost = 0.0  # Often free or included

                    item = ClothingCompItem(
                        source_marketplace='mercari',
                        listing_id=url.split('/')[-1] if url else None,
                        url=full_url,
                        title=title,
                        price=price,
                        shipping_cost=shipping_cost,
                        image_urls=[image_url] if image_url else [],
                        scraped_at=datetime.utcnow().isoformat()
                    )

                    # AI processing
                    if title:
                        ai_features = self.ai_agent.extract_features(
                            title=title,
                            description="",
                            brand=None
                        )
                        item['ai_features'] = ai_features

                        if self.item_features:
                            similarity = self.ai_agent.calculate_similarity(
                                self.item_features,
                                ai_features
                            )
                            item['similarity_score'] = similarity

                            if similarity > 0.5:
                                yield item
                        else:
                            item['similarity_score'] = 1.0
                            yield item

                except Exception as e:
                    self.logger.error(f"Error parsing Mercari listing: {e}")
                    continue

        except Exception as e:
            self.logger.error(f"Error loading Mercari results: {e}")
        finally:
            await page.close()
