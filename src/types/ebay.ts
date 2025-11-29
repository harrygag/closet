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
  // Extended fields for copy/paste relisting
  description?: string;
  condition?: string;
  conditionID?: string;
  primaryCategoryID?: string;
  primaryCategoryName?: string;
  itemSpecifics?: Record<string, string>;
  pictureURLs?: string[];
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



