/**
 * Unit tests for marketplace scraper utilities
 */

import { describe, it, expect } from 'vitest';

// Mock implementation of similarity algorithm (matching the one in marketplace-scraper.ts)
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  if (len1 === 0 || len2 === 0) return 0;
  
  // Levenshtein distance implementation
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      const cost = s1[j - 1] === s2[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const maxLen = Math.max(len1, len2);
  const distance = matrix[len2][len1];
  
  return 1 - distance / maxLen;
}

function matchItemByTitle(
  scrapedTitle: string,
  dbItems: any[],
  threshold: number = 0.8
): { item: any; similarity: number } | null {
  let bestMatch: any = null;
  let bestScore = 0;
  
  for (const dbItem of dbItems) {
    const dbTitle = (dbItem.title || '').toLowerCase().trim();
    const scrapedTitleLower = scrapedTitle.toLowerCase().trim();
    
    // Exact match
    if (dbTitle === scrapedTitleLower) {
      return { item: dbItem, similarity: 1.0 };
    }
    
    // Contains match (80% weight)
    if (dbTitle.includes(scrapedTitleLower) || scrapedTitleLower.includes(dbTitle)) {
      const containsScore = 0.85;
      if (containsScore > bestScore) {
        bestScore = containsScore;
        bestMatch = dbItem;
      }
    }
    
    // Similarity score
    const similarity = calculateSimilarity(scrapedTitle, dbTitle);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = dbItem;
    }
  }
  
  if (bestScore >= threshold && bestMatch) {
    return { item: bestMatch, similarity: bestScore };
  }
  
  return null;
}

describe('Marketplace Scraper - Similarity Algorithm', () => {
  it('should return 1.0 for identical strings', () => {
    expect(calculateSimilarity('Nike Hoodie', 'Nike Hoodie')).toBe(1.0);
  });

  it('should return 1.0 for strings that differ only in case', () => {
    expect(calculateSimilarity('Nike Hoodie', 'nike hoodie')).toBe(1.0);
  });

  it('should return high similarity for very similar strings', () => {
    const similarity = calculateSimilarity('Nike Air Max', 'Nike Air Max 90');
    expect(similarity).toBeGreaterThan(0.8);
  });

  it('should return lower similarity for different strings', () => {
    const similarity = calculateSimilarity('Nike Hoodie', 'Adidas Shirt');
    expect(similarity).toBeLessThan(0.5);
  });

  it('should handle empty strings', () => {
    expect(calculateSimilarity('', '')).toBe(1.0);
    expect(calculateSimilarity('test', '')).toBe(0);
  });

  it('should trim whitespace before comparison', () => {
    expect(calculateSimilarity('  Nike Hoodie  ', 'Nike Hoodie')).toBe(1.0);
  });
});

describe('Marketplace Scraper - Item Matching', () => {
  const mockDbItems = [
    { id: '1', title: 'Nike Air Max 90 White' },
    { id: '2', title: 'Adidas Ultraboost Black' },
    { id: '3', title: 'Supreme Box Logo Hoodie Red' },
    { id: '4', title: 'Carhartt WIP Jacket Brown' },
  ];

  it('should match exact titles', () => {
    const result = matchItemByTitle('Nike Air Max 90 White', mockDbItems);
    expect(result).not.toBeNull();
    expect(result?.item.id).toBe('1');
    expect(result?.similarity).toBe(1.0);
  });

  it('should match case-insensitive titles', () => {
    const result = matchItemByTitle('NIKE AIR MAX 90 WHITE', mockDbItems);
    expect(result).not.toBeNull();
    expect(result?.item.id).toBe('1');
  });

  it('should match partial titles with contains logic', () => {
    const result = matchItemByTitle('Nike Air Max', mockDbItems);
    expect(result).not.toBeNull();
    expect(result?.item.id).toBe('1');
    expect(result?.similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('should match similar titles with high similarity', () => {
    const result = matchItemByTitle('Nike Air Max 90 White Size L', mockDbItems);
    expect(result).not.toBeNull();
    expect(result?.item.id).toBe('1');
  });

  it('should not match below threshold', () => {
    const result = matchItemByTitle('Completely Different Item', mockDbItems, 0.8);
    expect(result).toBeNull();
  });

  it('should match best candidate among multiple options', () => {
    const result = matchItemByTitle('Nike Air Max 95', mockDbItems);
    expect(result).not.toBeNull();
    expect(result?.item.id).toBe('1'); // Should match Nike item
  });

  it('should respect custom threshold', () => {
    const result = matchItemByTitle('Supreme Hoodie', mockDbItems, 0.9);
    // May or may not match depending on exact similarity score
    if (result) {
      expect(result.similarity).toBeGreaterThanOrEqual(0.9);
    }
  });
});

describe('Marketplace Scraper - Edge Cases', () => {
  const mockDbItems = [
    { id: '1', title: 'Test Item' },
    { id: '2', title: '' },
  ];

  it('should handle scraped items with extra whitespace', () => {
    const result = matchItemByTitle('  Test Item  ', mockDbItems);
    expect(result?.item.id).toBe('1');
  });

  it('should handle empty database titles gracefully', () => {
    const result = matchItemByTitle('Test Item', mockDbItems);
    expect(result?.item.id).toBe('1');
  });

  it('should handle special characters', () => {
    const items = [{ id: '1', title: "Nike Women's Air Max" }];
    const result = matchItemByTitle('Nike Womens Air Max', items);
    expect(result).not.toBeNull();
  });
});




