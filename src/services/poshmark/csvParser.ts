/**
 * Poshmark CSV Parser
 * Auto-detects Poshmark "My Sales" report vs "Closet" export based on headers
 */

export interface PoshmarkCsvItem {
  title: string;
  brand: string;
  size: string;
  priceCents: number;
  category: string;
  status: string; // 'Active', 'Sold', 'Not For Sale'
  listedDate?: string;
  orderDate?: string;
  earnings?: number;
}

type CsvFormat = 'sales' | 'closet' | 'unknown';

// Sales report headers (case-insensitive match)
const SALES_HEADERS = [
  'order id',
  'listing title',
  'department',
  'category',
  'subcategory',
  'brand',
  'size',
  'color',
  'listing price',
  'earnings',
  'order date',
  'buyer',
  'seller',
  'status',
];

// Closet export headers (case-insensitive match)
const CLOSET_HEADERS = [
  'title',
  'brand',
  'size',
  'original price',
  'my price',
  'category',
  'status',
  'listed date',
];

/**
 * Parse a single CSV line, respecting quoted fields that may contain commas
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Detect CSV format by examining the header row
 */
function detectFormat(headerRow: string[]): CsvFormat {
  const normalized = headerRow.map((h) => h.toLowerCase().trim().replace(/^["']|["']$/g, ''));

  // Check for sales-specific columns
  const hasSalesMarkers = normalized.some(
    (h) => h === 'order id' || h === 'earnings' || h === 'buyer'
  );
  if (hasSalesMarkers) return 'sales';

  // Check for closet-specific columns
  const hasClosetMarkers = normalized.some(
    (h) => h === 'my price' || h === 'listed date' || h === 'original price'
  );
  if (hasClosetMarkers) return 'closet';

  // Fallback: check overlap with known headers
  const salesOverlap = normalized.filter((h) => SALES_HEADERS.includes(h)).length;
  const closetOverlap = normalized.filter((h) => CLOSET_HEADERS.includes(h)).length;

  if (salesOverlap > closetOverlap && salesOverlap >= 3) return 'sales';
  if (closetOverlap > salesOverlap && closetOverlap >= 3) return 'closet';

  return 'unknown';
}

/**
 * Build a header-index map for column lookups
 */
function buildHeaderMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    map.set(h.toLowerCase().trim().replace(/^["']|["']$/g, ''), i);
  });
  return map;
}

/**
 * Safely extract a field from a row by header name
 */
function getField(row: string[], headerMap: Map<string, number>, ...names: string[]): string {
  for (const name of names) {
    const idx = headerMap.get(name.toLowerCase());
    if (idx !== undefined && idx < row.length) {
      const val = row[idx].replace(/^["']|["']$/g, '').trim();
      if (val) return val;
    }
  }
  return '';
}

/**
 * Parse a dollar string like "$25.00" or "25" into cents
 */
function parseDollarsToCents(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Parse Poshmark "My Sales" row
 */
function parseSalesRow(row: string[], headerMap: Map<string, number>): PoshmarkCsvItem {
  const status = getField(row, headerMap, 'status');

  // In sales reports, everything is a completed sale
  let normalizedStatus = 'Sold';
  if (status.toLowerCase().includes('cancelled') || status.toLowerCase().includes('canceled')) {
    normalizedStatus = 'Not For Sale';
  }

  const earningsRaw = getField(row, headerMap, 'earnings');
  const earningsCents = parseDollarsToCents(earningsRaw);

  return {
    title: getField(row, headerMap, 'listing title'),
    brand: getField(row, headerMap, 'brand'),
    size: getField(row, headerMap, 'size'),
    priceCents: parseDollarsToCents(getField(row, headerMap, 'listing price')),
    category: getField(row, headerMap, 'category'),
    status: normalizedStatus,
    orderDate: getField(row, headerMap, 'order date') || undefined,
    earnings: earningsCents > 0 ? earningsCents : undefined,
  };
}

/**
 * Parse Poshmark "Closet" export row
 */
function parseClosetRow(row: string[], headerMap: Map<string, number>): PoshmarkCsvItem {
  const rawStatus = getField(row, headerMap, 'status').toLowerCase();

  let normalizedStatus = 'Active';
  if (rawStatus.includes('sold') || rawStatus === 'sold') {
    normalizedStatus = 'Sold';
  } else if (
    rawStatus.includes('not for sale') ||
    rawStatus.includes('reserved') ||
    rawStatus.includes('removed')
  ) {
    normalizedStatus = 'Not For Sale';
  }

  // Closet exports use "My Price" as the selling price
  const priceCents = parseDollarsToCents(getField(row, headerMap, 'my price'));

  return {
    title: getField(row, headerMap, 'title'),
    brand: getField(row, headerMap, 'brand'),
    size: getField(row, headerMap, 'size'),
    priceCents,
    category: getField(row, headerMap, 'category'),
    status: normalizedStatus,
    listedDate: getField(row, headerMap, 'listed date') || undefined,
  };
}

/**
 * Main parser: auto-detects CSV format and returns parsed items
 */
export function parsePoshmarkCSV(csvData: string): PoshmarkCsvItem[] {
  const lines = csvData
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return []; // need header + at least 1 data row

  const headerFields = parseCSVLine(lines[0]);
  const format = detectFormat(headerFields);

  if (format === 'unknown') {
    console.warn('[PoshmarkCSV] Could not detect CSV format from headers:', headerFields);
    return [];
  }

  const headerMap = buildHeaderMap(headerFields);
  const items: PoshmarkCsvItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 2) continue; // skip blank/malformed rows

    const item =
      format === 'sales'
        ? parseSalesRow(row, headerMap)
        : parseClosetRow(row, headerMap);

    // Only include rows that have a title
    if (item.title) {
      items.push(item);
    }
  }

  return items;
}

/**
 * Utility: get format name for display
 */
export function detectPoshmarkCSVFormat(csvData: string): CsvFormat {
  const lines = csvData.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return 'unknown';
  return detectFormat(parseCSVLine(lines[0]));
}

/**
 * Summary stats from parsed items
 */
export interface PoshmarkCsvSummary {
  total: number;
  active: number;
  sold: number;
  notForSale: number;
  format: CsvFormat;
}

export function summarizePoshmarkCSV(items: PoshmarkCsvItem[], csvData: string): PoshmarkCsvSummary {
  const format = detectPoshmarkCSVFormat(csvData);
  return {
    total: items.length,
    active: items.filter((i) => i.status === 'Active').length,
    sold: items.filter((i) => i.status === 'Sold').length,
    notForSale: items.filter((i) => i.status === 'Not For Sale').length,
    format,
  };
}
