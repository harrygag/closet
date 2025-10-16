#!/usr/bin/env python3
"""
Runner script for clothing comp spiders
Usage:
    python run_spider.py --spider ebay --query "Nike Hoodie Size L"
    python run_spider.py --spider all --item-id abc123
"""

import argparse
import json
import subprocess
from pathlib import Path


def run_spider(spider_name, query=None, item_features=None):
    """Run a specific spider with given parameters"""

    cmd = ["scrapy", "crawl", spider_name]

    if query:
        cmd.extend(["-a", f"query={query}"])

    if item_features:
        # Pass item features as JSON string
        features_json = json.dumps(item_features)
        cmd.extend(["-a", f"item_features={features_json}"])

    print(f"Running spider: {spider_name}")
    print(f"Query: {query}")
    print(f"Features: {item_features}")

    subprocess.run(cmd, cwd=Path(__file__).parent)


def main():
    parser = argparse.ArgumentParser(description="Run clothing comp spiders")
    parser.add_argument(
        "--spider",
        choices=["ebay", "poshmark", "mercari", "all"],
        required=True,
        help="Spider to run"
    )
    parser.add_argument(
        "--query",
        help="Search query string"
    )
    parser.add_argument(
        "--features",
        help="JSON string of item features for AI matching"
    )

    args = parser.parse_args()

    # Parse features if provided
    item_features = None
    if args.features:
        try:
            item_features = json.loads(args.features)
        except json.JSONDecodeError:
            print("Error: Invalid JSON in --features")
            return

    # Run spider(s)
    if args.spider == "all":
        spiders = ["ebay", "poshmark", "mercari"]
        for spider in spiders:
            run_spider(spider, args.query, item_features)
    else:
        run_spider(args.spider, args.query, item_features)


if __name__ == "__main__":
    main()
