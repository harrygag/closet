/**
 * eBay Manual Service
 * Reference documentation and helpers for eBay Trading API
 * Based on https://developer.ebay.com/devzone/xml/docs/reference/ebay/
 */

export interface EbayListingFormat {
  type: 'FixedPriceItem' | 'Auction' | 'StoresFixedPrice';
  label: string;
  description: string;
}

export interface EbayCondition {
  id: string;
  name: string;
  description: string;
}

export interface EbayCategory {
  id: string;
  name: string;
  path: string;
}

/**
 * eBay Listing Formats
 * https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/ListingTypeCodeType.html
 */
export const LISTING_FORMATS: EbayListingFormat[] = [
  {
    type: 'FixedPriceItem',
    label: 'Fixed Price',
    description: 'Buy It Now listing with a fixed price'
  },
  {
    type: 'Auction',
    label: 'Auction',
    description: 'Traditional auction-style listing'
  },
  {
    type: 'StoresFixedPrice',
    label: 'Store Fixed Price',
    description: 'Fixed price listing in eBay Store'
  }
];

/**
 * eBay Item Conditions
 * https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/ConditionValuesType.html
 */
export const ITEM_CONDITIONS: EbayCondition[] = [
  { id: '1000', name: 'New with tags', description: 'Brand new item with original tags' },
  { id: '1500', name: 'New without tags', description: 'Brand new without tags' },
  { id: '1750', name: 'New with defects', description: 'New item with manufacturing defects' },
  { id: '2000', name: 'Manufacturer refurbished', description: 'Refurbished by manufacturer' },
  { id: '2500', name: 'Seller refurbished', description: 'Refurbished by seller' },
  { id: '3000', name: 'Used', description: 'Previously owned item' },
  { id: '4000', name: 'Very Good', description: 'Gently used with minimal wear' },
  { id: '5000', name: 'Good', description: 'Used with normal signs of wear' },
  { id: '6000', name: 'Acceptable', description: 'Heavily used with obvious wear' },
  { id: '7000', name: 'For parts or not working', description: 'Item is broken or for parts' }
];

/**
 * Common eBay Categories for Clothing
 * https://developer.ebay.com/devzone/finding/callref/Enums/categoryHistogramValues.html
 */
export const CLOTHING_CATEGORIES: EbayCategory[] = [
  { id: '15687', name: 'T-Shirts', path: 'Clothing, Shoes & Accessories > Men\'s Clothing > Shirts > T-Shirts' },
  { id: '15689', name: 'Casual Shirts', path: 'Clothing, Shoes & Accessories > Men\'s Clothing > Shirts > Casual Shirts' },
  { id: '57991', name: 'Hoodies & Sweatshirts', path: 'Clothing, Shoes & Accessories > Men\'s Clothing > Sweats & Hoodies > Hoodies & Sweatshirts' },
  { id: '57988', name: 'Coats & Jackets', path: 'Clothing, Shoes & Accessories > Men\'s Clothing > Coats & Jackets' },
  { id: '11483', name: 'Jeans', path: 'Clothing, Shoes & Accessories > Men\'s Clothing > Pants > Jeans' },
  { id: '57989', name: 'Shorts', path: 'Clothing, Shoes & Accessories > Men\'s Clothing > Shorts' }
];

/**
 * eBay Trading API DetailLevel Options
 * Controls how much data is returned from GetItem/GetSellerList
 */
export const DETAIL_LEVELS = {
  ReturnAll: 'Returns most available fields',
  ItemReturnDescription: 'Includes item description',
  ItemReturnAttributes: 'Includes item-specific attributes',
  ItemReturnCategories: 'Includes category information'
} as const;

/**
 * Required Item Specifics by Category
 * These fields must be provided when creating listings
 */
export interface ItemSpecific {
  name: string;
  required: boolean;
  values?: string[];
}

export const MENS_CLOTHING_SPECIFICS: ItemSpecific[] = [
  { name: 'Brand', required: true },
  { name: 'Size Type', required: true, values: ['Regular', 'Big & Tall', 'Petite', 'Plus', 'Maternity'] },
  { name: 'Size', required: true },
  { name: 'Color', required: false },
  { name: 'Material', required: false, values: ['Cotton', 'Polyester', 'Nylon', 'Wool', 'Leather', 'Synthetic'] },
  { name: 'Style', required: false },
  { name: 'Fit', required: false, values: ['Regular', 'Slim', 'Relaxed', 'Athletic'] },
  { name: 'Sleeve Length', required: false, values: ['Short Sleeve', 'Long Sleeve', '3/4 Sleeve', 'Sleeveless'] }
];

/**
 * eBay Shipping Service Codes
 * https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/ShippingServiceCodeType.html
 */
export const SHIPPING_SERVICES = {
  domestic: [
    { code: 'USPSFirstClass', name: 'USPS First Class Mail', type: 'domestic' },
    { code: 'USPSPriority', name: 'USPS Priority Mail', type: 'domestic' },
    { code: 'USPSPriorityFlatRateEnvelope', name: 'USPS Priority Flat Rate Envelope', type: 'domestic' },
    { code: 'USPSPriorityFlatRateBox', name: 'USPS Priority Flat Rate Box', type: 'domestic' },
    { code: 'USPSMedia', name: 'USPS Media Mail', type: 'domestic' },
    { code: 'UPSGround', name: 'UPS Ground', type: 'domestic' },
    { code: 'FedExHomeDelivery', name: 'FedEx Home Delivery', type: 'domestic' }
  ],
  international: [
    { code: 'USPSFirstClassMailInternational', name: 'USPS First Class Mail International', type: 'international' },
    { code: 'USPSPriorityMailInternational', name: 'USPS Priority Mail International', type: 'international' },
    { code: 'USPSExpressMailInternational', name: 'USPS Express Mail International', type: 'international' }
  ]
};

/**
 * eBay Return Policy Durations
 */
export const RETURN_DURATIONS = [
  { value: 'Days_14', label: '14 days' },
  { value: 'Days_30', label: '30 days' },
  { value: 'Days_60', label: '60 days' },
  { value: 'Days_90', label: '90 days' }
];

/**
 * Helper: Get condition by ID
 */
export function getConditionById(conditionId: string): EbayCondition | undefined {
  return ITEM_CONDITIONS.find(c => c.id === conditionId);
}

/**
 * Helper: Get listing format by type
 */
export function getListingFormat(type: string): EbayListingFormat | undefined {
  return LISTING_FORMATS.find(f => f.type === type);
}

/**
 * Helper: Get category by ID
 */
export function getCategoryById(categoryId: string): EbayCategory | undefined {
  return CLOTHING_CATEGORIES.find(c => c.id === categoryId);
}

/**
 * Helper: Validate item specifics for mens clothing
 */
export function validateItemSpecifics(specifics: Record<string, string>): {
  valid: boolean;
  missing: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const spec of MENS_CLOTHING_SPECIFICS) {
    if (spec.required && !specifics[spec.name]) {
      missing.push(spec.name);
    }

    if (spec.values && specifics[spec.name] && !spec.values.includes(specifics[spec.name])) {
      warnings.push(`${spec.name}: "${specifics[spec.name]}" is not a standard value`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings
  };
}
