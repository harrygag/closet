/**
 * Gmail API Service
 * Fetches CSV attachments from eBay and Poshmark emails via Gmail API.
 * OAuth tokens stored in gmail_credentials Firestore collection.
 */

import * as admin from 'firebase-admin';

// Types
export interface GmailCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: admin.firestore.Timestamp;
}

export interface CSVAttachment {
  filename: string;
  data: string;
  date: string;
}

export interface InventoryItem {
  sku: string;
  title: string;
  quantity: number;
  price: number;
  status: string;
}

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function getDb() {
  return admin.firestore();
}

// 1. getGmailCredentials
export async function getGmailCredentials(userId: string): Promise<GmailCredentials> {
  const doc = await getDb().collection('gmail_credentials').doc(userId).get();
  if (!doc.exists) {
    throw new Error('No Gmail credentials found. Please connect your Gmail account first.');
  }
  const data = doc.data()!;
  if (!data.accessToken || !data.refreshToken || !data.expiresAt) {
    throw new Error('Gmail credentials are incomplete. Please reconnect your Gmail account.');
  }
  return { accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: data.expiresAt };
}

// 2. refreshGmailToken
export async function refreshGmailToken(userId: string, refreshToken: string): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set.');
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) throw new Error(`Gmail token refresh failed: ${await resp.text()}`);

  const data = await resp.json();
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

  await getDb().collection('gmail_credentials').doc(userId).update({
    accessToken: data.access_token,
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return data.access_token;
}

// Helper: ensure valid token
async function getValidAccessToken(userId: string): Promise<string> {
  const creds = await getGmailCredentials(userId);
  const now = Date.now();
  if (now >= creds.expiresAt.toMillis() - 5 * 60 * 1000) {
    return await refreshGmailToken(userId, creds.refreshToken);
  }
  return creds.accessToken;
}

// 3. fetchCSVFromEmail
export async function fetchCSVFromEmail(accessToken: string, query: string): Promise<CSVAttachment | null> {
  const searchUrl = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=5`;
  const searchResp = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!searchResp.ok) throw new Error(`Gmail search failed: ${await searchResp.text()}`);

  const searchData = await searchResp.json();
  if (!searchData.messages?.length) return null;

  for (const msg of searchData.messages) {
    const msgResp = await fetch(`${GMAIL_API_BASE}/messages/${msg.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgResp.ok) continue;

    const msgData = await msgResp.json();
    const csvPart = findCSVPart(msgData.payload);

    if (csvPart?.body?.attachmentId) {
      const attResp = await fetch(
        `${GMAIL_API_BASE}/messages/${msg.id}/attachments/${csvPart.body.attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!attResp.ok) continue;

      const attData = await attResp.json();
      const csvData = Buffer.from(attData.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
      const messageDate = new Date(parseInt(msgData.internalDate, 10)).toISOString();

      return { filename: csvPart.filename || 'attachment.csv', data: csvData, date: messageDate };
    }
  }
  return null;
}

function findCSVPart(payload: any): any {
  if (!payload) return null;
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.filename?.toLowerCase().endsWith('.csv') && part.body?.attachmentId) return part;
      if (part.parts) {
        for (const nested of part.parts) {
          if (nested.filename?.toLowerCase().endsWith('.csv') && nested.body?.attachmentId) return nested;
        }
      }
    }
  }
  if (payload.filename?.toLowerCase().endsWith('.csv')) return payload;
  return null;
}

// 4. fetchEbayCSV
export async function fetchEbayCSV(userId: string): Promise<CSVAttachment | null> {
  const token = await getValidAccessToken(userId);
  return fetchCSVFromEmail(token, 'from:ebay subject:inventory has:attachment filename:csv newer_than:7d');
}

// 5. fetchPoshmarkCSV
export async function fetchPoshmarkCSV(userId: string): Promise<CSVAttachment | null> {
  const token = await getValidAccessToken(userId);
  return fetchCSVFromEmail(token, 'from:poshmark subject:inventory has:attachment filename:csv newer_than:7d');
}

// 6. parseInventoryCSV
const COLUMN_MAPPINGS: Record<'ebay' | 'poshmark', Record<string, string>> = {
  ebay: {
    'custom label (sku)': 'sku', 'custom label': 'sku', 'sku': 'sku', 'item number': 'sku',
    'title': 'title', 'item title': 'title',
    'available quantity': 'quantity', 'quantity': 'quantity', 'quantity available': 'quantity',
    'current price': 'price', 'price': 'price', 'start price': 'price', 'buy it now price': 'price',
    'listing status': 'status', 'status': 'status', 'state': 'status',
  },
  poshmark: {
    'listing sku': 'sku', 'sku': 'sku',
    'listing title': 'title', 'title': 'title',
    'available quantity': 'quantity', 'quantity': 'quantity',
    'listing price': 'price', 'price': 'price', 'original price': 'price',
    'status': 'status', 'listing status': 'status',
  },
};

export function parseInventoryCSV(csvData: string, platform: 'ebay' | 'poshmark'): InventoryItem[] {
  const lines = csvData.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const mapping = COLUMN_MAPPINGS[platform];
  const colIdx: Record<string, number> = {};

  for (let i = 0; i < headers.length; i++) {
    const field = mapping[headers[i]];
    if (field && !(field in colIdx)) colIdx[field] = i;
  }

  const items: InventoryItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseCSVLine(line);

    const sku = colIdx.sku !== undefined ? (vals[colIdx.sku] || '').trim() : '';
    const title = colIdx.title !== undefined ? (vals[colIdx.title] || '').trim() : '';
    const qty = parseInt((colIdx.quantity !== undefined ? vals[colIdx.quantity] || '0' : '0').replace(/[^0-9]/g, ''), 10) || 0;
    const price = parseFloat((colIdx.price !== undefined ? vals[colIdx.price] || '0' : '0').replace(/[^0-9.]/g, '')) || 0;
    const status = colIdx.status !== undefined ? (vals[colIdx.status] || '').trim() : '';

    if (sku || title) items.push({ sku, title, quantity: qty, price, status });
  }
  return items;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(current); current = ''; }
      else current += ch;
    }
  }
  fields.push(current);
  return fields;
}
