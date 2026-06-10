export interface EbayListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  imageUrl?: string;
  listingUrl: string;
  quantity: number;
  quantitySold?: number;
  format: string;
  categoryName?: string;
  // Extended fields for copy/paste relisting - FULL DATA from eBay API
  description?: string; // Complete eBay listing description
  subtitle?: string;
  condition?: string;
  conditionID?: string;
  conditionDescription?: string;
  primaryCategoryID?: string;
  primaryCategoryName?: string;
  itemSpecifics?: Record<string, string | string[]>; // ALL item attributes (Brand, Size, Color, etc.)
  pictureURLs?: string[]; // ALL images from eBay (for exact relisting)

  // CRITICAL for relisting - shipping, returns, payment methods
  shippingInfo?: any; // EbayShippingInfo from Cloud Function
  returnPolicy?: any; // EbayReturnPolicy from Cloud Function
  paymentMethods?: string[]; // Accepted payment methods
  buyerRequirements?: any; // EbayBuyerRequirements from Cloud Function
  itemLocation?: any; // EbayItemLocation from Cloud Function

  // Listing dates
  endTime?: string;

  // Additional product identifiers (UPC, EAN, ISBN, MPN, Brand, Manufacturer)
  upc?: string;
  ean?: string;
  isbn?: string;
  mpn?: string;
  brand?: string;
  manufacturer?: string;

  // Best offer settings
  bestOfferEnabled?: boolean;
  autoAcceptPrice?: number;
  autoDeclinePrice?: number;

  // Auction details
  reservePrice?: number;
  hasReservePrice?: boolean;

  // Seller metadata
  sellerNotes?: string;
  listingStatus?: string;

  // Engagement metrics
  watchCount?: number;
  hitCount?: number;

  // Tax and billing details
  salesTaxIncluded?: string;

  // Bidding details
  biddingDetails?: string;
  highestBidderUserID?: string;
}

// Full eBay Trading API Listing with all fields for relisting
export interface FullEbayListing {
  itemId: string;
  title: string;
  currentPrice: number;
  currency: string;
  quantity: number;
  listingType: string; // FixedPriceItem, Auction, etc.
  viewItemURL: string; // eBay listing URL
  pictureURL: string; // Primary image
  pictureURLs: string[]; // ALL images (critical for relisting)
  sku: string;
  condition: string; // Condition display name
  conditionID?: string;
  startTime?: string; // When listing was created
  description?: string; // Full description text
  primaryCategoryID?: string;
  primaryCategoryName?: string;
  itemSpecifics?: Record<string, string | string[]>; // All item attributes (Brand, Size, Color, etc.)
}

export interface EbayConnection {
  connected: boolean;
  expiresAt?: string;
}

export interface ImportResult {
  imported: string[];
  skipped: string[];
  errors: Array<{ itemId: string; error: string }>;
}



