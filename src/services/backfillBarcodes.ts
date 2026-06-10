/**
 * Utility to backfill barcodes for existing items that don't have them
 * Run this ONCE to add barcodes to all items created before barcode system was implemented
 */

type DatabaseClient = any;
import { generateBarcode } from './barcodes';

interface BackfillResult {
  success: boolean;
  itemsProcessed: number;
  itemsUpdated: number;
  errors: Array<{ itemId: string; error: string }>;
}

/**
 * Backfill barcodes for all items that don't have one
 */
export async function backfillBarcodes(
  userId: string,
  database: DatabaseClient
): Promise<BackfillResult> {
  const result: BackfillResult = {
    success: true,
    itemsProcessed: 0,
    itemsUpdated: 0,
    errors: [],
  };

  try {
    console.log('🔍 Finding items without barcodes...');

    // Get all items for this user that don't have a barcode
    const { data: items, error: fetchError } = await database
      .from('Item')
      .select('id, title, barcode, createdAt')
      .eq('user_uuid', userId)
      .or('barcode.is.null,barcode.eq.')
      .order('createdAt', { ascending: true }); // Oldest first

    if (fetchError) {
      console.error('❌ Failed to fetch items:', fetchError);
      result.success = false;
      return result;
    }

    if (!items || items.length === 0) {
      console.log('✅ No items need barcode backfill!');
      return result;
    }

    console.log(`📦 Found ${items.length} items without barcodes`);

    // Process each item
    for (const item of items) {
      result.itemsProcessed++;

      try {
        // Generate barcode
        const barcode = await generateBarcode(userId, database);
        console.log(`  ✅ Item "${item.title}" (${item.id}) -> ${barcode}`);

        // Update item with barcode
        const { error: updateError } = await database
          .from('Item')
          .update({ barcode: barcode })
          .eq('id', item.id)
          .eq('user_uuid', userId);

        if (updateError) {
          console.error(`  ❌ Failed to update item ${item.id}:`, updateError);
          result.errors.push({
            itemId: item.id,
            error: updateError.message,
          });
          continue;
        }

        result.itemsUpdated++;

        // Small delay to avoid overwhelming the database
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`  ❌ Error processing item ${item.id}:`, errorMessage);
        result.errors.push({
          itemId: item.id,
          error: errorMessage,
        });
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
      console.log(`⚠️ Backfill completed with ${result.errors.length} errors`);
    } else {
      console.log('✅ Barcode backfill completed successfully!');
    }

    console.log(`📊 Summary: ${result.itemsUpdated}/${result.itemsProcessed} items updated`);

    return result;
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    result.success = false;
    return result;
  }
}

/**
 * Check how many items need barcodes
 */
export async function countItemsNeedingBarcodes(
  userId: string,
  database: DatabaseClient
): Promise<number> {
  const { count, error } = await database
    .from('Item')
    .select('id', { count: 'exact', head: true })
    .eq('user_uuid', userId)
    .or('barcode.is.null,barcode.eq.');

  if (error) {
    console.error('Failed to count items:', error);
    return 0;
  }

  return count || 0;
}

