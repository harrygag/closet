/**
 * eBay Offer API Types
 * Based on eBay Inventory API v1 - Offer endpoints
 * https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods
 */

// Marketplace identifiers
export type MarketplaceId = 'EBAY_US' | 'EBAY_UK' | 'EBAY_DE' | 'EBAY_AU' | 'EBAY_CA' | 'EBAY_FR' | 'EBAY_IT' | 'EBAY_ES';

// Listing format types
export type ListingFormat = 'FIXED_PRICE' | 'AUCTION';

// Listing duration options
export type ListingDuration = 'GTC' | 'DAYS_1' | 'DAYS_3' | 'DAYS_5' | 'DAYS_7' | 'DAYS_10' | 'DAYS_21' | 'DAYS_30';

// Offer status
export type OfferStatus = 'UNPUBLISHED' | 'PUBLISHED' | 'ENDED';

// Amount (price) type
export interface Amount {
  value: string; // Numeric value as string (e.g., "49.99")
  currency: string; // Currency code (e.g., "USD")
}

// Best Offer configuration
export interface BestOfferTerms {
  bestOfferEnabled: boolean;
  autoAcceptPrice?: Amount;
  autoDeclinePrice?: Amount;
}

// Shipping cost override
export interface ShippingCostOverride {
  shippingServiceType: 'DOMESTIC' | 'INTERNATIONAL';
  priority: number;
  shippingCost: Amount;
  additionalShippingCost?: Amount;
}

// Listing policies (required for publishing)
export interface ListingPolicies {
  fulfillmentPolicyId: string; // Shipping policy ID
  paymentPolicyId: string; // Payment policy ID
  returnPolicyId: string; // Return policy ID
  bestOfferTerms?: BestOfferTerms;
  shippingCostOverrides?: ShippingCostOverride[];
}

// Pricing summary
export interface PricingSummary {
  price: Amount;
  minimumAdvertisedPrice?: Amount;
  originalRetailPrice?: Amount;
  auctionStartPrice?: Amount; // For auction format
  auctionReservePrice?: Amount; // For auction format
}

// Tax configuration
export interface Tax {
  applyTax: boolean;
  thirdPartyTaxCategory?: string;
  vatPercentage?: number;
}

// Create Offer Request
export interface CreateOfferRequest {
  sku: string; // Required - links to inventory item
  marketplaceId: MarketplaceId; // Required
  format: ListingFormat; // Required
  availableQuantity?: number; // Quantity available for sale
  categoryId?: string; // eBay category ID
  secondaryCategoryId?: string; // Optional second category
  listingDescription?: string; // HTML description
  listingDuration?: ListingDuration; // Default: GTC (Good 'Til Cancelled)
  listingPolicies?: ListingPolicies; // Required before publishing
  listingStartDate?: string; // ISO 8601 format
  merchantLocationKey?: string; // Inventory location
  pricingSummary?: PricingSummary; // Required before publishing
  quantityLimitPerBuyer?: number; // Max quantity per buyer
  storeCategoryNames?: string[]; // eBay store categories
  tax?: Tax;
  hideBuyerDetails?: boolean;
  includeCatalogProductDetails?: boolean;
}

// Update Offer Request (cannot change sku, marketplaceId, format)
export interface UpdateOfferRequest extends Omit<CreateOfferRequest, 'sku' | 'marketplaceId' | 'format'> {}

// Offer Response (after create)
export interface OfferResponse {
  offerId: string;
  warnings?: ErrorDetail[];
}

// Publish Offer Response
export interface PublishOfferResponse {
  listingId: string; // eBay item ID
  warnings?: ErrorDetail[];
}

// Complete Offer object (from GET)
export interface Offer {
  offerId: string;
  sku: string;
  marketplaceId: MarketplaceId;
  format: ListingFormat;
  status: OfferStatus;
  availableQuantity: number;
  categoryId: string;
  listing?: {
    listingId: string; // eBay item ID
    listingStatus: string;
    soldQuantity: number;
  };
  listingDescription: string;
  listingDuration: ListingDuration;
  listingPolicies: ListingPolicies;
  merchantLocationKey: string;
  pricingSummary: PricingSummary;
  quantityLimitPerBuyer?: number;
  storeCategoryNames?: string[];
  tax?: Tax;
  hideBuyerDetails?: boolean;
  includeCatalogProductDetails?: boolean;
}

// Offers collection response (paginated)
export interface OffersResponse {
  href: string;
  limit: number;
  next?: string;
  offset: number;
  prev?: string;
  size: number;
  total: number;
  offers: Offer[];
}

// Error detail from eBay API
export interface ErrorDetail {
  category: string;
  domain: string;
  errorId: number;
  inputRefIds?: string[];
  longMessage: string;
  message: string;
  outputRefIds?: string[];
  parameters?: { name: string; value: string }[];
  subdomain: string;
}

// Business Policies Types
export interface FulfillmentPolicy {
  fulfillmentPolicyId: string;
  name: string;
  description?: string;
  marketplaceId: string;
  categoryTypes: { name: string }[];
  handlingTime: { value: number; unit: string };
}

export interface ReturnPolicy {
  returnPolicyId: string;
  name: string;
  description?: string;
  marketplaceId: string;
  returnsAccepted: boolean;
  returnPeriod?: { value: number; unit: string };
  returnShippingCostPayer?: 'BUYER' | 'SELLER';
}

export interface PaymentPolicy {
  paymentPolicyId: string;
  name: string;
  description?: string;
  marketplaceId: string;
  categoryTypes: { name: string }[];
}

export interface InventoryLocation {
  merchantLocationKey: string;
  name?: string;
  location: {
    address: {
      city?: string;
      stateOrProvince?: string;
      postalCode?: string;
      country: string;
    };
  };
  merchantLocationStatus: 'ENABLED' | 'DISABLED';
}
