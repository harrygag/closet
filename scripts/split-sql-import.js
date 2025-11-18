/**
 * Split large SQL file into smaller batches for MCP execution
 */

import fs from 'fs';

const sqlContent = fs.readFileSync('scripts/vendoo-import.sql', 'utf-8');

// Extract the INSERT VALUES part
const valuesMatch = sqlContent.match(/VALUES\n([\s\S]+);$/);
if (!valuesMatch) {
  console.error('Could not find VALUES section');
  process.exit(1);
}

const allValues = valuesMatch[1];
const valueRows = allValues.split(/\),\n\(/);

console.log(`Total value rows: ${valueRows.length}`);

// Create header
const header = `INSERT INTO "Item" (
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
VALUES\n`;

// Delete statement
const deleteStmt = `DELETE FROM "Item" WHERE user_uuid = '1836a66f-5c39-4fb5-9a88-4ec14c93aa97';\n\n`;

const batchSize = 20;
let batchNumber = 1;

for (let i = 0; i < valueRows.length; i += batchSize) {
  const batch = valueRows.slice(i, i + batchSize);
  
  // Fix first and last rows (add/remove parens)
  let batchSQL = '';
  for (let j = 0; j < batch.length; j++) {
    let row = batch[j];
    
    // Remove leading ( if not first row
    if (j === 0 && i === 0) {
      row = '(' + row;
    } else if (j === 0) {
      row = row.startsWith('(') ? row : '(' + row;
    } else {
      row = row.startsWith('(') ? row : '(' + row;
    }
    
    // Add ) at end if not already there
    if (!row.endsWith(')')) {
      row = row + ')';
    }
    
    batchSQL += row;
    if (j < batch.length - 1) {
      batchSQL += ',\n';
    }
  }

  // Include delete only in first batch
  const fullSQL = (batchNumber === 1 ? deleteStmt : '') + header + batchSQL + ';';
  
  const filename = `scripts/vendoo-import-batch-${batchNumber}.sql`;
  fs.writeFileSync(filename, fullSQL);
  console.log(`✅ Created ${filename} (${batch.length} items)`);
  
  batchNumber++;
}

console.log(`\n📦 Total batches: ${batchNumber - 1}`);
console.log(`\n💡 Next step: Execute each batch using Supabase MCP execute_sql`);


