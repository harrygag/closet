export interface EbayListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  imageUrl?: string;
  listingUrl: string;
  quantity: number;
  format: string;
  categoryName?: string;
  itemSpecifics?: Array<{ name: string; value: string }>;
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



