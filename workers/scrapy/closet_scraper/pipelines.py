import os
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()


class SupabasePipeline:
    """Pipeline to save scraped items to Supabase"""

    def __init__(self):
        self.supabase: Client = None

    def open_spider(self, spider):
        """Initialize Supabase client when spider opens"""
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not supabase_url or not supabase_key:
            spider.logger.error("Supabase credentials not found in environment")
            raise ValueError("Missing Supabase credentials")

        self.supabase = create_client(supabase_url, supabase_key)
        spider.logger.info("Supabase pipeline initialized")

    def close_spider(self, spider):
        """Cleanup when spider closes"""
        spider.logger.info("Supabase pipeline closed")

    def process_item(self, item, spider):
        """Save item to Supabase clothing_comps table"""
        try:
            # Convert item to dict
            item_dict = dict(item)

            # Add timestamp if not present
            if 'scraped_at' not in item_dict:
                item_dict['scraped_at'] = datetime.utcnow().isoformat()

            # Insert into Supabase
            result = self.supabase.table('clothing_comps').insert(item_dict).execute()

            spider.logger.info(f"Saved comp: {item_dict['title']} - ${item_dict['price']}")

            return item

        except Exception as e:
            spider.logger.error(f"Error saving to Supabase: {e}")
            # Don't drop item on error, just log it
            return item
