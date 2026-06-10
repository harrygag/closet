// Recovery script to export IndexedDB data before migration
import { openDB } from 'idb';
import type { Item } from '../types/item';

/**
 * Recover all items from the closet-db IndexedDB database
 */
export async function recoverInventoryFromIndexedDB(): Promise<Item[]> {
  try {
    const db = await openDB('closet-db', 1);
    const items = await db.getAll('items');
    console.log(`Recovered ${items.length} items from IndexedDB`);
    return items;
  } catch (error) {
    console.error('Error recovering from closet-db:', error);
    return [];
  }
}

/**
 * Export items to JSON file for backup
 */
export async function exportToJSON(items: Item[]): Promise<void> {
  const dataStr = JSON.stringify(items, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `closet-backup-${new Date().toISOString()}.json`;
  link.click();
  
  URL.revokeObjectURL(url);
  console.log(`Exported ${items.length} items to JSON`);
}

/**
 * Import items from JSON file
 */
export async function importFromJSON(file: File): Promise<Item[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const items = JSON.parse(e.target?.result as string);
        resolve(items);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * One-click recovery: export current IndexedDB data to JSON
 */
export async function quickBackup(): Promise<void> {
  const items = await recoverInventoryFromIndexedDB();
  if (items.length > 0) {
    await exportToJSON(items);
    alert(`✅ Backed up ${items.length} items!`);
  } else {
    alert('⚠️ No items found in database');
  }
}
