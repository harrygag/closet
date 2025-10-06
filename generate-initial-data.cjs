const fs = require('fs');

const restoreScript = fs.readFileSync('restore-items.js', 'utf8');
const itemsMatch = restoreScript.match(/const items = (\[[\s\S]*?\]);/);
const itemsJson = itemsMatch[1];

const template = `// Initial Data Loader - Auto-loads 79 items from Notion on first visit
class InitialDataLoader {
  static ITEMS = ${itemsJson};

  static loadInitialData() {
    const existingData = localStorage.getItem('resellerClosetItems');

    // Only load if localStorage is empty (first visit or cleared)
    if (!existingData || JSON.parse(existingData).length === 0) {
      console.log('🎮 First visit detected - loading 79 closet items from Notion...');
      localStorage.setItem('resellerClosetItems', JSON.stringify(this.ITEMS));
      console.log(\`✅ Loaded \${this.ITEMS.length} items!\`);
      return true;
    }

    console.log(\`📦 Found \${JSON.parse(existingData).length} existing items in localStorage\`);
    return false;
  }
}
`;

fs.writeFileSync('src/js/initial-data.js', template);
console.log('✅ Generated initial-data.js with 79 items');
