export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type BaseRow = Record<string, Json | null>;

export interface Database {
  public: {
    Tables: {
      Item: {
        Row: BaseRow & {
          id: string;
          user_uuid: string;
          title: string | null;
          manualPriceCents: number | null;
          sku: string | null;
          imageUrls: string[] | null;
          ebay_item_id: string | null;
          status: string | null;
          category: string | null;
          imported_from: string | null;
          ebayUrl: string | null;
          ebay_imported_at: string | null;
          updatedAt: string | null;
        };
        Insert: Partial<Database['public']['Tables']['Item']['Row']>;
        Update: Partial<Database['public']['Tables']['Item']['Row']>;
        Relationships: [];
      };
      user_marketplace_credentials: {
        Row: BaseRow & {
          user_uuid: string;
          marketplace: string;
          email: string | null;
          cookies_encrypted: string | null;
          last_validated_at: string | null;
          expires_at: string | null;
          last_used: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Database['public']['Tables']['user_marketplace_credentials']['Row'];
        Update: Partial<Database['public']['Tables']['user_marketplace_credentials']['Row']>;
        Relationships: [];
      };
      marketplace_listing_drafts: {
        Row: BaseRow & {
          id: string;
          user_uuid: string;
          marketplace: string;
          marketplace_listing_id: string;
          source_account: string | null;
          title: string | null;
          description: string | null;
          status: string | null;
          price_cents: number | null;
          currency: string | null;
          quantity: number | null;
          sku: string | null;
          url: string | null;
          image_urls: string[] | null;
          raw_payload: Json | null;
          last_seen_at: string | null;
          imported_at: string | null;
          ready_for_crosspost: boolean | null;
          crosspost_targets: string[] | null;
          crosspost_status: Json | null;
          closet_item_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Database['public']['Tables']['marketplace_listing_drafts']['Row'];
        Update: Partial<Database['public']['Tables']['marketplace_listing_drafts']['Row']>;
        Relationships: [];
      };
      clothing_comps: {
        Row: BaseRow;
        Insert: BaseRow;
        Update: Partial<BaseRow>;
        Relationships: [];
      };
      user_vendoo_credentials: {
        Row: BaseRow;
        Insert: BaseRow;
        Update: Partial<BaseRow>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}

