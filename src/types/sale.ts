export type MarketplaceType = 'ebay' | 'poshmark' | 'depop' | 'in_person';

export type SaleSource =
  | 'detail_page'
  | 'sell_search'
  | 'dot_sold'
  | 'auto_ebay_sync'
  | 'scan_sales'
  | 'scan_detail'
  | 'stock_check'
  | 'bulk_status'
  | 'quantity_zero';

export interface DelistStatus {
  ebay: boolean;
  poshmark: boolean;
  depop: boolean;
}

export interface Sale {
  id: string;
  userId: string;

  // Item Reference (denormalized for display even if item deleted)
  itemId: string;
  itemName: string;
  itemImageUrl?: string;

  // Sale Details
  saleDate: string; // ISO timestamp
  salePrice: number; // Price in cents
  costPrice: number; // Cost in cents
  profit: number; // Calculated: salePrice - costPrice
  profitMargin: number; // Calculated: (profit / salePrice) * 100

  // Marketplace
  marketplace: MarketplaceType;
  marketplaceUrl?: string;

  // Delist Status Checklist
  delistStatus: DelistStatus;

  // How the sale was recorded
  saleSource?: SaleSource;

  // Metadata
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  notes?: string;
}

export interface SaleStats {
  totalSales: number;
  totalRevenue: number; // Sum of salePrice in cents
  totalCost: number; // Sum of costPrice in cents
  totalProfit: number; // Sum of profit in cents
  averageProfit: number; // totalProfit / totalSales in cents
  profitMargin: number; // (totalProfit / totalRevenue) * 100
}

export interface SaleFilters {
  dateRange: 'today' | '7d' | '30d' | '90d' | 'custom' | 'all';
  marketplace: 'all' | MarketplaceType;
  saleSource: 'all' | SaleSource;
  searchQuery: string;
  customDateStart?: string;
  customDateEnd?: string;
}

export type SaleSortField = 'saleDate' | 'salePrice' | 'profit' | 'profitMargin' | 'marketplace' | 'itemName';

export interface SaleSortOption {
  field: SaleSortField;
  direction: 'asc' | 'desc';
}

// Helper to create new sale with calculated fields
export function createSale(data: {
  userId: string;
  itemId: string;
  itemName: string;
  itemImageUrl?: string;
  saleDate: string;
  salePrice: number; // cents
  costPrice: number; // cents
  marketplace: MarketplaceType;
  marketplaceUrl?: string;
  notes?: string;
  saleSource?: SaleSource;
}): Omit<Sale, 'id'> {
  const profit = data.salePrice - data.costPrice;
  const profitMargin = data.salePrice > 0 ? (profit / data.salePrice) * 100 : 0;

  return {
    userId: data.userId,
    itemId: data.itemId,
    itemName: data.itemName,
    itemImageUrl: data.itemImageUrl,
    saleDate: data.saleDate,
    salePrice: data.salePrice,
    costPrice: data.costPrice,
    profit,
    profitMargin,
    marketplace: data.marketplace,
    marketplaceUrl: data.marketplaceUrl,
    saleSource: data.saleSource || 'detail_page',
    delistStatus: {
      ebay: false,
      poshmark: false,
      depop: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: data.notes,
  };
}

// Helper to calculate stats from array of sales
export function calculateStats(sales: Sale[]): SaleStats {
  if (sales.length === 0) {
    return {
      totalSales: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
      averageProfit: 0,
      profitMargin: 0,
    };
  }

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.salePrice, 0);
  const totalCost = sales.reduce((sum, sale) => sum + sale.costPrice, 0);
  const totalProfit = sales.reduce((sum, sale) => sum + sale.profit, 0);

  return {
    totalSales: sales.length,
    totalRevenue,
    totalCost,
    totalProfit,
    averageProfit: totalProfit / sales.length,
    profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
  };
}
