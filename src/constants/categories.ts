/**
 * Pokémon → Clothing category mappings
 * Maps visual Pokémon energy colors to clothing categories for the arcade aesthetic
 */

export const CATEGORY_COLORS = {
  polo: {
    name: 'Polos',
    pokemonType: 'white',
    hex: '#F5F5F5',
    borderColor: '#E0E0E0',
    glowColor: 'rgba(245, 245, 245, 0.5)',
  },
  hoodie: {
    name: 'Hoodies',
    pokemonType: 'pink',
    hex: '#FF69B4',
    borderColor: '#FF1493',
    glowColor: 'rgba(255, 105, 180, 0.5)',
  },
  shirt: {
    name: 'Shirts',
    pokemonType: 'blue',
    hex: '#00BFFF',
    borderColor: '#1E90FF',
    glowColor: 'rgba(0, 191, 255, 0.5)',
  },
  pullover: {
    name: 'Pullovers / Jackets',
    pokemonType: 'red',
    hex: '#FF6347',
    borderColor: '#FF4500',
    glowColor: 'rgba(255, 99, 71, 0.5)',
  },
  bottoms: {
    name: 'Bottoms',
    pokemonType: 'orange',
    hex: '#FFA500',
    borderColor: '#FF8C00',
    glowColor: 'rgba(255, 165, 0, 0.5)',
  },
  jersey: {
    name: 'Jerseys',
    pokemonType: 'green',
    hex: '#00FF00',
    borderColor: '#32CD32',
    glowColor: 'rgba(0, 255, 0, 0.5)',
  },
} as const;

export type CategoryKey = keyof typeof CATEGORY_COLORS;
export type CategoryConfig = typeof CATEGORY_COLORS[CategoryKey];

/**
 * Get category configuration by key
 */
export function getCategoryConfig(category: string): CategoryConfig | null {
  const normalized = category.toLowerCase() as CategoryKey;
  return CATEGORY_COLORS[normalized] || null;
}

/**
 * Get all category keys
 */
export function getAllCategories(): CategoryKey[] {
  return Object.keys(CATEGORY_COLORS) as CategoryKey[];
}

/**
 * Get category display name
 */
export function getCategoryDisplayName(category: string): string {
  const config = getCategoryConfig(category);
  return config?.name || category;
}

/**
 * Get category color for UI elements
 */
export function getCategoryColor(category: string): string {
  const config = getCategoryConfig(category);
  return config?.hex || '#808080'; // Default gray
}

/**
 * Get category border color for cards
 */
export function getCategoryBorderColor(category: string): string {
  const config = getCategoryConfig(category);
  return config?.borderColor || '#606060';
}

/**
 * Get category glow color for hover effects
 */
export function getCategoryGlowColor(category: string): string {
  const config = getCategoryConfig(category);
  return config?.glowColor || 'rgba(128, 128, 128, 0.5)';
}

/**
 * Category to energy bar mapping (for HP/days remaining visual)
 */
export function getCategoryEnergyColor(category: string, daysRemaining: number): string {
  const config = getCategoryConfig(category);
  if (!config) return '#808080';

  // Apply fading effect based on days remaining
  if (daysRemaining <= 5) {
    return config.borderColor; // Bright/urgent
  } else if (daysRemaining <= 15) {
    return config.hex; // Normal
  } else {
    return config.hex; // Full energy
  }
}
