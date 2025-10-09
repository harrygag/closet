/**
 * eBay Marketplace Adapter
 *
 * Implements the MarketplaceAdapter interface for eBay's Sell API
 * Uses OAuth 2.0 for authentication and follows eBay's best practices
 */

import {
  BaseMarketplaceAdapter,
  type NormalizedListing,
  type MarketplaceAccount,
  type MarketplacePayload,
  type ValidationResult,
  type CreateListingResult,
  type UpdateListingResult,
  type DeleteListingResult,
  type NormalizedError,
  type FeeEstimate,
  type RateLimitPolicy,
} from '../adapter';

export class EbayAdapter extends BaseMarketplaceAdapter {
  readonly marketplace = 'ebay';
  readonly displayName = 'eBay';
  readonly sandboxMode: boolean;

  readonly rateLimitPolicy: RateLimitPolicy = {
    maxRequestsPerSecond: 5,
    maxRequestsPerMinute: 200,
    maxRequestsPerHour: 5000,
    retryAfterOn429: true,
    circuitBreakerThreshold: 10,
    circuitBreakerTimeout: 300, // 5 minutes
  };

  private readonly apiBase: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(config: {
    sandboxMode?: boolean;
    clientId: string;
    clientSecret: string;
  }) {
    super();
    this.sandboxMode = config.sandboxMode ?? false;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.apiBase = this.sandboxMode
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com';
  }

  /**
   * Validate listing against eBay requirements
   */
  async validate(listing: NormalizedListing): Promise<ValidationResult> {
    const warnings: Array<{ field?: string; message: string; suggestedFix?: string }> = [];
    const errors: Array<{ field?: string; message: string; suggestedFix?: string }> = [];

    // Title validation
    if (!listing.title || listing.title.trim().length === 0) {
      errors.push({
        field: 'title',
        message: 'Title is required',
      });
    } else if (listing.title.length > 80) {
      errors.push({
        field: 'title',
        message: 'Title must be 80 characters or less',
        suggestedFix: `Shorten to: ${listing.title.substring(0, 77)}...`,
      });
    }

    // Price validation
    if (!listing.priceCents || listing.priceCents < 100) {
      errors.push({
        field: 'price',
        message: 'Price must be at least $1.00',
      });
    }

    // Images validation
    if (!listing.images || listing.images.length === 0) {
      errors.push({
        field: 'images',
        message: 'At least one image is required',
      });
    } else if (listing.images.length > 12) {
      warnings.push({
        field: 'images',
        message: 'eBay supports up to 12 images',
        suggestedFix: 'Remove extra images or prioritize best ones',
      });
    }

    // Description validation
    if (!listing.description) {
      warnings.push({
        field: 'description',
        message: 'Description is empty',
        suggestedFix: 'Add detailed description for better conversion',
      });
    } else if (listing.description.length < 50) {
      warnings.push({
        field: 'description',
        message: 'Description is very short',
        suggestedFix: 'Add more details about condition, measurements, etc.',
      });
    }

    // Condition validation
    if (!listing.condition) {
      errors.push({
        field: 'condition',
        message: 'Condition is required',
      });
    }

    // Brand validation (recommended for clothing)
    if (!listing.brand) {
      warnings.push({
        field: 'brand',
        message: 'Brand is recommended for clothing listings',
        suggestedFix: 'Add brand for better searchability',
      });
    }

    // Size validation (recommended for clothing)
    if (!listing.size) {
      warnings.push({
        field: 'size',
        message: 'Size is recommended for clothing listings',
      });
    }

    // Major defects require disclosure
    const majorDefects = listing.defects?.filter(d => d.severity === 'major');
    if (majorDefects && majorDefects.length > 0) {
      warnings.push({
        field: 'condition',
        message: `${majorDefects.length} major defect(s) detected`,
        suggestedFix: 'Ensure all defects are clearly disclosed in description',
      });
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * Map normalized listing to eBay Sell API payload
   */
  async mapToPayload(
    listing: NormalizedListing,
    account: MarketplaceAccount
  ): Promise<MarketplacePayload> {
    // Map condition to eBay condition ID
    const conditionMap: Record<string, string> = {
      'NWT': '1000', // New with tags
      'NWOT': '1500', // New without tags
      'Excellent': '3000', // Used - Excellent
      'Good': '4000', // Used - Good
      'Fair': '5000', // Used - Acceptable
      'Poor': '6000', // Used - For parts
    };

    // Build description with condition notes and defects
    let fullDescription = listing.description || '';

    if (listing.conditionNotes) {
      fullDescription += `\n\n**Condition Notes:**\n${listing.conditionNotes}`;
    }

    if (listing.defects && listing.defects.length > 0) {
      fullDescription += '\n\n**Please Note:**\n';
      listing.defects.forEach(defect => {
        fullDescription += `- ${defect.description}`;
        if (defect.location) {
          fullDescription += ` (${defect.location})`;
        }
        fullDescription += '\n';
      });
    }

    // Build item specifics (eBay's structured data)
    const itemSpecifics: Array<{ name: string; value: string[] }> = [];

    if (listing.brand) {
      itemSpecifics.push({ name: 'Brand', value: [listing.brand] });
    }

    if (listing.size) {
      itemSpecifics.push({ name: 'Size', value: [listing.size] });
    }

    if (listing.color) {
      itemSpecifics.push({ name: 'Color', value: [listing.color] });
    }

    if (listing.material) {
      itemSpecifics.push({ name: 'Material', value: [listing.material] });
    }

    // Map images (limit to 12)
    const images = listing.images
      .slice(0, 12)
      .map(img => ({ imageUrl: img.url }));

    // eBay Sell API payload structure
    return {
      product: {
        title: listing.title.substring(0, 80),
        description: fullDescription,
        imageUrls: images.map(img => img.imageUrl),
        aspects: itemSpecifics.length > 0 ? {
          itemSpecifics: itemSpecifics.reduce((acc, spec) => {
            acc[spec.name] = spec.value;
            return acc;
          }, {} as Record<string, string[]>),
        } : undefined,
      },
      condition: conditionMap[listing.condition] || '3000',
      conditionDescription: listing.conditionNotes,
      availability: {
        shipToLocationAvailability: {
          quantity: 1,
        },
      },
      pricingSummary: {
        price: {
          value: (listing.priceCents / 100).toFixed(2),
          currency: 'USD',
        },
      },
      listingPolicies: {
        paymentPolicyId: account.externalAccountId, // Placeholder - seller must configure
        returnPolicyId: account.externalAccountId,
        fulfillmentPolicyId: account.externalAccountId,
      },
      // Category would be mapped based on your internal category
      // This requires a category mapping service
      categoryId: this.mapToEbayCategory(listing.category),
    };
  }

  /**
   * Create a new eBay listing
   */
  async create(
    payload: MarketplacePayload,
    account: MarketplaceAccount,
    idempotencyKey: string
  ): Promise<CreateListingResult> {
    // Check if token needs refresh
    if (this.needsTokenRefresh(account) && account.refreshToken) {
      // Refresh tokens first
      await this.refreshTokens?.(account);
    }

    const url = `${this.apiBase}/sell/inventory/v1/offer`;

    try {
      const response = await this.request('POST', url, {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          'X-EBAY-IDEMPOTENCY-KEY': idempotencyKey,
        },
        body: payload,
        idempotencyKey,
      });

      return {
        success: true,
        externalListingId: response.offerId,
        externalUrl: response.listingUrl,
        rawResponse: this.sanitizeResponse(response),
      };
    } catch (error) {
      throw this.parseError(error);
    }
  }

  /**
   * Update an existing eBay listing
   */
  async update(
    externalListingId: string,
    payload: MarketplacePayload,
    account: MarketplaceAccount
  ): Promise<UpdateListingResult> {
    const url = `${this.apiBase}/sell/inventory/v1/offer/${externalListingId}`;

    const response = await this.request('PUT', url, {
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
      body: payload,
    });

    return {
      success: true,
      externalListingId: response.offerId || externalListingId,
      externalUrl: response.listingUrl,
      rawResponse: this.sanitizeResponse(response),
    };
  }

  /**
   * Delete/end an eBay listing
   */
  async delete(
    externalListingId: string,
    account: MarketplaceAccount
  ): Promise<DeleteListingResult> {
    const url = `${this.apiBase}/sell/inventory/v1/offer/${externalListingId}/withdraw`;

    const response = await this.request('POST', url, {
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });

    return {
      success: true,
      rawResponse: this.sanitizeResponse(response),
    };
  }

  /**
   * Parse eBay API error
   */
  parseError(rawResponse: any): NormalizedError {
    const error = rawResponse.errors?.[0] || rawResponse;

    const retryableCodes = ['RATE_LIMIT_EXCEEDED', 'INTERNAL_SERVER_ERROR'];
    const retryable = retryableCodes.includes(error.errorId) || error.status >= 500;

    const rateLimitExceeded = error.errorId === 'RATE_LIMIT_EXCEEDED';
    const retryAfterSeconds = rateLimitExceeded ? 60 : undefined;

    return {
      code: error.errorId || 'UNKNOWN_ERROR',
      message: error.message || 'Unknown error occurred',
      retryable,
      rateLimitExceeded,
      retryAfterSeconds,
      rawError: this.sanitizeResponse(rawResponse),
    };
  }

  /**
   * Estimate eBay fees
   */
  async estimateFees(
    listing: NormalizedListing,
    account: MarketplaceAccount
  ): Promise<FeeEstimate> {
    const price = listing.priceCents / 100;

    // eBay fee structure (simplified - actual fees vary by category)
    const insertionFee = 35; // First 250 listings free per month, then $0.35
    const finalValueFeePercent = 0.135; // 13.5% for most categories
    const paymentProcessingFeePercent = 0.04; // 4% payment processing

    const listingFeeCents = 0; // Assuming within free listings
    const finalValueFeeCents = Math.round(listing.priceCents * finalValueFeePercent);
    const paymentProcessingFeeCents = Math.round(listing.priceCents * paymentProcessingFeePercent);

    const totalFeeCents = listingFeeCents + finalValueFeeCents + paymentProcessingFeeCents;
    const sellerPayoutCents = listing.priceCents - totalFeeCents;

    return {
      listingFeeCents,
      finalValueFeeCents,
      paymentProcessingFeeCents,
      totalFeeCents,
      sellerPayoutCents,
      breakdown: [
        { name: 'Insertion Fee', amountCents: listingFeeCents, description: '250 free per month' },
        { name: 'Final Value Fee', amountCents: finalValueFeeCents, description: '13.5% of sale price' },
        { name: 'Payment Processing', amountCents: paymentProcessingFeeCents, description: '4% of sale price' },
      ],
    };
  }

  /**
   * Map internal category to eBay category ID
   * This is a simplified example - production would use eBay's category API
   */
  private mapToEbayCategory(internalCategory: string): string {
    const categoryMap: Record<string, string> = {
      'polo': '57991', // Men's Polo Shirts
      'hoodie': '155183', // Men's Hoodies & Sweatshirts
      'shirt': '57990', // Men's Casual Shirts
      'pullover': '11484', // Men's Sweaters
      'bottoms': '57989', // Men's Pants
      'jersey': '24510', // Sports Jerseys
    };

    return categoryMap[internalCategory.toLowerCase()] || '11450'; // Default: Men's Clothing
  }

  /**
   * Refresh OAuth tokens
   */
  async refreshTokens(account: MarketplaceAccount) {
    const url = 'https://api.ebay.com/identity/v1/oauth2/token';

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken!,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw this.parseError(data);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || account.refreshToken!,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }
}
