// Marketplace utilities for icon mapping and URL detection
import { SiEbay } from 'react-icons/si';
import { RiShoppingBag3Line, RiHandbagLine, RiStore2Line } from 'react-icons/ri';
import { FaShoppingCart } from 'react-icons/fa';
import type { MarketplaceType, MarketplaceUrl } from '../types/item';

/**
 * Map marketplace types to their respective icons
 */
export const MARKETPLACE_ICONS: Record<MarketplaceType, React.ComponentType<{ className?: string }>> = {
  ebay: SiEbay,
  poshmark: RiHandbagLine,
  mercari: FaShoppingCart,
  depop: RiStore2Line,
  grailed: RiShoppingBag3Line,
  other: RiShoppingBag3Line,
};

/**
 * Map marketplace types to their brand colors
 */
export const MARKETPLACE_COLORS: Record<MarketplaceType, string> = {
  ebay: '#E53238',
  poshmark: '#AC1752',
  mercari: '#FF6E4A',
  depop: '#FF0000',
  grailed: '#000000',
  other: '#6B7280',
};

/**
 * Detect marketplace type from URL
 */
export function detectMarketplaceType(url: string): MarketplaceType {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('ebay.com')) return 'ebay';
  if (lowerUrl.includes('poshmark.com')) return 'poshmark';
  if (lowerUrl.includes('mercari.com')) return 'mercari';
  if (lowerUrl.includes('depop.com')) return 'depop';
  if (lowerUrl.includes('grailed.com')) return 'grailed';
  
  return 'other';
}

/**
 * Parse marketplace URLs from item data
 */
export function parseMarketplaceUrls(ebayUrl: string, additionalUrls?: string[]): MarketplaceUrl[] {
  const urls: MarketplaceUrl[] = [];
  
  // Add eBay URL if present
  if (ebayUrl && ebayUrl.trim()) {
    urls.push({
      type: 'ebay',
      url: ebayUrl.trim(),
    });
  }
  
  // Add additional marketplace URLs if present
  if (additionalUrls) {
    additionalUrls.forEach((url) => {
      if (url && url.trim()) {
        urls.push({
          type: detectMarketplaceType(url),
          url: url.trim(),
        });
      }
    });
  }
  
  return urls;
}

/**
 * Get marketplace display name
 */
export function getMarketplaceName(type: MarketplaceType): string {
  const names: Record<MarketplaceType, string> = {
    ebay: 'eBay',
    poshmark: 'Poshmark',
    mercari: 'Mercari',
    depop: 'Depop',
    grailed: 'Grailed',
    other: 'Other',
  };
  
  return names[type];
}
