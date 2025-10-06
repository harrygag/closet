const fs = require('fs');

// Read Notion data
const notionData = JSON.parse(fs.readFileSync('notion-items.json', 'utf8'));

// Transform and filter only valid items
const items = notionData.results
  .map(page => {
    const props = page.properties;

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
  })
  .filter(item => item.name && item.name.trim() !== '' && !item.name.includes('Project Management')); // Filter out empty and project management page

console.log(`✅ Filtered to ${items.length} valid closet items`);

// Create restore script
const restoreScript = `// Restore ${items.length} closet items to localStorage
const items = ${JSON.stringify(items, null, 2)};

localStorage.setItem('resellerClosetItems', JSON.stringify(items));
console.log('✅ Restored ${items.length} closet items to localStorage!');
console.log('Reloading app...');
location.reload();
`;

fs.writeFileSync('restore-items.js', restoreScript);
console.log('✅ Updated restore-items.js with valid items only');
console.log(`\n🎮 First 5 items:`);
items.slice(0, 5).forEach((item, i) => {
  console.log(`${i + 1}. ${item.name} - Size: ${item.size || 'N/A'} - ${item.status}`);
});
console.log(`\n📦 Total: ${items.length} closet items ready to restore`);
