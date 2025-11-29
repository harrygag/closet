/**
 * Barcode Generation Service
 *
 * Generates unique barcodes for inventory items
 * Format: INV-YYYYMMDD-XXXXX
 *
 * Example: INV-20241118-00001
 */

type DatabaseClient = any;

/**
 * Generates a unique barcode for a new item
 * Format: INV-YYYYMMDD-XXX-NNNNN (3-letter prefix + 5-digit number)
 *
 * @param userId - The user's UUID
 * @param databaseClient - Database client instance
 * @returns Promise<string> - Generated barcode
 * @throws Error if generation fails after retries
 */
export async function generateBarcode(
  userId: string,
  databaseClient: DatabaseClient
): Promise<string> {
  const MAX_RETRIES = 10;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Get current date in YYYYMMDD format
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

      // Generate 3-letter prefix from user ID
      const userPrefix = userId.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '0');

      // Generate a random 5-digit number (avoids complex Firestore queries)
      const randomNum = Math.floor(Math.random() * 90000) + 10000; // 10000-99999
      const numberStr = randomNum.toString();

      // Construct barcode: INV-YYYYMMDD-XXX-NNNNN
      const barcode = `INV-${dateStr}-${userPrefix}-${numberStr}`;

      // Validate format
      if (!isValidBarcodeFormat(barcode)) {
        throw new Error(`Generated invalid barcode format: ${barcode}`);
      }

      // Verify uniqueness - this uses a simple eq query that works with Firestore
      const exists = await barcodeExists(barcode, userId, databaseClient);
      if (exists) {
        console.warn(`Barcode collision detected: ${barcode}, retrying...`);
        continue; // Retry with new random number
      }

      console.log(`Generated barcode: ${barcode} (attempt ${attempt + 1})`);
      return barcode;

    } catch (error) {
      console.error(`Barcode generation attempt ${attempt + 1} failed:`, error);

      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`Failed to generate barcode after ${MAX_RETRIES} attempts`);
      }

      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  throw new Error('Failed to generate barcode');
}

/**
 * Validates barcode format
 * Expected: INV-YYYYMMDD-XXX-NNNNN
 * 
 * @param barcode - Barcode string to validate
 * @returns boolean - True if valid format
 */
export function isValidBarcodeFormat(barcode: string): boolean {
  // Format: INV-YYYYMMDD-XXX-NNNNN
  const regex = /^INV-\d{8}-[A-Z0-9]{3}-\d{5}$/;
  
  if (!regex.test(barcode)) {
    return false;
  }
  
  // Validate date portion
  const datePart = barcode.slice(4, 12); // YYYYMMDD
  const year = parseInt(datePart.slice(0, 4));
  const month = parseInt(datePart.slice(4, 6));
  const day = parseInt(datePart.slice(6, 8));
  
  // Basic date validation
  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  return true;
}

/**
 * Checks if barcode exists in database
 *
 * @param barcode - Barcode to check
 * @param userId - User UUID
 * @param databaseClient - Database client
 * @returns Promise<boolean> - True if exists
 */
export async function barcodeExists(
  barcode: string,
  userId: string,
  databaseClient: DatabaseClient
): Promise<boolean> {
  const { data, error } = await databaseClient
    .from('Item')
    .select('id')
    .eq('user_uuid', userId)
    .eq('barcode', barcode)
    .limit(1);
  
  if (error) {
    console.error('Error checking barcode existence:', error);
    return false; // Assume doesn't exist on error (will be caught later)
  }
  
  return data && data.length > 0;
}

/**
 * Parses barcode to extract date and sequence number
 *
 * @param barcode - Barcode string (INV-YYYYMMDD-XXX-NNNNN)
 * @returns Object with date, prefix, and number, or null if invalid
 */
export function parseBarcode(barcode: string): { date: string; prefix: string; number: number } | null {
  if (!isValidBarcodeFormat(barcode)) {
    return null;
  }

  const datePart = barcode.slice(4, 12); // YYYYMMDD
  const prefixPart = barcode.slice(13, 16); // XXX
  const numberPart = barcode.slice(17, 22); // NNNNN

  return {
    date: datePart,
    prefix: prefixPart,
    number: parseInt(numberPart, 10)
  };
}

/**
 * Logs a barcode print event
 *
 * @param itemId - The item ID that was printed
 * @param userId - The user who printed the barcode
 * @param payload - Additional metadata about the print event
 */
export async function logBarcodePrintEvent(
  itemId: string,
  userId: string,
  payload: Record<string, any> = {}
): Promise<void> {
  try {
    // Import database client dynamically to avoid circular imports
    const { database } = await import('../lib/database/client');

    const { error } = await (database as any)
      .from('barcode_events')
      .insert({
        item_id: itemId,
        user_uuid: userId,
        event_type: 'PRINTED',
        payload: payload
      });

    if (error) {
      console.error('Failed to log barcode print event:', error);
    }
  } catch (error) {
    console.error('Error logging barcode print event:', error);
  }
}

