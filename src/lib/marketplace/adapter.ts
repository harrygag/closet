/**
 * Marketplace Adapter Interface
 *
 * Provides a pluggable abstraction for publishing listings to different marketplaces.
 * Each marketplace (eBay, Poshmark, etc.) implements this interface.
 */

export interface MarketplaceAdapter {
  /** Marketplace identifier */
  readonly marketplace: string;

  /** Human-friendly name */
  readonly displayName: string;

  /** Sandbox/test mode flag */
  readonly sandboxMode: boolean;

  /** Rate limit policy */
  readonly rateLimitPolicy: RateLimitPolicy;

  /**
   * Validate a listing payload against marketplace-specific rules
   * Returns validation errors and warnings
   */
  validate(listing: NormalizedListing): Promise<ValidationResult>;

  /**
   * Map normalized listing to marketplace-specific payload
   * Handles field mappings, category conversions, etc.
   */
  mapToPayload(
    listing: NormalizedListing,
    account: MarketplaceAccount
  ): Promise<MarketplacePayload>;

  /**
   * Create a new listing on the marketplace
   * Should be idempotent when provided same idempotencyKey
   */
  create(
    payload: MarketplacePayload,
    account: MarketplaceAccount,
    idempotencyKey: string
  ): Promise<CreateListingResult>;

  /**
   * Update an existing listing
   */
  update(
    externalListingId: string,
    payload: MarketplacePayload,
    account: MarketplaceAccount
  ): Promise<UpdateListingResult>;

  /**
   * Delete/delist a listing
   */
  delete(
    externalListingId: string,
    account: MarketplaceAccount
  ): Promise<DeleteListingResult>;

  /**
   * Parse marketplace API error into normalized format
   * Determines if error is retryable
   */
  parseError(rawResponse: any): NormalizedError;

  /**
   * Estimate marketplace fees for a listing
   */
  estimateFees(
    listing: NormalizedListing,
    account: MarketplaceAccount
  ): Promise<FeeEstimate>;

  /**
   * Refresh OAuth tokens if needed
   */
  refreshTokens?(account: MarketplaceAccount): Promise<RefreshedTokens>;
}

/**
 * Normalized listing format (canonical representation)
 */
export interface NormalizedListing {
  itemId: string;
  title: string;
  description: string;
  priceCents: number;
  category: string; // Our internal category
  subcategory?: string;
  brand?: string;
  size?: string;
  color?: string;
  colorHex?: string;
  material?: string;
  condition: 'NWT' | 'NWOT' | 'Excellent' | 'Good' | 'Fair' | 'Poor';
  conditionNotes?: string;
  defects?: Array<{
    type: string;
    severity: 'minor' | 'moderate' | 'major';
    location?: string;
    description: string;
  }>;
  images: Array<{
    url: string;
    isPrimary: boolean;
    order: number;
  }>;
  shippingPreset?: {
    carrier: string;
    serviceName: string;
    cost Cents: number;
    deliveryDays: number;
  };
  tags?: string[];
  measurements?: Record<string, string>;
}

/**
 * Marketplace-specific payload (varies per marketplace)
 */
export type MarketplacePayload = Record<string, any>;

/**
 * Marketplace account with OAuth credentials
 */
export interface MarketplaceAccount {
  id: string;
  userId: string;
  marketplace: string;
  accountName: string;
  externalAccountId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  isActive: boolean;
  dailyPublishCount: number;
  dailyPublishLimit: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  warnings: ValidationMessage[];
  errors: ValidationMessage[];
}

export interface ValidationMessage {
  field?: string;
  message: string;
  code?: string;
  suggestedFix?: string;
}

/**
 * Create listing result
 */
export interface CreateListingResult {
  success: boolean;
  externalListingId: string;
  externalUrl?: string;
  rawResponse: any;
  metadata?: Record<string, any>;
}

/**
 * Update listing result
 */
export interface UpdateListingResult {
  success: boolean;
  externalListingId: string;
  externalUrl?: string;
  rawResponse: any;
}

/**
 * Delete listing result
 */
export interface DeleteListingResult {
  success: boolean;
  rawResponse: any;
}

/**
 * Normalized error
 */
export interface NormalizedError {
  code: string;
  message: string;
  retryable: boolean;
  rateLimitExceeded?: boolean;
  retryAfterSeconds?: number;
  rawError?: any;
}

/**
 * Fee estimate
 */
export interface FeeEstimate {
  listingFeeCents: number;
  finalValueFeeCents: number;
  paymentProcessingFeeCents: number;
  totalFeeCents: number;
  sellerPayoutCents: number;
  breakdown: Array<{
    name: string;
    amountCents: number;
    description?: string;
  }>;
}

/**
 * Refreshed tokens
 */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

/**
 * Rate limit policy
 */
export interface RateLimitPolicy {
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  retryAfterOn429: boolean;
  circuitBreakerThreshold: number; // Number of failures before opening circuit
  circuitBreakerTimeout: number; // Seconds to wait before retrying
}

/**
 * Marketplace feature flags
 */
export interface MarketplaceFeatures {
  supportsVariations: boolean;
  supportsScheduledListing: boolean;
  supportsPromotions: boolean;
  maxImages: number;
  maxImageSizeBytes: number;
  allowsHTML: boolean;
  allowsEmojis: boolean;
  requiresCateg oryMapping: boolean;
}

/**
 * Base adapter class with common utilities
 */
export abstract class BaseMarketplaceAdapter implements MarketplaceAdapter {
  abstract readonly marketplace: string;
  abstract readonly displayName: string;
  abstract readonly sandboxMode: boolean;
  abstract readonly rateLimitPolicy: RateLimitPolicy;

  /**
   * HTTP client with retry logic and rate limiting
   */
  protected async request<T>(
    method: string,
    url: string,
    options: {
      headers?: Record<string, string>;
      body?: any;
      idempotencyKey?: string;
    } = {}
  ): Promise<T> {
    // Implement in actual adapter with:
    // - Rate limiting
    // - Retry with exponential backoff
    // - Circuit breaker
    // - Request/response logging
    throw new Error('Not implemented');
  }

  /**
   * Sanitize response for logging (remove sensitive data)
   */
  protected sanitizeResponse(response: any): any {
    // Remove tokens, credentials, PII
    const sanitized = { ...response };
    delete sanitized.access_token;
    delete sanitized.refresh_token;
    delete sanitized.password;
    return sanitized;
  }

  /**
   * Check if account needs token refresh
   */
  protected needsTokenRefresh(account: MarketplaceAccount): boolean {
    if (!account.tokenExpiresAt) return false;
    const expiresIn = account.tokenExpiresAt.getTime() - Date.now();
    return expiresIn < 5 * 60 * 1000; // Refresh if expires in < 5 minutes
  }

  // Abstract methods to implement
  abstract validate(listing: NormalizedListing): Promise<ValidationResult>;
  abstract mapToPayload(listing: NormalizedListing, account: MarketplaceAccount): Promise<MarketplacePayload>;
  abstract create(payload: MarketplacePayload, account: MarketplaceAccount, idempotencyKey: string): Promise<CreateListingResult>;
  abstract update(externalListingId: string, payload: MarketplacePayload, account: MarketplaceAccount): Promise<UpdateListingResult>;
  abstract delete(externalListingId: string, account: MarketplaceAccount): Promise<DeleteListingResult>;
  abstract parseError(rawResponse: any): NormalizedError;
  abstract estimateFees(listing: NormalizedListing, account: MarketplaceAccount): Promise<FeeEstimate>;
}
