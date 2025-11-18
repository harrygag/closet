/**
 * Generate SQL INSERT statements from Vendoo CSV
 */

import fs from 'fs';

function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values.map(v => v.trim());
}

function mapCategoryToTags(category) {
  const categoryLower = category.toLowerCase();
  const tags = [];
  
  if (categoryLower.includes('hoodie') || categoryLower.includes('sweatshirt')) tags.push('Hoodie');
  if (categoryLower.includes('jersey')) tags.push('Jersey');
  if (categoryLower.includes('polo')) tags.push('polo');
  if (categoryLower.includes('jacket') || categoryLower.includes('pullover') || categoryLower.includes('coat') || categoryLower.includes('vest')) tags.push('Pullover/Jackets');
  if (categoryLower.includes('t-shirt') || categoryLower.includes('tshirt') || categoryLower.includes('shirt')) tags.push('T-shirts');
  if (categoryLower.includes('bottom') || categoryLower.includes('pant') || categoryLower.includes('short')) tags.push('Bottoms');

  if (tags.length === 0) tags.push('T-shirts');
  return tags;
}

function extractSizeFromTitle(title) {
  const sizePatterns = [
    /\bsize\s+([a-z0-9]+)\b/i,
    /\b(small|medium|large|x-?large|xx-?large|xxx-?large)\b/i,
    /\b(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl)\b/i,
    /\bmens?\s+([a-z0-9]+)\b/i,
    /\b(\d+x?\d*)\b/,
  ];

  for (const pattern of sizePatterns) {
    const match = title.match(pattern);
    if (match) return match[1].toUpperCase();
  }

  return 'M';
}

function escapeSQL(str) {
  if (!str) return '';
  return str.replace(/'/g, "''").replace(/\\/g, '\\\\');
}

function mapRowToSQL(row, userId) {
  const title = escapeSQL(row['Title'] || 'Untitled Item');
  const status = row['Status'] === 'Sold' ? 'SOLD' : 'IN_STOCK';
  const tags = mapCategoryToTags(row['Category'] || '');
  const size = escapeSQL(extractSizeFromTitle(row['Title'] || ''));
  
  const priceStr = (row['Price'] || '0').replace(/[^0-9.]/g, '');
  const price = parseFloat(priceStr) || 0;
  const priceCents = Math.round(price * 100);
  
  const costStr = (row['Cost of Goods'] || '0').replace(/[^0-9.]/g, '');
  const cost = parseFloat(costStr) || 0;
  const costCents = Math.round(cost * 100);
  
  const soldPriceStr = (row['Price Sold'] || '0').replace(/[^0-9.]/g, '');
  const soldPrice = parseFloat(soldPriceStr) || 0;
  const soldPriceCents = soldPrice > 0 ? Math.round(soldPrice * 100) : null;

  const imageUrl = escapeSQL(row['Images'] || '');
  const imageUrlsArray = imageUrl ? `ARRAY['${imageUrl}']` : 'ARRAY[]::text[]';

  const listedDate = row['Listed Date'] || new Date().toISOString().split('T')[0];
  const soldDate = row['Sold Date'] && status === 'SOLD' ? `'${row['Sold Date']}'` : 'NULL';
  
  const brand = escapeSQL(row['Brand'] || 'Unknown');
  const condition = escapeSQL(row['Condition'] || '');
  const description = escapeSQL((row['Description'] || '').substring(0, 500));
  const internalNotes = escapeSQL(row['Internal Notes'] || '');
  const sku = escapeSQL(row['Sku'] || '');
  const primaryColor = escapeSQL(row['Primary Color'] || '');
  const secondaryColor = escapeSQL(row['Secondary Color'] || '');
  const category = escapeSQL(row['Category'] || 'Clothing');
  
  let notes = '';
  if (brand && brand !== 'Unknown') notes += `Brand: ${brand}. `;
  if (condition) notes += `Condition: ${condition}. `;
  if (primaryColor) notes += `Color: ${primaryColor}`;
  if (secondaryColor) notes += ` / ${secondaryColor}`;
  if (primaryColor || secondaryColor) notes += '. ';
  if (sku) notes += `SKU: ${sku}. `;
  if (internalNotes) notes += internalNotes;
  notes = escapeSQL(notes.trim());

  const tagsArray = `ARRAY[${tags.map(t => `'${escapeSQL(t)}'`).join(', ')}]`;

  return `(
    gen_random_uuid(),
    '${userId}',
    '${title}',
    '${size}',
    '${status}',
    ${tagsArray},
    ${imageUrlsArray},
    ${priceCents > 0 ? priceCents : 'NULL'},
    ${costCents > 0 ? costCents : 'NULL'},
    ${soldPriceCents !== null ? soldPriceCents : 'NULL'},
    ${soldDate},
    '${listedDate}',
    '${notes}',
    '${description}',
    '${brand}',
    '${category}',
    'csv',
    NOW(),
    NOW()
  )`;
}

const csvPath = process.argv[2] || 'vendoo-full-2025-11-17.csv';
const userId = '1836a66f-5c39-4fb5-9a88-4ec14c93aa97'; // from previous output

console.log('Reading CSV...');
const csvText = fs.readFileSync(csvPath, 'utf-8');
const rows = parseCSV(csvText);
console.log(`Found ${rows.length} items\n`);

console.log('Generating SQL...\n');

// Generate SQL in batches
const batchSize = 50;
let sql = `-- Vendoo CSV Import SQL
-- Generated: ${new Date().toISOString()}
-- Items: ${rows.length}

-- Delete existing items
DELETE FROM "Item" WHERE user_uuid = '${userId}';

-- Insert new items
INSERT INTO "Item" (
  id,
  user_uuid,
  title,
  size,
  status,
  "normalizedTags",
  "imageUrls",
  "manualPriceCents",
  "purchasePriceCents",
  "soldPriceCents",
  "soldDate",
  "purchaseDate",
  notes,
  "conditionNotes",
  brand,
  category,
  imported_from,
  ebay_imported_at,
  "createdAt"
)
VALUES
`;

const values = rows.map(row => mapRowToSQL(row, userId));
sql += values.join(',\n');
sql += ';';

fs.writeFileSync('scripts/vendoo-import.sql', sql);
console.log('✅ SQL written to scripts/vendoo-import.sql');
console.log(`📊 Total items: ${rows.length}`);


