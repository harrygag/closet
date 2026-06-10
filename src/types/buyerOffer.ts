/**
 * Buyer Offer Types
 * For sending promotional offers to interested buyers/watchers
 */

export interface BuyerOfferRequest {
  itemId: string; // eBay item ID
  discountPercent: number; // Percentage off (e.g., 10 for 10% off)
  duration: number; // Offer duration in hours (default 48)
  message?: string; // Optional message to buyers
}

export interface Watcher {
  userId: string;
  username?: string;
  watchDate: string;
  canSendOffer: boolean;
}

export interface BuyerOfferResult {
  success: boolean;
  itemId: string;
  offersSent: number;
  errors?: string[];
}

export interface MarketTrend {
  itemId: string;
  currentPrice: number;
  avgSoldPrice: number;
  suggestedDiscount: number;
  competitorPrices: number[];
}
