// eBay Photo with Firebase Storage backup
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
