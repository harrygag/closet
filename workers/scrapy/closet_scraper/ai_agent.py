import os
import json
from typing import Dict, List, Optional
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


class ClothingCompAgent:
    """OpenAI Agent for intelligent clothing comp analysis"""

    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not found in environment")

        self.client = OpenAI(api_key=api_key)
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    def extract_features(self, title: str, description: str, brand: Optional[str] = None) -> Dict:
        """Extract clothing features from listing text using AI"""

        prompt = f"""
        Extract structured features from this clothing listing:

        Title: {title}
        Brand: {brand or 'Unknown'}
        Description: {description[:500] if description else 'N/A'}

        Return a JSON object with these fields:
        - category: clothing category (hoodie, jersey, polo, pants, etc.)
        - brand_clean: normalized brand name
        - size_normalized: normalized size (S, M, L, XL, etc.)
        - color: primary color
        - material: fabric/material type
        - condition_rating: 1-10 scale
        - style_tags: list of style descriptors
        - gender: men, women, or unisex

        Return ONLY valid JSON, no other text.
        """

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a clothing product analyzer. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )

            return json.loads(response.choices[0].message.content)

        except Exception as e:
            print(f"AI feature extraction error: {e}")
            return {}

    def calculate_similarity(self, query_features: Dict, listing_features: Dict) -> float:
        """Calculate similarity score between query and listing using AI"""

        prompt = f"""
        Compare these two clothing items and return a similarity score from 0.0 to 1.0:

        Query Item: {json.dumps(query_features)}
        Listing Item: {json.dumps(listing_features)}

        Consider:
        - Category match (highest weight)
        - Brand match
        - Size similarity
        - Color/style similarity
        - Condition proximity

        Return a JSON object with:
        - similarity_score: float 0.0-1.0
        - reasoning: brief explanation

        Return ONLY valid JSON.
        """

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a clothing similarity analyzer. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            return result.get('similarity_score', 0.0)

        except Exception as e:
            print(f"AI similarity calculation error: {e}")
            return 0.0

    def generate_search_query(self, item_features: Dict) -> List[str]:
        """Generate optimized search queries for different marketplaces"""

        prompt = f"""
        Generate 3 optimized search queries for finding comparable sold listings for this item:

        Item: {json.dumps(item_features)}

        Generate queries that will find similar items that have sold. Include:
        - Brand and category
        - Size if relevant
        - Key style descriptors

        Return a JSON object with:
        - queries: array of 3 search query strings

        Return ONLY valid JSON.
        """

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a marketplace search query optimizer. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            return result.get('queries', [])

        except Exception as e:
            print(f"AI query generation error: {e}")
            return []
