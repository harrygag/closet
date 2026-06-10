/**
 * Depop Sales CSV Parser
 *
 * Parses CSV exports from Depop's "Sales" page into structured records.
 * Handles:
 *   - Dollar amounts ("$24.99" → 2499 cents, "N/A" → 0, '=""–""' → 0)
 *   - RFC-4180 quoted fields (fields may contain commas and newlines)
 *   - Date + time parsing into ISO strings
 *   - Bundle continuation rows (fields set to '=""-""')
 *   - Refund detection
 */

import type { PlatformInventory } from '../inventory/mismatchDetector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepopSaleRecord {
  saleDate: string;           // ISO date from "Date of sale" + "Time of sale"
  listingDate: string;        // ISO date from "Date of listing"
  isBundle: boolean;          // from "Bundle"
  bundleItemCount: number;    // from "Bundle - amount of items" (0 when N/A)
  buyerUsername: string;      // from "Buyer"
  brand: string;
  description: string;
  size: string;
  itemPriceCents: number;     // "$24.99" → 2499
  buyerShippingCents: number; // "Buyer shipping cost"
  totalCents: number;
  uspsCostCents: number;
  depopFeeCents: number;
  paymentFeeCents: number;    // "Depop Payments fee"
  buyerFeeCents: number;      // "Buyer Marketplace Fee"
  boostingFeeCents: number;
  paymentType: string;
  category: string;
  usSalesTaxCents: number;
  isRefunded: boolean;
  refundAmountCents: number;
  feesRefundedCents: number;
}

// ---------------------------------------------------------------------------
// CSV Parsing  (RFC-4180 compliant, no npm packages)
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string into an array of string arrays.
 * Handles quoted fields containing commas, newlines, and escaped quotes ("").
 */
function parseCSVRows(raw: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: doubled quote → literal quote
        if (i + 1 < raw.length && raw[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        currentRow.push(field);
        field = '';
        i++;
      } else if (ch === '\r') {
        // Skip \r; handle \n next
        i++;
      } else if (ch === '\n') {
        currentRow.push(field);
        field = '';
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Flush the last field / row
  currentRow.push(field);
  if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Value Helpers
// ---------------------------------------------------------------------------

/** Detect the Depop "empty" sentinel: =""–"" or =""-"" or literal dash */
function isSentinel(val: string): boolean {
  const v = val.trim();
  return v === '=""-""' || v === '=""–""' || v === '-' || v === '$-';
}

/**
 * Parse a dollar string like "$24.99" into cents (2499).
 * Returns 0 for "N/A", empty, sentinel, or unparseable values.
 */
function parseDollarsToCents(raw: string): number {
  const v = raw.trim();
  if (!v || v === 'N/A' || isSentinel(v)) return 0;

  // Strip dollar sign, commas, whitespace
  const cleaned = v.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Parse "MM/DD/YYYY" + "H:MM AM/PM" into an ISO string.
 * If the time is empty / N/A, returns midnight.
 */
function parseDateTime(dateStr: string, timeStr: string): string {
  const d = dateStr.trim();
  if (!d || d === 'N/A') return '';

  // Parse "02/10/2026"
  const parts = d.split('/');
  if (parts.length !== 3) return '';
  const [month, day, year] = parts.map(Number);

  let hours = 0;
  let minutes = 0;

  const t = timeStr.trim();
  if (t && t !== 'N/A' && !isSentinel(t)) {
    // "8:07 PM" → [8, 07, PM]
    const timeMatch = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
      const meridiem = timeMatch[3].toUpperCase();
      if (meridiem === 'PM' && hours !== 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
    }
  }

  const dt = new Date(year, month - 1, day, hours, minutes);
  return dt.toISOString();
}

/**
 * Parse "MM/DD/YYYY" into an ISO date-only string.
 */
function parseDateOnly(dateStr: string): string {
  const d = dateStr.trim();
  if (!d || d === 'N/A' || isSentinel(d)) return '';

  const parts = d.split('/');
  if (parts.length !== 3) return '';
  const [month, day, year] = parts.map(Number);
  const dt = new Date(year, month - 1, day);
  return dt.toISOString();
}

function parseIntSafe(raw: string): number {
  const v = raw.trim();
  if (!v || v === 'N/A' || isSentinel(v)) return 0;
  const num = parseInt(v, 10);
  return isNaN(num) ? 0 : num;
}

// ---------------------------------------------------------------------------
// Main Parser
// ---------------------------------------------------------------------------

/**
 * Column names expected in the CSV header row (case-insensitive match).
 * Order doesn't matter — we build a map from the header.
 */
const EXPECTED_COLUMNS = [
  'Date of sale',
  'Time of sale',
  'Date of listing',
  'Bundle',
  'Bundle - amount of items',
  'Buyer',
  'Brand',
  'Description',
  'Size',
  'Item price',
  'Buyer shipping cost',
  'Total',
  'USPS Cost',
  'Depop fee',
  'Depop Payments fee',
  'Buyer Marketplace Fee',
  'Boosting fee',
  'Payment type',
  'Estimated payout date',
  'Payout arrival date',
  'Category',
  'Name',
  'Address Line 1',
  'Address Line 2',
  'City',
  'State',
  'Post Code',
  'Country',
  'US Sales tax',
  'Refunded to buyer amount',
  'Fees refunded to seller',
] as const;

type ColumnName = (typeof EXPECTED_COLUMNS)[number];

/**
 * Parse raw Depop Sales CSV text into structured records.
 */
export function parseDepopSalesCSV(csvData: string): DepopSaleRecord[] {
  const rows = parseCSVRows(csvData);
  if (rows.length < 2) return [];

  // Build column index from header
  const headerRow = rows[0];
  const colIndex: Partial<Record<ColumnName, number>> = {};

  for (let i = 0; i < headerRow.length; i++) {
    const normalized = headerRow[i].trim();
    for (const expected of EXPECTED_COLUMNS) {
      if (normalized.toLowerCase() === expected.toLowerCase()) {
        colIndex[expected] = i;
        break;
      }
    }
  }

  const col = (row: string[], name: ColumnName): string => {
    const idx = colIndex[name];
    if (idx === undefined || idx >= row.length) return '';
    return row[idx];
  };

  const records: DepopSaleRecord[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length < 5) continue; // skip malformed rows

    const refundRaw = col(row, 'Refunded to buyer amount');
    const refundCents = parseDollarsToCents(refundRaw);
    const isRefunded = refundCents > 0;

    const feesRefundedRaw = col(row, 'Fees refunded to seller');
    const feesRefundedCents = parseDollarsToCents(feesRefundedRaw);

    records.push({
      saleDate: parseDateTime(col(row, 'Date of sale'), col(row, 'Time of sale')),
      listingDate: parseDateOnly(col(row, 'Date of listing')),
      isBundle: col(row, 'Bundle').trim().toLowerCase() === 'yes',
      bundleItemCount: parseIntSafe(col(row, 'Bundle - amount of items')),
      buyerUsername: col(row, 'Buyer').trim(),
      brand: col(row, 'Brand').trim(),
      description: col(row, 'Description').trim(),
      size: col(row, 'Size').trim(),
      itemPriceCents: parseDollarsToCents(col(row, 'Item price')),
      buyerShippingCents: parseDollarsToCents(col(row, 'Buyer shipping cost')),
      totalCents: parseDollarsToCents(col(row, 'Total')),
      uspsCostCents: parseDollarsToCents(col(row, 'USPS Cost')),
      depopFeeCents: parseDollarsToCents(col(row, 'Depop fee')),
      paymentFeeCents: parseDollarsToCents(col(row, 'Depop Payments fee')),
      buyerFeeCents: parseDollarsToCents(col(row, 'Buyer Marketplace Fee')),
      boostingFeeCents: parseDollarsToCents(col(row, 'Boosting fee')),
      paymentType: col(row, 'Payment type').trim(),
      category: col(row, 'Category').trim(),
      usSalesTaxCents: parseDollarsToCents(col(row, 'US Sales tax')),
      isRefunded,
      refundAmountCents: refundCents,
      feesRefundedCents,
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

export interface DepopSalesSummary {
  totalSales: number;         // number of sale records
  uniqueBuyers: number;
  totalRevenueCents: number;  // sum of "Total" (what buyer paid)
  totalItemPriceCents: number;
  totalDepopFeesCents: number;
  totalPaymentFeesCents: number;
  totalBuyerFeesCents: number;
  totalBoostingFeesCents: number;
  totalRefundedCents: number;
  totalFeesRefundedCents: number;
  netRevenueCents: number;    // revenue minus all fees minus refunds + fees refunded
}

export function summarizeDepopSales(records: DepopSaleRecord[]): DepopSalesSummary {
  const buyers = new Set<string>();
  let totalRevenueCents = 0;
  let totalItemPriceCents = 0;
  let totalDepopFeesCents = 0;
  let totalPaymentFeesCents = 0;
  let totalBuyerFeesCents = 0;
  let totalBoostingFeesCents = 0;
  let totalRefundedCents = 0;
  let totalFeesRefundedCents = 0;

  for (const r of records) {
    if (r.buyerUsername) buyers.add(r.buyerUsername);
    totalRevenueCents += r.totalCents;
    totalItemPriceCents += r.itemPriceCents;
    totalDepopFeesCents += r.depopFeeCents;
    totalPaymentFeesCents += r.paymentFeeCents;
    totalBuyerFeesCents += r.buyerFeeCents;
    totalBoostingFeesCents += r.boostingFeeCents;
    totalRefundedCents += r.refundAmountCents;
    totalFeesRefundedCents += r.feesRefundedCents;
  }

  const totalAllFees =
    totalDepopFeesCents + totalPaymentFeesCents + totalBuyerFeesCents + totalBoostingFeesCents;
  const netRevenueCents =
    totalRevenueCents - totalAllFees - totalRefundedCents + totalFeesRefundedCents;

  return {
    totalSales: records.length,
    uniqueBuyers: buyers.size,
    totalRevenueCents,
    totalItemPriceCents,
    totalDepopFeesCents,
    totalPaymentFeesCents,
    totalBuyerFeesCents,
    totalBoostingFeesCents,
    totalRefundedCents,
    totalFeesRefundedCents,
    netRevenueCents,
  };
}

// ---------------------------------------------------------------------------
// Format cents to display string
// ---------------------------------------------------------------------------

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// PlatformInventory conversion (for mismatch detector)
// ---------------------------------------------------------------------------

/**
 * Convert Depop sales records into PlatformInventory entries.
 * Each sale becomes a sold-status entry keyed by description (since Depop
 * sales CSV has no SKU). The mismatch detector can then fuzzy-match titles.
 */
export function depopSalesToPlatformInventory(
  sales: DepopSaleRecord[]
): PlatformInventory[] {
  return sales
    .filter((s) => s.description) // skip rows without a description
    .map((s) => ({
      sku: s.buyerUsername + '-' + s.saleDate, // unique-ish key per sale
      title: s.description,
      quantity: 0,
      price: s.itemPriceCents / 100,
      status: s.isRefunded ? 'refunded' : 'sold',
    }));
}

// ---------------------------------------------------------------------------
// Fuzzy match helpers for "Match to Inventory"
// ---------------------------------------------------------------------------

/**
 * Simple word-overlap similarity (mirrors mismatchDetector.ts).
 */
function wordOverlapSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
  const wordsA = normalize(a);
  const wordsB = normalize(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  const overlap = wordsA.filter((w) => setB.has(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.length);
}

export interface SaleMatchResult {
  sale: DepopSaleRecord;
  matchedItemId: string | null;
  matchedItemName: string | null;
  confidence: number; // 0-1
}

/**
 * Attempt to match each sale record to a local inventory item by
 * fuzzy-matching the sale description against item names.
 *
 * @param sales  Parsed Depop sales
 * @param items  Local inventory items (from useItemStore)
 * @returns Array of match results with confidence scores
 */
export function matchSalesToInventory(
  sales: DepopSaleRecord[],
  items: Array<{ id: string; name: string; brand?: string; size?: string; status?: string }>
): SaleMatchResult[] {
  return sales.map((sale) => {
    let bestId: string | null = null;
    let bestName: string | null = null;
    let bestScore = 0;

    for (const item of items) {
      // Build a combined search string from item fields
      const itemText = [item.name, item.brand, item.size].filter(Boolean).join(' ');
      const saleText = [sale.description, sale.brand, sale.size].filter(Boolean).join(' ');

      const score = wordOverlapSimilarity(saleText, itemText);
      if (score > bestScore) {
        bestScore = score;
        bestId = item.id;
        bestName = item.name;
      }
    }

    // Only consider a match if confidence is above 0.3
    const threshold = 0.3;
    return {
      sale,
      matchedItemId: bestScore >= threshold ? bestId : null,
      matchedItemName: bestScore >= threshold ? bestName : null,
      confidence: bestScore,
    };
  });
}
