// TypeScript types for the closet management application

export type ItemStatus = 'Active' | 'Inactive' | 'SOLD';

export type ItemTag = 'Hoodie' | 'Jersey' | 'Polo' | 'Pullover/Jackets' | 'T-shirts' | 'Bottoms';

export type MarketplaceType = 'ebay' | 'poshmark' | 'mercari' | 'depop' | 'facebook' | 'whatnot' | 'grailed' | 'other';

export interface MarketplaceUrl {
  type: MarketplaceType;
  url: string;
  price?: number; // Optional price for this specific marketplace
}

// eBay Photos with Firebase Storage backup
export interface EbayPhoto {
  ebayUrl: string; // Original eBay URL (may expire)
  firebaseStorageUrl?: string; // Permanent backup URL
  firebaseStoragePath?: string; // gs://bucket/path
  order: number; // Photo sequence (0, 1, 2...)
  isPrimary: boolean; // Is this the first photo?
  filename?: string; // Original filename
  uploadedAt?: number; // Timestamp when backed up
  size?: number; // Bytes
  mimeType?: string; // image/jpeg, etc.
}

// eBay Shipping Configuration
export interface EbayShippingService {
  name: string; // UPS Ground, USPS Priority, etc.
  cost: number; // In cents
  additionalCost?: number; // Per additional item, in cents
  expedited?: boolean; // Is expedited?
  priority: number; // Order (1, 2, 3...)
}

export interface EbayShippingInfo {
  shippingType: 'Flat' | 'Calculated' | 'Free' | 'NotSpecified';
  services: EbayShippingService[];
  handlingTime: number; // Days to ship
  weight?: {
    major: number; // Whole weight
    minor: number; // Fraction part (e.g., 8 for 2.8 lbs)
    unit: 'lbs' | 'kg';
  };
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'Inches' | 'Centimeters';
  };
  excludeLocations?: string[]; // ["Worldwide", "APO/FPO", country codes]
  shipToLocations?: string[]; // ["US", "CA", "MX"]
  freeShipping: boolean;
}

// eBay Return Policy
export interface EbayReturnPolicy {
  returnsAccepted: boolean;
  returnsWithin?: 'Days_30' | 'Days_60' | 'Days_90' | 'MoneyBack';
  refundType?: 'MoneyBack' | 'MoneyBackOrExchange' | 'MoneyBackOrReplacement';
  shippingCostPaidBy?: 'Buyer' | 'Seller';
  restockingFeePercent?: number; // 0-100
  restockingFeeShipping?: boolean;
}

// eBay Buyer Requirements
export interface EbayBuyerRequirements {
  minimumFeedbackScore?: number;
  linkedPayPalRequired?: boolean;
  blockedBuyerEmails?: string[];
  shipToRegistrationCountryOnly?: boolean;
}

// eBay Item Location
export interface EbayItemLocation {
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

// Physical Location Tracking (for inventory management)
export interface PhysicalLocation {
  zone: string; // e.g., "A", "B", "C"
  shelf: string; // e.g., "1", "2", "3"
  bin?: string; // Optional bin number
}

// Verification Status (for scanning workflow)
export type VerificationStatus = 'verified' | 'needs-verification' | 'overdue';

// Stock and sales tracking
export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'SOLD';
export type SoldPlatform = 'ebay' | 'poshmark' | 'depop' | 'facebook' | 'whatnot' | 'in_person' | 'other';

export interface Item {
  id: string;
  name: string;
  size: string;
  status: ItemStatus;
  hangerStatus: string;
  hangerId: string;
  tags: ItemTag[];
  ebayUrl?: string; // eBay listing URL
  poshmarkUrl?: string; // Poshmark listing URL
  depopUrl?: string; // Depop listing URL
  marketplaceUrls?: MarketplaceUrl[]; // Additional marketplace links
  imageUrl?: string; // Item image from Notion or uploaded
  costPrice: number;
  sellingPrice: number;
  manualPriceCents?: number; // Manual price override in cents (takes precedence over sellingPrice)
  ebayFees: number;
  netProfit: number;
  dateField: string;
  notes: string;
  dateAdded: string;
  position?: number; // For drag-and-drop ordering
  barcode?: string; // Barcode for printing labels

  // === FULL eBay LISTING DATA ===
  // Primary eBay Identifiers
  ebayListingId?: string; // itemId - unique identifier
  ebayItemId?: string; // Alias for ebayListingId
  ebaySku?: string; // SKU from eBay

  // Complete eBay Description & Details
  ebayFullTitle?: string; // Original eBay title
  ebaySubtitle?: string; // eBay listing subtitle (max 55 chars)
  ebayFullDescription?: string; // Complete eBay description (HTML or text)
  ebayCondition?: string; // Item condition (New, Like New, Good, Fair, For Parts)
  ebayConditionID?: string; // Condition code (3000, 4000, etc.)
  ebayConditionDescription?: string; // Seller's condition notes
  ebayListingType?: string; // FixedPriceItem, Auction, etc.

  // eBay Pricing (original)
  ebayPrice?: number; // Original eBay price (in cents)
  ebayCurrency?: string; // Currency code (USD, GBP, etc.)
  ebayQuantity?: number; // Available quantity
  ebayQuantitySold?: number; // How many sold
  // True when the last Check Quantity run could not find this listing on eBay
  // (ended / private / banned). Closet row shows ✕ instead of the blue "e".
  ebayDelisted?: boolean;
  // Per-item baseline (Linear 444-142). Seeded by handleCalibrateBaseline. User's
  // rule: "I don't update stock manually, so any decrease in ebayQuantity since
  // baseline is a sale." Reconciler reads:
  //   ebaySalesSinceBaseline = max(0, ebayQuantityAtBaseline - ebayQuantity)
  //   OR ebayQuantityAtBaseline if ebayDelisted (entire listing assumed sold via eBay)
  ebayQuantityAtBaseline?: number;
  physicalQuantityAtBaseline?: number;
  baselineCalibratedAt?: string; // ISO timestamp of the calibrate run that seeded this

  // eBay Category & Taxonomy
  ebayCategoryID?: string; // Primary category ID
  ebayCategoryName?: string; // Primary category name
  ebaySubcategoryID?: string; // Subcategory ID if applicable
  ebaySubcategoryName?: string; // Subcategory name
  ebayStoreCategoryID?: string; // Store category ID if applicable
  ebayStoreCategoryName?: string; // Store category name

  // eBay Item Specifics (structured attributes - varies by category)
  ebayItemSpecifics?: Record<string, string | string[]>; // All item specifics (Brand, Size, Color, Material, etc.)

  // eBay Photos with Firebase Storage backup (CRITICAL FOR RELISTING)
  ebayPhotos?: EbayPhoto[]; // All photos with backup URLs
  ebayAllImages?: string[]; // ALL original eBay image URLs (for reference)
  ebayPrimaryImage?: string; // First/primary image URL

  // eBay Shipping Configuration (CRITICAL FOR RELISTING)
  ebayShippingInfo?: EbayShippingInfo;

  // eBay Return Policy (CRITICAL FOR RELISTING)
  ebayReturnPolicy?: EbayReturnPolicy;

  // eBay Payment Methods
  ebayPaymentMethods?: string[]; // Accepted payment methods (PayPal, CreditCard, etc.)

  // eBay Buyer Requirements
  ebayBuyerRequirements?: EbayBuyerRequirements;

  // eBay Item Location
  ebayItemLocation?: EbayItemLocation;

  // Additional eBay metadata
  ebayListingStartDate?: string; // When listing was created
  ebayListingEndDate?: string; // When listing ends/ended
  ebayFormat?: string; // Format type
  ebaySellerInfo?: Record<string, any>; // Seller information

  // Product Identifiers
  ebayUPC?: string; // Universal Product Code
  ebayEAN?: string; // European Article Number
  ebayISBN?: string; // International Standard Book Number
  ebayMPN?: string; // Manufacturer Part Number
  ebayBrand?: string; // Brand name
  ebayManufacturer?: string; // Manufacturer name

  // Best Offer Settings
  ebayBestOfferEnabled?: boolean; // Whether best offer is enabled
  ebayAutoAcceptPrice?: number; // Auto-accept price in cents
  ebayAutoDeclinePrice?: number; // Auto-decline price in cents

  // Auction Details
  ebayReservePrice?: number; // Reserve price in cents
  ebayHasReservePrice?: boolean; // Whether reserve was met

  // Seller Metadata
  ebaySellerNotes?: string; // Seller's internal notes
  ebayListingStatus?: string; // Active, Ended, etc.

  // Engagement Metrics
  ebayWatchCount?: number; // Number of watchers
  ebayHitCount?: number; // Number of page views

  // Tax and Billing
  ebaySalesTaxIncluded?: string; // Tax information

  // === INVENTORY SCANNING & TRACKING ===
  // Cached from ActivityLog (for performance)
  lastScannedDate?: string; // ISO timestamp of last scan
  lastCheckInDate?: string; // ISO timestamp of last check-in
  scanCount?: number; // Total number of scans

  // Physical location tracking
  physicalLocation?: PhysicalLocation;

  // Computed verification status
  verificationStatus?: VerificationStatus;

  // Delisting confirmation (for sold items)
  delistedConfirmed?: boolean; // Whether user confirmed item was delisted from marketplaces
  delistedConfirmedAt?: string; // ISO timestamp when confirmed

  // Jersey / Apparel details
  jerseyNumber?: string; // Jersey number (e.g., "23", "00")

  // === PHYSICAL INVENTORY & MULTI-PLATFORM QUANTITIES ===
  // Physical inventory (separate from marketplace quantities)
  physicalQuantity?: number; // What you physically have. Default: ebayQuantity || 1
  stockStatus?: StockStatus;

  // Multi-platform quantities
  poshmarkQuantity?: number;
  depopQuantity?: number;
  facebookQuantity?: number;
  poshmarkListingId?: string;
  depopListingId?: string;
  facebookListingId?: string;
  facebookUrl?: string;
  // Stamped by importFacebookItems when an Item is bound to a FB listing
  // (mirrors poshmarkImportedAt/depopImportedAt). Cleared by clearBindings on
  // delist/mark-handled.
  facebookImportedAt?: string;
  facebookDelistedAt?: string;
  // Whatnot bindings (mirror the facebook block). Whatnot sales reduce real
  // stock via unitSales platform='whatnot'.
  whatnotQuantity?: number;
  whatnotListingId?: string;
  whatnotUrl?: string;
  whatnotImportedAt?: string;
  whatnotDelistedAt?: string;

  // === SOLD TRACKING ===
  soldPlatform?: SoldPlatform;
  receivedDate?: string; // When stock was received/added

  // Unit-level sales (the "dots" — one entry per unit sold)
  unitSales?: Array<{
    soldAt: string; // ISO timestamp
    platform: string; // ebay/poshmark/depop/in_person
    priceCents: number; // Sale price for this unit
    note?: string;
  }>;

  // === ACTIVITY TRAIL ===
  // Per-item audit log, capped at 50
  itemActivity?: Array<{
    action: string; // 'SCAN' | 'SOLD' | 'QTY_CHANGE' | 'PRICE_CHANGE' | 'STOCK_ADDED' | 'EBAY_SYNC' | 'STATUS_CHANGE' | 'LISTED' | 'DELISTED'
    timestamp: string; // ISO timestamp
    details: string; // Human-readable description
    oldValue?: string; // Before value (stringified)
    newValue?: string; // After value (stringified)
  }>;

  // Cross-platform linking
  linkedGroupId?: string;          // eBay listing ID that anchors this group
  linkedGroupRole?: 'anchor' | 'child';
  canonicalQty?: number;           // Source of truth quantity from eBay
}

export interface ItemFormData {
  name: string;
  size: string;
  status: ItemStatus;
  hangerStatus: string;
  hangerId: string;
  tags: ItemTag[];
  ebayUrl: string;
  costPrice: number;
  sellingPrice: number;
  ebayFees: number;
  netProfit: number;
  dateField: string;
  notes: string;
}

export interface ItemStats {
  totalItems: number;
  activeItems: number;
  inactiveItems: number;
  soldItems: number;
  totalValue: number;
  totalProfit: number;
  averageProfit: number;
}

export interface FilterOptions {
  status: ItemStatus | 'All';
  tags: ItemTag[];
  searchQuery: string;
}

export interface SortOption {
  field: keyof Item;
  direction: 'asc' | 'desc';
}
