/**
 * QR Code Generation Utilities
 *
 * Generates QR codes using Google Charts API to link to item detail pages
 */

/**
 * Generates a Google Charts QR code URL for an item
 *
 * @param itemId - The item's unique ID
 * @param size - QR code size in pixels (default: 200)
 * @returns Google Charts API URL that renders the QR code
 */
export function generateQRCodeUrl(itemId: string, size: number = 200): string {
  const baseUrl = 'https://closet-da8f2.web.app';
  const itemUrl = `${baseUrl}/items/${itemId}`;

  // Google Charts QR Code API
  // https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl={URL}
  const qrApiUrl = `https://chart.googleapis.com/chart?chs=${size}x${size}&cht=qr&chl=${encodeURIComponent(itemUrl)}`;

  return qrApiUrl;
}

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
 * Validates if a QR code URL is properly formatted
 *
 * @param url - QR code URL to validate
 * @returns True if valid Google Charts QR code URL
 */
export function isValidQRCodeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname === 'chart.googleapis.com' &&
      urlObj.pathname === '/chart' &&
      urlObj.searchParams.has('cht') &&
      urlObj.searchParams.get('cht') === 'qr'
    );
  } catch {
    return false;
  }
}
