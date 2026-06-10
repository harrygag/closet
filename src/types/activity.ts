// Activity log types for tracking item check-ins and actions

export type ActivityType =
  | 'check-in'
  | 'price-increase'
  | 'price-decrease'
  | 'status-change'
  | 'relist'
  | 'import';

export interface ActivityLog {
  id: string;
  userId: string;
  itemId: string;
  itemName: string;
  itemBarcode?: string;
  activityType: ActivityType;
  timestamp: string;

  // Context data
  ebayUrl?: string;
  ebayListingId?: string;

  // Price change details
  oldPrice?: number;
  newPrice?: number;
  priceChange?: number; // Percentage

  // Status change details
  oldStatus?: string;
  newStatus?: string;

  // Additional metadata
  notes?: string;
  metadata?: Record<string, any>;
}

export interface ActivityLogFormData {
  itemId: string;
  itemName: string;
  itemBarcode?: string;
  activityType: ActivityType;
  ebayUrl?: string;
  ebayListingId?: string;
  oldPrice?: number;
  newPrice?: number;
  priceChange?: number;
  oldStatus?: string;
  newStatus?: string;
  notes?: string;
  metadata?: Record<string, any>;
}
