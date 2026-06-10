import type { Item } from '../types/item';
import { extractSizeFromTitle, normalizeSize } from './ebay/import';

export async function backfillSizes(
  items: Item[],
  updateItem: (item: Item) => Promise<void>
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const name = item.name || '';
    const correctSize = normalizeSize(
      extractSizeFromTitle(name) || item.size || ''
    );

    // Only update if the size differs
    if (correctSize && correctSize !== item.size) {
      console.log(`[backfillSizes] "${name.substring(0, 50)}" → "${item.size}" → "${correctSize}"`);
      await updateItem({ ...item, size: correctSize });
      updated++;
    } else {
      skipped++;
    }
  }

  return { updated, skipped };
}
