/**
 * QR Code Generation Utilities
 *
 * Generates QR codes using the `qrcode` npm package as data URLs.
 */

import QRCode from 'qrcode';

/**
 * Gets the item detail page URL
 *
 * @param itemId - The item's unique ID
 * @returns Full URL to the item's detail page
 */
export function getItemDetailUrl(itemId: string): string {
  const baseUrl = 'https://closet-da8f2.web.app';
  return `${baseUrl}/items/${itemId}`;
}

/**
 * Generates a QR code data URL for an item detail page
 *
 * @param itemId - The item's unique ID
 * @param size - QR code size in pixels (default: 200)
 * @returns Promise resolving to a data URL PNG of the QR code
 */
export async function generateQRCodeUrl(itemId: string, size: number = 200): Promise<string> {
  return QRCode.toDataURL(getItemDetailUrl(itemId), { width: size, margin: 1 });
}

/**
 * Generates a QR code data URL that encodes the barcode string directly
 *
 * @param barcode - The barcode to encode
 * @param size - QR code size in pixels (default: 200)
 * @returns Promise resolving to a data URL PNG of the QR code
 */
export async function generateBarcodeQRCodeUrl(barcode: string, size: number = 200): Promise<string> {
  return QRCode.toDataURL(barcode, { width: size, margin: 1 });
}

/**
 * Validates if a QR code URL is properly formatted.
 * No longer meaningful with data URLs — always returns true.
 *
 * @param _url - Unused
 * @returns true
 */
export function isValidQRCodeUrl(_url: string): boolean {
  return true;
}
