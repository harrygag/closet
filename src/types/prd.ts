// PRD-Compliant TypeScript Types for Pokemon Closet Inventory
// Aligned with Firebase Firestore schema (migrated from Supabase)

export type EnergyType = 
  | 'Steel'     // Polos - neutral/off-white
  | 'Fairy'     // Hoodies - soft pink
  | 'Fire'      // Jackets - red
  | 'Grass'     // Jerseys - green
  | 'Water'     // Shirts - blue
  | 'Metal'     // Bottoms - steel gray
  | 'Lightning' // Extra/filter
  | 'Psychic'   // Extra/filter
  | 'Fighting'  // Extra/filter
  | 'Darkness'  // Extra/filter
  | 'Dragon';   // Extra/filter

export type CardStatus = 'Active' | 'Inactive' | 'SOLD' | 'Eliminated';

export type Condition = 'New' | 'Like New' | 'Good' | 'Fair' | 'Poor';

export type JobState = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type JobType = 'market_research' | 'image_analysis' | 'pricing_suggestion';

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  prefs: Record<string, any>;
  created_at: string;
}

export interface Deck {
  id: string;
  user_id: string;
  name: string;
  energy_type: EnergyType;
  color_hex: string;
  created_at: string;
}

export interface Card {
  id: string;
  user_id: string;
  deck_id: string | null;
  
  // Required Metadata (gating fields for research)
  title: string;
  brand: string;
  size_normalized: string;
  primary_image_url: string;
  condition: Condition;
  
  // Optional Metadata
  sku?: string | null;
  barcode?: string | null;
  price_cents_entered: number;
  currency: string;
  size_region?: string | null;
  color_normalized?: string | null;
  material?: string | null;
  measurements_json?: Record<string, any> | null;
  hanger_assignment?: string | null;
  
  // Images
  images: string[];
  image_quality_score: number;
  
  // Status
  status: CardStatus;
  listing_date?: string | null;
  acquisition_date?: string | null;
  tags: string[];
  
  // Market Research Results
  suggested_price_cents?: number | null;
  suggested_price_source?: string | null;
  market_summary?: string | null;
  demand_trend?: string | null;
  comparable_count: number;
  market_confidence: number; // 0-100
  last_market_refresh?: string | null;
  
  // Idempotency
  metadata_hash: string;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface MarketplaceSnapshot {
  id: string;
  card_id: string;
  user_id: string;
  
  // Snapshot Data
  source_marketplace: string;
  url: string;
  title: string | null;
  sale_price_cents: number;
  currency: string;
  sold_date: string;
  condition: string | null;
  size: string | null;
  color: string | null;
  seller_type: string | null;
  shipping_cents: number;
  image_url: string | null;
  item_identifier: string | null;
  
  // Relevance Scoring
  relevance_score: number;
  scraped_at: string;
  sanitized_snippet: string | null;
}

export interface ScrapeJob {
  id: string;
  card_id: string;
  
  // Job Configuration
  url_list: string[];
  metadata_hash: string;
  spider_name: string;
  
  // Job State
  state: JobState;
  result_snapshot_ids: string[];
  error_message: string | null;
  attempts: number;
  
  // Timestamps
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface AIJob {
  id: string;
  card_id: string;
  snapshot_ids: string[];
  
  // Job Configuration
  job_type: JobType;
  
  // Job State
  state: JobState;
  result_json: AIJobResult | null;
  error_message: string | null;
  attempts: number;
  
  // Timestamps
  created_at: string;
  completed_at: string | null;
}

export interface AIJobResult {
  suggested_price_cents: number;
  confidence_score: number; // 0-100
  market_summary: string;
  demand_trend: string;
  top_selling_tips: string[];
  market_tags: string[];
  sources_used: {
    snapshot_id: string;
    url: string;
    price_cents: number;
    sold_date: string;
  }[];
  server_aggregates: {
    median_price_cents: number;
    mean_price_cents: number;
    price_90th_percentile_cents: number;
    comparable_count: number;
  };
}

export interface MatchSignal {
  id: string;
  card_id: string;
  snapshot_id: string;
  
  // Scoring Components
  brand_score: number;
  title_score: number;
  size_score: number;
  color_score: number;
  image_similarity_score: number;
  composite_relevance_score: number;
  
  computed_at: string;
}

export interface Feedback {
  id: string;
  card_id: string;
  user_id: string;
  ai_job_id: string | null;
  
  accepted_price_cents: number | null;
  user_override_price_cents: number | null;
  reason: string | null;
  
  created_at: string;
}

// API Request/Response Types

export interface CreateCardRequest {
  title: string;
  brand: string;
  size_normalized: string;
  primary_image_url: string;
  condition: Condition;
  deck_id?: string;
  sku?: string;
  price_cents_entered?: number;
  color_normalized?: string;
  material?: string;
  tags?: string[];
}

export interface RunResearchRequest {
  card_id: string;
}

export interface RunResearchResponse {
  scrape_job_id: string;
  metadata_hash: string;
  estimated_completion_seconds: number;
}

export interface JobStatusResponse {
  job_id: string;
  state: JobState;
  progress_percent: number;
  result_snapshot_ids?: string[];
  error_message?: string | null;
}

export interface ValidationError {
  field: string;
  message: string;
  required_for: 'basic' | 'research';
}

export interface CardValidation {
  is_valid: boolean;
  research_enabled: boolean;
  errors: ValidationError[];
  warnings: string[];
}

// Warning Types
export type WarningLevel = 'critical' | 'major' | 'minor' | 'info';

export interface CardWarning {
  level: WarningLevel;
  badge: string; // Single letter: E, !, i, ?
  message: string;
  remediation_cta?: string;
  remediation_action?: () => void;
}

// Frontend-only types for UI state
export interface CardWithWarnings extends Card {
  warnings: CardWarning[];
  validation: CardValidation;
}

export interface DeckWithStats extends Deck {
  card_count: number;
  active_count: number;
  total_value_cents: number;
  highest_warning_level: WarningLevel | null;
}
