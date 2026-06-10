/**
 * Shared extraction helpers for Depop listings.
 * Used by import.ts, DepopIntegrationPage, and DepopImportModal
 * to ensure consistent price/image/field extraction.
 */

import type { DepopListing } from './import';

/**
 * Extract the price (in dollars) from a Depop listing.
 * Handles API v3 pricing, legacy price formats, priceAmount, priceV2, string prices,
 * and a last-resort scan of common price-like root keys.
 */
export function extractDepopPrice(listing: DepopListing): number {
  const listing_any = listing as any;

  // Try API v3 pricing structure first
  if (listing.pricing) {
    const priceObj = (listing.pricing.discounted_price || listing.pricing.original_price) as any;
    if (priceObj) {
      // total_price is a string like "53.99" (dollars, not cents)
      if (priceObj.total_price) {
        const tp = parseFloat(priceObj.total_price);
        if (!isNaN(tp) && tp > 0) return tp;
      }
      // price_breakdown.price.amount is also a string like "53.99"
      if (priceObj.price_breakdown?.price?.amount) {
        const pa = parseFloat(priceObj.price_breakdown.price.amount);
        if (!isNaN(pa) && pa > 0) return pa;
      }
      // Legacy: amount as number in cents
      if (priceObj.amount && typeof priceObj.amount === 'number') {
        return priceObj.amount / 100;
      }
    }
  }

  // Try price.priceAmount (string or number in cents)
  if (listing_any.price?.priceAmount) {
    const amount = typeof listing_any.price.priceAmount === 'string'
      ? parseFloat(listing_any.price.priceAmount)
      : listing_any.price.priceAmount;
    if (!isNaN(amount)) return amount / 100;
  }

  // Try price.price_amount (cents)
  if (listing_any.price?.price_amount) {
    return listing_any.price.price_amount / 100;
  }

  // Try priceAmount at root level (cents)
  if (listing_any.priceAmount) {
    const amount = typeof listing_any.priceAmount === 'string'
      ? parseFloat(listing_any.priceAmount)
      : listing_any.priceAmount;
    if (!isNaN(amount)) return amount / 100;
  }

  // Try price as plain number (already in dollars)
  if (typeof listing_any.price === 'number' && listing_any.price > 0) {
    return listing_any.price;
  }

  // Fallback: try national_price_currency
  if (listing_any.price?.national_price_currency) {
    const amount = parseFloat(listing_any.price.national_price_currency);
    if (!isNaN(amount) && amount > 0) return amount;
  }

  // Try price_amount at root level (snake_case variant)
  if (listing_any.price_amount) {
    const amount = typeof listing_any.price_amount === 'string'
      ? parseFloat(listing_any.price_amount)
      : listing_any.price_amount;
    if (!isNaN(amount) && amount > 0) return amount / 100;
  }

  // Try priceV2 format (v2 API)
  if (listing_any.priceV2?.amount) {
    const amount = typeof listing_any.priceV2.amount === 'string'
      ? parseFloat(listing_any.priceV2.amount)
      : listing_any.priceV2.amount;
    if (!isNaN(amount) && amount > 0) return amount / 100;
  }

  // Try price as string (dollars, e.g. "25.00" or "$25.00")
  if (typeof listing_any.price === 'string') {
    const cleaned = listing_any.price.replace(/[^0-9.]/g, '');
    const amount = parseFloat(cleaned);
    if (!isNaN(amount) && amount > 0) return amount;
  }

  // Last resort: scan common price-like root keys
  const priceKeys = ['cost', 'amount', 'total', 'listingPrice', 'salePrice', 'retailPrice'];
  for (const key of priceKeys) {
    if (listing_any[key] !== undefined) {
      const val = typeof listing_any[key] === 'string'
        ? parseFloat(listing_any[key])
        : listing_any[key];
      if (typeof val === 'number' && !isNaN(val) && val > 0) {
        return val > 100 ? val / 100 : val;
      }
    }
  }

  console.warn(
    '[extractDepopPrice] No price found for listing:', listing.id,
    'Available keys:', Object.keys(listing_any),
    'Price field:', JSON.stringify(listing_any.price),
    'Pricing field:', JSON.stringify(listing_any.pricing),
    'Full listing sample:', JSON.stringify(listing_any).substring(0, 500)
  );
  return 0;
}

/**
 * Extract image URLs from a Depop listing.
 * Handles API v3 pictures array, preview object, legacy images array, and single image field.
 */
export function extractDepopImages(listing: DepopListing): string[] {
  // Try legacy images array first
  if (listing.images && listing.images.length > 0) return listing.images;

  // Try API v3 pictures array with numbered size keys
  if (listing.pictures && listing.pictures.length > 0) {
    return listing.pictures
      .map(p => p['960'] || p['640'] || p['480'] || p['320'] || p['210'] || p['150'])
      .filter(Boolean) as string[];
  }

  // Try preview object
  if (listing.preview && typeof listing.preview === 'object') {
    const previewUrl = listing.preview['960'] || listing.preview['640'] || listing.preview['480'];
    if (previewUrl) return [previewUrl];
  }

  // Fallback to single image
  if (listing.image) return [listing.image];
  return [];
}

/**
 * Get the best single image URL for display (thumbnail/preview).
 * Prefers medium-resolution images (640) over high-res (960).
 */
export function getDepopListingImage(listing: DepopListing): string | null {
  const preview = listing.preview;
  const firstPicture = listing.pictures?.[0];

  return (
    (typeof preview === 'object'
      ? (preview as any)['640'] || (preview as any)['960']
      : preview) ||
    (firstPicture
      ? (firstPicture as any)['640'] || (firstPicture as any)['960'] || (firstPicture as any)['480']
      : undefined) ||
    listing.images?.[0] ||
    null
  );
}

/**
 * Format a price in dollars for display.
 */
export function formatDepopPrice(listing: DepopListing): string {
  const price = extractDepopPrice(listing);
  return `$${price.toFixed(2)}`;
}
