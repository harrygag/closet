// TypeScript types for the closet management application

export type ItemStatus = 'Active' | 'Inactive' | 'SOLD';

export type ItemTag = 'Hoodie' | 'Jersey' | 'polo' | 'Pullover/Jackets' | 'T-shirts' | 'Bottoms';

export type MarketplaceType = 'ebay' | 'poshmark' | 'mercari' | 'depop' | 'grailed' | 'other';

export interface MarketplaceUrl {
  type: MarketplaceType;
  url: string;
}

export interface Item {
  id: string;
  name: string;
  size: string;
  status: ItemStatus;
  hangerStatus: string;
  hangerId: string;
  tags: ItemTag[];
  ebayUrl: string;
  marketplaceUrls?: MarketplaceUrl[]; // Additional marketplace links
  imageUrl?: string; // Item image from Notion or uploaded
  costPrice: number;
  sellingPrice: number;
  ebayFees: number;
  netProfit: number;
  dateField: string;
  notes: string;
  dateAdded: string;
  position?: number; // For drag-and-drop ordering
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
