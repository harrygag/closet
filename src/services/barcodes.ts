/**
 * Barcode Generation Service
 * 
 * Generates unique barcodes for inventory items
 * Format: INV-YYYYMMDD-XXXXX
 * 
 * Example: INV-20241118-00001
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generates a unique barcode for a new item
 * Format: INV-YYYYMMDD-XXXXX
 * 
 * @param userId - The user's UUID
 * @param supabaseClient - Supabase client instance
 * @returns Promise<string> - Generated barcode
 * @throws Error if generation fails after retries
 */
export async function generateBarcode(
  userId: string,
  supabaseClient: SupabaseClient
): Promise<string> {
  const MAX_RETRIES = 5;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Get current date in YYYYMMDD format
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
      
      // Query for highest barcode number today
      const todayPrefix = `INV-${dateStr}-%`;
      
      const { data, error } = await supabaseClient
        .from('Item')
        .select('barcode')
        .eq('user_uuid', userId)
        .like('barcode', todayPrefix)
        .order('barcode', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error querying barcodes:', error);
        throw new Error(`Failed to query barcodes: ${error.message}`);
      }
      
      // Determine next number
      let nextNumber = 1;
      
      if (data && data.length > 0 && data[0].barcode) {
        // Extract number from barcode (INV-20241118-00001 -> 00001)
        const match = data[0].barcode.match(/INV-\d{8}-(\d{5})$/);
        if (match && match[1]) {
          const currentNumber = parseInt(match[1], 10);
          nextNumber = currentNumber + 1;
        }
      }
      
      // Format as 5-digit number with leading zeros
      const numberStr = nextNumber.toString().padStart(5, '0');
      
      // Construct barcode
      const barcode = `INV-${dateStr}-${numberStr}`;
      
      // Validate format
      if (!isValidBarcodeFormat(barcode)) {
        throw new Error(`Generated invalid barcode format: ${barcode}`);
      }
      
      // Verify uniqueness (extra safety check)
      const exists = await barcodeExists(barcode, userId, supabaseClient);
      if (exists) {
        console.warn(`Barcode collision detected: ${barcode}, retrying...`);
        continue; // Retry with incremented number
      }
      
      console.log(`✅ Generated barcode: ${barcode} (attempt ${attempt + 1})`);
      return barcode;
      
    } catch (error) {
      console.error(`Barcode generation attempt ${attempt + 1} failed:`, error);
      
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`Failed to generate barcode after ${MAX_RETRIES} attempts`);
      }
      
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  
  throw new Error('Failed to generate barcode');
}

/**
 * Validates barcode format
 * Expected: INV-YYYYMMDD-XXXXX
 * 
 * @param barcode - Barcode string to validate
 * @returns boolean - True if valid format
 */
export function isValidBarcodeFormat(barcode: string): boolean {
  // Format: INV-YYYYMMDD-XXXXX
  const regex = /^INV-\d{8}-\d{5}$/;
  
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
 * @param supabaseClient - Supabase client
 * @returns Promise<boolean> - True if exists
 */
export async function barcodeExists(
  barcode: string,
  userId: string,
  supabaseClient: SupabaseClient
): Promise<boolean> {
  const { data, error } = await supabaseClient
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
 * @param barcode - Barcode string (INV-YYYYMMDD-XXXXX)
 * @returns Object with date and number, or null if invalid
 */
export function parseBarcode(barcode: string): { date: string; number: number } | null {
  if (!isValidBarcodeFormat(barcode)) {
    return null;
  }
  
  const datePart = barcode.slice(4, 12); // YYYYMMDD
  const numberPart = barcode.slice(13, 18); // XXXXX
  
  return {
    date: datePart,
    number: parseInt(numberPart, 10)
  };
}

