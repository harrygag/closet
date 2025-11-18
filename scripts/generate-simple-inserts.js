/**
 * Generate simple INSERT statements for all CSV items
 */

import fs from 'fs';

function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
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

function escapeSQL(str) {
  if (!str) return '';
  return str.replace(/'/g, "''").replace(/\\/g, '\\\\');
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

const csvText = fs.readFileSync('vendoo-full-2025-11-17.csv', 'utf-8');
const rows = parseCSV(csvText);

console.log(`Processing ${rows.length} items...\n`);

const batchSize = 10;
let batchFiles = [];

for (let i = 0; i < rows.length; i += batchSize) {
  const batch = rows.slice(i, i + batchSize);
  const batchNum = Math.floor(i / batchSize) + 1;
  
  let sql = `-- Batch ${batchNum} (Items ${i+1}-${Math.min(i+batchSize, rows.length)})\n\n`;
  sql += `INSERT INTO "Item" (id, user_uuid, title, size, status, "normalizedTags", "imageUrls", "manualPriceCents", brand, category, imported_from, "createdAt", "updatedAt")\nVALUES\n`;
  
  const values = batch.map((row, idx) => {
    const title = escapeSQL((row['Title'] || 'Untitled Item').substring(0, 200));
    const imageUrl = escapeSQL(row['Images'] || '');
    const price = parseFloat((row['Price'] || '0').replace(/[^0-9.]/g, '')) || 0;
    const status = row['Status'] === 'Sold' ? 'SOLD' : 'IN_STOCK';
    const brand = escapeSQL((row['Brand'] || 'Unknown').substring(0, 100));
    const category = escapeSQL((row['Category'] || 'Clothing').substring(0, 100));
    const tags = mapCategoryToTags(row['Category'] || '');
    const size = extractSizeFromTitle(row['Title'] || '');
    
    const tagsSQL = `ARRAY[${tags.map(t => `'${escapeSQL(t)}'`).join(', ')}]`;
    const imageSQL = imageUrl ? `ARRAY['${imageUrl}']` : 'ARRAY[]::text[]';
    
    return `(gen_random_uuid(), '1836a66f-5c39-4fb5-9a88-4ec14c93aa97', '${title}', '${size}', '${status}', ${tagsSQL}, ${imageSQL}, ${Math.round(price * 100)}, '${brand}', '${category}', 'csv', NOW(), NOW())`;
  });
  
  sql += values.join(',\n');
  sql += ';\n';
  
  const filename = `scripts/simple-batch-${batchNum}.sql`;
  fs.writeFileSync(filename, sql);
  batchFiles.push(filename);
  console.log(`✅ Created ${filename}`);
}

console.log(`\n✨ Created ${batchFiles.length} batch files`);
console.log(`\n📋 Total items: ${rows.length}`);
console.log(`\n💡 Execute all batches with:`);
console.log(`   for i in {1..${batchFiles.length}}; do cat scripts/simple-batch-$i.sql; done`);


