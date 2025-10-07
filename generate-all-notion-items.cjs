const fs = require('fs');
const path = require('path');

// Load notion-items.json
const notionData = JSON.parse(fs.readFileSync('notion-items.json', 'utf8'));

// Transform function
function transformNotionPageToItem(page, index) {
  const name = page.properties.Name?.title?.[0]?.plain_text;
  
  // Skip items without names or with template names
  if (!name || name.startsWith('Template') || name.length === 0 || name.includes('🎮') || name.match(/^[a-f0-9]{8}-[a-f0-9]{4}/)) {
    return null;
  }

  // Get image URL from icon or files
  let imageUrl = undefined;
  if (page.icon?.type === 'file' && page.icon.file?.url) {
    // Extract the base URL without the query parameters (they expire)
    const url = page.icon.file.url;
    const baseUrl = url.split('?')[0];
    imageUrl = baseUrl;
  } else if (page.properties['Files & media']?.files?.[0]?.file?.url) {
    const url = page.properties['Files & media'].files[0].file.url;
    const baseUrl = url.split('?')[0];
    imageUrl = baseUrl;
  }

  // Get size
  const size = page.properties.Select?.select?.name || '';

  // Get status
  const notionStatus = page.properties.Status?.select?.name;
  const status = (notionStatus === 'Active' || notionStatus === 'Inactive' || notionStatus === 'SOLD') 
    ? notionStatus 
    : 'Active';

  // Get tags
  const tags = page.properties.Tags?.multi_select?.map(t => t.name) || [];

  // Get hanger info
  const hangerStatus = page.properties['Hanger Status']?.select?.name || 'Available';
  const hangerId = page.properties['Hanger ID']?.select?.name || '';

  // Get financial info
  const ebayFees = page.properties['eBay Fees']?.number || 0;
  const netProfit = page.properties['Net Profit']?.number || 0;

  return {
    name,
    size,
    status,
    hangerStatus,
    hangerId,
    tags,
    ebayUrl: '',
    marketplaceUrls: [],
    imageUrl,
    costPrice: 0,
    sellingPrice: 0,
    ebayFees,
    netProfit,
    dateField: page.properties.Date?.date?.start || '',
    notes: '',
    position: index,
  };
}

// Transform all items
const items = notionData.results
  .map(transformNotionPageToItem)
  .filter(item => item !== null);

console.log(`Found ${items.length} valid items from Notion`);

// Generate TypeScript file
const tsContent = `// Real inventory data from Notion database
// Generated from notion-items.json - ${items.length} items total
import type { Item } from '../types/item';

export const INITIAL_ITEMS: Omit<Item, 'id' | 'dateAdded'>[] = ${JSON.stringify(items, null, 2)};
`;

// Write to file
fs.writeFileSync(
  path.join('closet-react', 'src', 'data', 'initial-items.ts'),
  tsContent,
  'utf8'
);

console.log('✅ Generated initial-items.ts with', items.length, 'items');
console.log('\nItem breakdown:');
const byCategory = items.reduce((acc, item) => {
  item.tags.forEach(tag => {
    acc[tag] = (acc[tag] || 0) + 1;
  });
  return acc;
}, {});
console.log(byCategory);
