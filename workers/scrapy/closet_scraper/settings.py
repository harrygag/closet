import os
from dotenv import load_dotenv

load_dotenv()

BOT_NAME = "closet_scraper"

SPIDER_MODULES = ["closet_scraper.spiders"]
NEWSPIDER_MODULE = "closet_scraper.spiders"

# Obey robots.txt rules
ROBOTSTXT_OBEY = True

# Configure maximum concurrent requests
CONCURRENT_REQUESTS = int(os.getenv("CONCURRENT_REQUESTS", 8))

# Configure a delay for requests for the same website
DOWNLOAD_DELAY = int(os.getenv("DOWNLOAD_DELAY", 1))

# Enable Playwright for dynamic content
DOWNLOAD_HANDLERS = {
    "http": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
    "https": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
}

PLAYWRIGHT_BROWSER_TYPE = "chromium"
PLAYWRIGHT_LAUNCH_OPTIONS = {
    "headless": True,
}

# Enable AutoThrottle
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 1
AUTOTHROTTLE_MAX_DELAY = 10
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0

# Item pipelines
ITEM_PIPELINES = {
    "closet_scraper.pipelines.SupabasePipeline": 300,
}

# Set log level
LOG_LEVEL = os.getenv("SCRAPY_LOG_LEVEL", "INFO")

# User agent
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
