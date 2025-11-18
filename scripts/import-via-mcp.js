/**
 * Generate minimal INSERT statements for MCP execution
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

const csvText = fs.readFileSync('vendoo-full-2025-11-17.csv', 'utf-8');
const rows = parseCSV(csvText);

console.log(`Found ${rows.length} items`);
console.log('\nPaste these commands into the terminal one by one:\n');
console.log('========================================\n');

// Generate MCP commands for first 5 items as a test
for (let i = 0; i < Math.min(189, rows.length); i++) {
  const row = rows[i];
  const title = escapeSQL((row['Title'] || 'Item').substring(0, 100));
  const imageUrl = escapeSQL(row['Images'] || '');
  const price = parseFloat((row['Price'] || '0').replace(/[^0-9.]/g, '')) || 0;
  const status = row['Status'] === 'Sold' ? 'SOLD' : 'IN_STOCK';
  const brand = escapeSQL(row['Brand'] || 'Unknown');
  
  console.log(`# Item ${i + 1}: ${title.substring(0, 50)}...`);
  console.log(`INSERT INTO "Item" (user_uuid, title, size, status, "normalizedTags", "imageUrls", "manualPriceCents", brand, category, imported_from, "createdAt", "updatedAt") VALUES ('1836a66f-5c39-4fb5-9a88-4ec14c93aa97', '${title}', 'M', '${status}', ARRAY['T-shirts'], ARRAY['${imageUrl}'], ${Math.round(price * 100)}, '${brand}', 'Clothing', 'csv', NOW(), NOW());\n`);
}

console.log('\n========================================');
console.log(`\nTotal: ${rows.length} items`);
console.log('\n💡 Or run: cat scripts/vendoo-import.sql | supabase db execute');


