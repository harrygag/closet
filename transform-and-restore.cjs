const fs = require('fs');

// Read Notion data
const notionData = JSON.parse(fs.readFileSync('notion-items.json', 'utf8'));

// Transform to app format
const items = notionData.results.map(page => {
  const props = page.properties;

  // Helper to get plain text from rich text
  const getText = (prop) => prop?.rich_text?.[0]?.plain_text || '';
  const getTitle = (prop) => prop?.title?.[0]?.plain_text || '';
  const getSelect = (prop) => prop?.select?.name || '';
  const getMultiSelect = (prop) => prop?.multi_select?.map(s => s.name) || [];
  const getNumber = (prop) => prop?.number || 0;
  const getUrl = (prop) => prop?.url || '';
  const getDate = (prop) => prop?.date?.start || '';

  return {
    id: page.id,
    name: getTitle(props.Name) || getText(props.Name),
    size: getSelect(props.Size),
    status: getSelect(props.Status) || 'Active',
    hangerStatus: getSelect(props['Hanger Status']),
    hangerId: getText(props['Hanger ID']),
    tags: getMultiSelect(props.Tags),
    ebayUrl: getUrl(props['eBay URL']),
    costPrice: getNumber(props['Cost Price']),
    sellingPrice: getNumber(props['Selling Price']),
    ebayFees: getNumber(props['eBay Fees']),
    netProfit: getNumber(props['Net Profit']),
    dateField: getDate(props.Date),
    notes: getText(props.Notes),
    dateAdded: page.created_time
  };
});

console.log(`✅ Transformed ${items.length} items`);

// Create restore script
const restoreScript = `// Restore ${items.length} items to localStorage
const items = ${JSON.stringify(items, null, 2)};

localStorage.setItem('resellerClosetItems', JSON.stringify(items));
console.log('✅ Restored ${items.length} items to localStorage!');
console.log('Reloading app...');
location.reload();
`;

fs.writeFileSync('restore-items.js', restoreScript);
console.log('✅ Created restore-items.js');
console.log('\n📋 TO RESTORE YOUR DATA:');
console.log('1. Open your app in browser');
console.log('2. Press F12 (open console)');
console.log('3. Copy/paste contents of restore-items.js');
console.log('4. Press Enter');
console.log(`\n🎮 First 3 items:`);
items.slice(0, 3).forEach((item, i) => {
  console.log(`${i + 1}. ${item.name} (${item.size}) - ${item.status}`);
});
