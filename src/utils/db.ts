// IndexedDB utilities using idb library
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Item } from '../types/item';

interface ClosetDB extends DBSchema {
  items: {
    key: string;
    value: Item;
    indexes: { 'by-status': string; 'by-dateAdded': string };
  };
}

// Use the SAME database name as the main app so we access the same data
const DB_NAME = 'closet-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<ClosetDB> | null = null;

export const initDB = async (_userEmail?: string): Promise<IDBPDatabase<ClosetDB>> => {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ClosetDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create items store if it doesn't exist
      if (!db.objectStoreNames.contains('items')) {
        const itemsStore = db.createObjectStore('items', { keyPath: 'id' });
        itemsStore.createIndex('by-status', 'status');
        itemsStore.createIndex('by-dateAdded', 'dateAdded');
      }
    },
  });

  return dbInstance;
};

export const getAllItems = async (): Promise<Item[]> => {
  const db = await initDB();
  return db.getAll('items');
};

export const getItemById = async (id: string): Promise<Item | undefined> => {
  const db = await initDB();
  return db.get('items', id);
};

export const addItem = async (item: Item): Promise<string> => {
  const db = await initDB();
  await db.add('items', item);
  return item.id;
};

export const updateItem = async (item: Item): Promise<void> => {
  const db = await initDB();
  await db.put('items', item);
};

export const deleteItem = async (id: string): Promise<void> => {
  const db = await initDB();
  await db.delete('items', id);
};

export const clearAllItems = async (): Promise<void> => {
  const db = await initDB();
  await db.clear('items');
};

export const bulkAddItems = async (items: Item[]): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction('items', 'readwrite');
  
  await Promise.all([
    ...items.map(item => tx.store.add(item)),
    tx.done,
  ]);
};

export const getItemsByStatus = async (status: string): Promise<Item[]> => {
  const db = await initDB();
  return db.getAllFromIndex('items', 'by-status', status);
};
