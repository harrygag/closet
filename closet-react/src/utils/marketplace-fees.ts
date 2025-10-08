// Marketplace fee calculations

export interface FeeCalculation {
  listingPrice: number;
  fees: number;
  netProfit: number;
  breakdown: string;
}

/**
 * Calculate Poshmark fees
 * Under $15: $2.95 flat fee
 * $15+: 20% commission
 */
export const calculatePoshmarkFees = (price: number): FeeCalculation => {
  const fees = price < 15 ? 2.95 : price * 0.20;
  return {
    listingPrice: price,
    fees: parseFloat(fees.toFixed(2)),
    netProfit: parseFloat((price - fees).toFixed(2)),
    breakdown: price < 15 ? '$2.95 flat fee' : '20% commission'
  };
};

/**
 * Calculate Depop fees
 * 3.3% + $0.45 payment processing fee
 * No seller commission (as of July 2024)
 */
export const calculateDepopFees = (price: number): FeeCalculation => {
  const fees = (price * 0.033) + 0.45;
  return {
    listingPrice: price,
    fees: parseFloat(fees.toFixed(2)),
    netProfit: parseFloat((price - fees).toFixed(2)),
    breakdown: '3.3% + $0.45 processing'
  };
};

/**
 * Calculate eBay fees
 * Average 13% final value fee + $0.40 per order (for sales over $10)
 * Note: Actual fees vary by category (7-15%)
 */
export const calculateEbayFees = (price: number): FeeCalculation => {
  const finalValueFee = price * 0.13; // 13% average
  const perOrderFee = price > 10 ? 0.40 : 0;
  const fees = finalValueFee + perOrderFee;
  return {
    listingPrice: price,
    fees: parseFloat(fees.toFixed(2)),
    netProfit: parseFloat((price - fees).toFixed(2)),
    breakdown: price > 10 ? '13% + $0.40' : '13% fee'
  };
};

/**
 * Calculate Mercari fees
 * 10% selling fee + 2.9% + $0.30 payment processing
 */
export const calculateMercariFees = (price: number): FeeCalculation => {
  const sellingFee = price * 0.10;
  const processingFee = (price * 0.029) + 0.30;
  const fees = sellingFee + processingFee;
  return {
    listingPrice: price,
    fees: parseFloat(fees.toFixed(2)),
    netProfit: parseFloat((price - fees).toFixed(2)),
    breakdown: '10% + 2.9% + $0.30'
  };
};

/**
 * Calculate Grailed fees
 * 9% commission + payment processing (assume 3%)
 */
export const calculateGrailedFees = (price: number): FeeCalculation => {
  const commission = price * 0.09;
  const processing = price * 0.03;
  const fees = commission + processing;
  return {
    listingPrice: price,
    fees: parseFloat(fees.toFixed(2)),
    netProfit: parseFloat((price - fees).toFixed(2)),
    breakdown: '9% + 3% processing'
  };
};

/**
 * Get fee calculation for any marketplace
 */
export const calculateMarketplaceFees = (
  marketplace: string,
  price: number
): FeeCalculation => {
  switch (marketplace.toLowerCase()) {
    case 'poshmark':
      return calculatePoshmarkFees(price);
    case 'depop':
      return calculateDepopFees(price);
    case 'ebay':
      return calculateEbayFees(price);
    case 'mercari':
      return calculateMercariFees(price);
    case 'grailed':
      return calculateGrailedFees(price);
    default:
      // Default: 10% + 3% processing
      const fees = price * 0.13;
      return {
        listingPrice: price,
        fees: parseFloat(fees.toFixed(2)),
        netProfit: parseFloat((price - fees).toFixed(2)),
        breakdown: '13% estimated'
      };
  }
};
