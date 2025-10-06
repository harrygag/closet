const fs = require('fs');

// Read the initial data
const initialDataContent = fs.readFileSync('src/js/initial-data.js', 'utf8');
const itemsMatch = initialDataContent.match(/static ITEMS = (\[[\s\S]*?\]);/);
const itemsJson = itemsMatch[1];

// Parse items
const items = JSON.parse(itemsJson);

console.log(`Found ${items.length} items from Notion`);

// Create pre-configured user and their data
const preConfiguredUser = {
  id: "user_harrison_1", // Fixed ID for consistency
  username: "harrisonkenned291@gmail.com",
  password: "closet2025", // You should change this after first login
  createdAt: new Date().toISOString()
};

// Create the setup data
const setupData = {
  user: preConfiguredUser,
  items: items,
  storageKey: `resellerClosetItems_${preConfiguredUser.id}`
};

// Write to a setup file
fs.writeFileSync('user-setup-data.json', JSON.stringify(setupData, null, 2));

console.log(`✅ Created setup for user: ${preConfiguredUser.username}`);
console.log(`   User ID: ${preConfiguredUser.id}`);
console.log(`   Storage Key: ${setupData.storageKey}`);
console.log(`   Items: ${items.length}`);
console.log(`   Default Password: closet2025 (CHANGE THIS!)`);
console.log(`\n📝 Data saved to: user-setup-data.json`);
