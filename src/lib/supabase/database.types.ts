// Auto-generated types from Supabase schema
// This file should be regenerated when schema changes using: npx supabase gen types typescript

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          display_name: string | null
          prefs: Json
          created_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          prefs?: Json
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string | null
          prefs?: Json
          created_at?: string
        }
      }
      decks: {
        Row: {
          id: string
          user_id: string
          name: string
          energy_type: string
          color_hex: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          energy_type: string
          color_hex: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          energy_type?: string
          color_hex?: string
          created_at?: string
        }
      }
      cards: {
        Row: {
          id: string
          user_id: string
          deck_id: string | null
          title: string
          brand: string
          size_normalized: string
          primary_image_url: string
          condition: string
          sku: string | null
          barcode: string | null
          price_cents_entered: number
          currency: string
          size_region: string | null
          color_normalized: string | null
          material: string | null
          measurements_json: Json | null
          hanger_assignment: string | null
          images: string[]
          image_quality_score: number
          status: string
          listing_date: string | null
          acquisition_date: string | null
          tags: string[]
          suggested_price_cents: number | null
          suggested_price_source: string | null
          market_summary: string | null
          demand_trend: string | null
          comparable_count: number
          market_confidence: number
          last_market_refresh: string | null
          metadata_hash: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          deck_id?: string | null
          title: string
          brand: string
          size_normalized: string
          primary_image_url: string
          condition: string
          sku?: string | null
          barcode?: string | null
          price_cents_entered?: number
          currency?: string
          size_region?: string | null
          color_normalized?: string | null
          material?: string | null
          measurements_json?: Json | null
          hanger_assignment?: string | null
          images?: string[]
          image_quality_score?: number
          status?: string
          listing_date?: string | null
          acquisition_date?: string | null
          tags?: string[]
          suggested_price_cents?: number | null
          suggested_price_source?: string | null
          market_summary?: string | null
          demand_trend?: string | null
          comparable_count?: number
          market_confidence?: number
          last_market_refresh?: string | null
          metadata_hash?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          deck_id?: string | null
          title?: string
          brand?: string
          size_normalized?: string
          primary_image_url?: string
          condition?: string
          sku?: string | null
          barcode?: string | null
          price_cents_entered?: number
          currency?: string
          size_region?: string | null
          color_normalized?: string | null
          material?: string | null
          measurements_json?: Json | null
          hanger_assignment?: string | null
          images?: string[]
          image_quality_score?: number
          status?: string
          listing_date?: string | null
          acquisition_date?: string | null
          tags?: string[]
          suggested_price_cents?: number | null
          suggested_price_source?: string | null
          market_summary?: string | null
          demand_trend?: string | null
          comparable_count?: number
          market_confidence?: number
          last_market_refresh?: string | null
          metadata_hash?: string
          created_at?: string
          updated_at?: string
        }
      }
      marketplace_snapshots: {
        Row: {
          id: string
          card_id: string
          user_id: string
          source_marketplace: string
          url: string
          title: string | null
          sale_price_cents: number
          currency: string
          sold_date: string
          condition: string | null
          size: string | null
          color: string | null
          seller_type: string | null
          shipping_cents: number
          image_url: string | null
          item_identifier: string | null
          relevance_score: number
          scraped_at: string
          sanitized_snippet: string | null
        }
        Insert: {
          id?: string
          card_id: string
          user_id: string
          source_marketplace: string
          url: string
          title?: string | null
          sale_price_cents: number
          currency?: string
          sold_date: string
          condition?: string | null
          size?: string | null
          color?: string | null
          seller_type?: string | null
          shipping_cents?: number
          image_url?: string | null
          item_identifier?: string | null
          relevance_score?: number
          scraped_at?: string
          sanitized_snippet?: string | null
        }
        Update: {
          id?: string
          card_id?: string
          user_id?: string
          source_marketplace?: string
          url?: string
          title?: string | null
          sale_price_cents?: number
          currency?: string
          sold_date?: string
          condition?: string | null
          size?: string | null
          color?: string | null
          seller_type?: string | null
          shipping_cents?: number
          image_url?: string | null
          item_identifier?: string | null
          relevance_score?: number
          scraped_at?: string
          sanitized_snippet?: string | null
        }
      }
      scrape_jobs: {
        Row: {
          id: string
          card_id: string
          url_list: string[]
          metadata_hash: string
          spider_name: string
          state: string
          result_snapshot_ids: string[]
          error_message: string | null
          attempts: number
          created_at: string
          started_at: string | null
          finished_at: string | null
        }
        Insert: {
          id?: string
          card_id: string
          url_list?: string[]
          metadata_hash: string
          spider_name: string
          state?: string
          result_snapshot_ids?: string[]
          error_message?: string | null
          attempts?: number
          created_at?: string
          started_at?: string | null
          finished_at?: string | null
        }
        Update: {
          id?: string
          card_id?: string
          url_list?: string[]
          metadata_hash?: string
          spider_name?: string
          state?: string
          result_snapshot_ids?: string[]
          error_message?: string | null
          attempts?: number
          created_at?: string
          started_at?: string | null
          finished_at?: string | null
        }
      }
      ai_jobs: {
        Row: {
          id: string
          card_id: string
          snapshot_ids: string[]
          job_type: string
          state: string
          result_json: Json | null
          error_message: string | null
          attempts: number
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          card_id: string
          snapshot_ids: string[]
          job_type?: string
          state?: string
          result_json?: Json | null
          error_message?: string | null
          attempts?: number
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          card_id?: string
          snapshot_ids?: string[]
          job_type?: string
          state?: string
          result_json?: Json | null
          error_message?: string | null
          attempts?: number
          created_at?: string
          completed_at?: string | null
        }
      }
      match_signals: {
        Row: {
          id: string
          card_id: string
          snapshot_id: string
          brand_score: number
          title_score: number
          size_score: number
          color_score: number
          image_similarity_score: number
          composite_relevance_score: number
          computed_at: string
        }
        Insert: {
          id?: string
          card_id: string
          snapshot_id: string
          brand_score?: number
          title_score?: number
          size_score?: number
          color_score?: number
          image_similarity_score?: number
          composite_relevance_score?: number
          computed_at?: string
        }
        Update: {
          id?: string
          card_id?: string
          snapshot_id?: string
          brand_score?: number
          title_score?: number
          size_score?: number
          color_score?: number
          image_similarity_score?: number
          composite_relevance_score?: number
          computed_at?: string
        }
      }
      feedback: {
        Row: {
          id: string
          card_id: string
          user_id: string
          ai_job_id: string | null
          accepted_price_cents: number | null
          user_override_price_cents: number | null
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          card_id: string
          user_id: string
          ai_job_id?: string | null
          accepted_price_cents?: number | null
          user_override_price_cents?: number | null
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          card_id?: string
          user_id?: string
          ai_job_id?: string | null
          accepted_price_cents?: number | null
          user_override_price_cents?: number | null
          reason?: string | null
          created_at?: string
        }
      }
      clothing_comps: {
        Row: {
          id: string
          search_query: string
          marketplace: string
          title: string
          price: number | null
          sold_date: string | null
          shipping_cost: number | null
          image_url: string | null
          listing_url: string | null
          brand: string | null
          size: string | null
          color: string | null
          condition: string | null
          ai_similarity_score: number | null
          scraped_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          search_query: string
          marketplace: string
          title: string
          price?: number | null
          sold_date?: string | null
          shipping_cost?: number | null
          image_url?: string | null
          listing_url?: string | null
          brand?: string | null
          size?: string | null
          color?: string | null
          condition?: string | null
          ai_similarity_score?: number | null
          scraped_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          search_query?: string
          marketplace?: string
          title?: string
          price?: number | null
          sold_date?: string | null
          shipping_cost?: number | null
          image_url?: string | null
          listing_url?: string | null
          brand?: string | null
          size?: string | null
          color?: string | null
          condition?: string | null
          ai_similarity_score?: number | null
          scraped_at?: string | null
          created_at?: string
        }
      }
      Item: {
        Row: {
          id: string
          name: string
          size: string
          status: string
          hangerId: string
          tags: string[]
          ebayUrl: string
          costPrice: number
          sellingPrice: number
          ebayFees: number
          netProfit: number
          dateField: string
          notes: string
          dateAdded: string
          position: number | null
          barcode: string | null
          user_uuid: string
          createdAt: string
          updatedAt: string
        }
        Insert: {
          id: string
          name: string
          size: string
          status: string
          hangerId: string
          tags?: string[]
          ebayUrl: string
          costPrice?: number
          sellingPrice?: number
          ebayFees?: number
          netProfit?: number
          dateField: string
          notes?: string
          dateAdded?: string
          position?: number | null
          barcode?: string | null
          user_uuid: string
          createdAt?: string
          updatedAt?: string
        }
        Update: {
          id?: string
          name?: string
          size?: string
          status?: string
          hangerId?: string
          tags?: string[]
          ebayUrl?: string
          costPrice?: number
          sellingPrice?: number
          ebayFees?: number
          netProfit?: number
          dateField?: string
          notes?: string
          dateAdded?: string
          position?: number | null
          barcode?: string | null
          user_uuid?: string
          createdAt?: string
          updatedAt?: string
        }
      }
      barcode_counters: {
        Row: {
          user_uuid: string
          date_bucket: string
          last_counter: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_uuid: string
          date_bucket: string
          last_counter?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_uuid?: string
          date_bucket?: string
          last_counter?: number
          created_at?: string
          updated_at?: string
        }
      }
      barcode_events: {
        Row: {
          id: string
          item_id: string
          user_uuid: string
          event_type: string
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          user_uuid: string
          event_type: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          user_uuid?: string
          event_type?: string
          payload?: Json
          created_at?: string
        }
      }
      user_marketplace_credentials: {
        Row: {
          user_uuid: string
          marketplace: string
          cookies_encrypted: string | null
          last_validated_at: string | null
          expires_at: string | null
          email: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_uuid: string
          marketplace: string
          cookies_encrypted?: string | null
          last_validated_at?: string | null
          expires_at?: string | null
          email?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_uuid?: string
          marketplace?: string
          cookies_encrypted?: string | null
          last_validated_at?: string | null
          expires_at?: string | null
          email?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_metadata_hash: {
        Args: {
          p_title: string
          p_brand: string
          p_size: string
          p_primary_image_url: string
          p_condition: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
