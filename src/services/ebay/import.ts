import type { EbayListing, ImportResult } from '../../types/ebay';

// Use local backend server
const API_BASE = import.meta.env.VITE_EBAY_API_BASE || 'http://localhost:3001';

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Request failed');
  }

  return response.json();
}

export async function fetchEbayListings(userId: string): Promise<EbayListing[]> {
  const data = await jsonRequest<{ listings: EbayListing[] }>('/api/ebay/get-listings', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });

  return data.listings;
}

export async function importEbayItems(userId: string, listings: EbayListing[]): Promise<ImportResult> {
  const data = await jsonRequest<ImportResult>('/api/ebay/import-items', {
    method: 'POST',
    body: JSON.stringify({ userId, listings }),
  });

  return data;
}

