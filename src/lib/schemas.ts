/**
 * Zod schemas for AI job validation
 * These schemas validate model outputs before persisting to database
 */

import { z } from 'zod';

/**
 * Price Suggestion Schema
 * Used for PRICE_SUGGESTION AIJob type
 */
export const PriceSuggestionSchema = z.object({
  suggestedMinCents: z.number().int().nonnegative(),
  suggestedMedianCents: z.number().int().nonnegative(),
  suggestedMaxCents: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  reasoning: z.array(z.string()).min(1),
  comparisonMethod: z.enum(['embedding_similarity', 'category_brand', 'manual']).optional(),
  marketTrend: z.enum(['rising', 'stable', 'falling']).optional(),
});

export type PriceSuggestion = z.infer<typeof PriceSuggestionSchema>;

/**
 * Normalize Schema
 * Used for NORMALIZE AIJob type to standardize item attributes
 */
export const NormalizeSchema = z.object({
  category: z.string(),
  subcategory: z.string().optional(),
  brand_normalized: z.string().optional(),
  color_hex_or_name: z.string().optional(),
  tags: z.array(z.string()),
  material: z.string().optional(),
  style: z.string().optional(),
  confidence_scores: z.record(z.string(), z.number().min(0).max(1)),
  extracted_from: z.array(z.enum(['title', 'description', 'ocr', 'barcode', 'image'])).optional(),
});

export type NormalizeResult = z.infer<typeof NormalizeSchema>;

/**
 * Defect Schema for condition grading
 */
export const DefectSchema = z.object({
  type: z.string(), // e.g., "stain", "hole", "fading", "pilling"
  severity: z.enum(['minor', 'moderate', 'major']),
  location: z.string().optional(), // e.g., "left sleeve", "collar"
  suggested_text_for_listing: z.string(),
});

export type Defect = z.infer<typeof DefectSchema>;

/**
 * Condition Grade Schema
 * Used for CONDITION_GRADE AIJob type
 */
export const ConditionSchema = z.object({
  condition_grade: z.enum(['NWT', 'NWOT', 'Excellent', 'Good', 'Fair', 'Poor']),
  defects: z.array(DefectSchema),
  confidence_score: z.number().min(0).max(1),
  requires_manual_review: z.boolean().optional(),
  reasoning: z.string().optional(),
});

export type ConditionGrade = z.infer<typeof ConditionSchema>;

/**
 * Listing Variant Schema for marketplace-optimized listings
 */
export const ListingVariantSchema = z.object({
  platform: z.enum(['ebay', 'poshmark', 'grailed', 'mercari', 'depop', 'shopify', 'generic']),
  title: z.string(),
  short_desc: z.string().optional(),
  long_desc: z.string(),
  bullets: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  char_count: z.number().optional(), // for validation
  meets_platform_rules: z.boolean().optional(),
});

export type ListingVariant = z.infer<typeof ListingVariantSchema>;

/**
 * Generate Listings Schema
 * Used for GENERATE_LISTINGS AIJob type
 */
export const GenerateListingsSchema = z.object({
  variants: z.array(ListingVariantSchema).min(1),
  confidence: z.number().min(0).max(1),
  seo_keywords: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(), // e.g., "title exceeds 80 chars for eBay"
});

export type GenerateListingsResult = z.infer<typeof GenerateListingsSchema>;

/**
 * Embedding Schema
 * Used for GENERATE_EMBEDDING AIJob type
 */
export const EmbeddingSchema = z.object({
  embedding: z.array(z.number()).length(1536), // OpenAI embeddings are 1536-dimensional
  model: z.string(),
  input_text: z.string(),
  dimension: z.number().default(1536),
});

export type EmbeddingResult = z.infer<typeof EmbeddingSchema>;

/**
 * Deterministic Baseline Schema
 * Computed before AI call; includes comps stats
 */
export const DeterministicBaselineSchema = z.object({
  median: z.number(),
  mean: z.number(),
  std: z.number(),
  count: z.number().int(),
  min: z.number(),
  max: z.number(),
  top5_comps: z.array(
    z.object({
      id: z.string(),
      price_cents: z.number().int(),
      sold_at: z.string(), // ISO date
      distance: z.number().optional(), // embedding distance
      brand: z.string().optional(),
      category: z.string().optional(),
    })
  ),
  computed_at: z.string(), // ISO timestamp
});

export type DeterministicBaseline = z.infer<typeof DeterministicBaselineSchema>;

/**
 * AIJob Input Payload Schemas (per job type)
 */
export const PriceSuggestionInputSchema = z.object({
  itemId: z.string(),
  category: z.string(),
  brand: z.string().optional(),
  title: z.string(),
  tags: z.array(z.string()).optional(),
  conditionGrade: z.string().optional(),
  minMarginCents: z.number().int().optional(),
  feePercent: z.number().min(0).max(100).optional(),
});

export const NormalizeInputSchema = z.object({
  itemId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  ocrText: z.string().optional(),
  barcodeText: z.string().optional(),
  imageCaption: z.string().optional(),
});

export const ConditionInputSchema = z.object({
  itemId: z.string(),
  imageCaption: z.string().optional(),
  notes: z.string().optional(),
  brandGuidelines: z.string().optional(),
});

export const ListingsInputSchema = z.object({
  itemId: z.string(),
  title: z.string(),
  brand: z.string().optional(),
  category: z.string(),
  tags: z.array(z.string()).optional(),
  platforms: z.array(z.enum(['ebay', 'poshmark', 'grailed', 'mercari', 'depop'])),
  conditionGrade: z.string().optional(),
  priceCents: z.number().int().optional(),
});

export const EmbeddingInputSchema = z.object({
  itemId: z.string(),
  brand: z.string().optional(),
  title: z.string(),
  tags: z.array(z.string()).optional(),
  conditionGrade: z.string().optional(),
  category: z.string(),
});

/**
 * Helper to get schema by job type
 */
export function getOutputSchemaForJobType(jobType: string) {
  const schemas: Record<string, z.ZodType> = {
    NORMALIZE: NormalizeSchema,
    PRICE_SUGGESTION: PriceSuggestionSchema,
    CONDITION_GRADE: ConditionSchema,
    GENERATE_LISTINGS: GenerateListingsSchema,
    GENERATE_EMBEDDING: EmbeddingSchema,
  };
  return schemas[jobType];
}

export function getInputSchemaForJobType(jobType: string) {
  const schemas: Record<string, z.ZodType> = {
    NORMALIZE: NormalizeInputSchema,
    PRICE_SUGGESTION: PriceSuggestionInputSchema,
    CONDITION_GRADE: ConditionInputSchema,
    GENERATE_LISTINGS: ListingsInputSchema,
    GENERATE_EMBEDDING: EmbeddingInputSchema,
  };
  return schemas[jobType];
}
