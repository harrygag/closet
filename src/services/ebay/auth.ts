import type { EbayConnection } from '../../types/ebay';

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

export async function initiateEbayConnection(userId: string): Promise<string> {
  const data = await jsonRequest<{ url: string; sessionId: string }>('/api/ebay/oauth-url', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });

  return data.url;
}

export async function checkEbayConnection(userId: string): Promise<EbayConnection> {
  const data = await jsonRequest<EbayConnection>('/api/ebay/check-connection', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });

  return data;
}

export async function disconnectEbay(userId: string): Promise<void> {
  await jsonRequest('/api/ebay/disconnect', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

