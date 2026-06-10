import type { Item } from '../../types/item';

export interface PlatformInventory {
  sku: string;
  title: string;
  quantity: number;
  price: number;
  status: string; // 'active' | 'sold' | 'draft' | 'ended'
}

export interface MismatchResult {
  itemId: string;
  itemTitle: string;
  sku: string;
  type: 'SOLD_STILL_LISTED' | 'NOT_LISTED' | 'QUANTITY_MISMATCH' | 'MISSING_FROM_PLATFORM' | 'OVERSOLD';
  severity: 'critical' | 'warning' | 'info';
  details: string;
  platforms: {
    local: { quantity: number; status: string };
    ebay?: { quantity: number; status: string };
    poshmark?: { quantity: number; status: string };
    depop?: { quantity: number; status: string };
  };
}

export interface Alert {
  id: string;
  type: 'SOLD_STILL_LISTED' | 'OVERSOLD' | 'QUANTITY_MISMATCH';
  severity: 'critical' | 'warning';
  message: string;
  itemId: string;
  platform: string;
  actionRequired: string;
  createdAt: string;
}

// Simple word-overlap similarity (no npm packages)
export function wordOverlapSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const wordsA = normalize(a);
  const wordsB = normalize(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  const overlap = wordsA.filter((w) => setB.has(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.length);
}

function findMatch(
  item: Item,
  platformItems: PlatformInventory[],
  platform: 'ebay' | 'poshmark' | 'depop'
): PlatformInventory | null {
  // 1. Match by SKU (exact)
  const sku = item.ebaySku || item.ebaySku || item.barcode || '';
  if (sku) {
    const bysku = platformItems.find(
      (p) => p.sku && p.sku.toLowerCase() === sku.toLowerCase()
    );
    if (bysku) return bysku;
  }

  // 2. Match by listing ID
  const listingId =
    platform === 'ebay'
      ? item.ebayListingId || item.ebayItemId
      : platform === 'poshmark'
        ? item.poshmarkListingId
        : item.depopListingId;
  if (listingId) {
    const byId = platformItems.find(
      (p) => p.sku && p.sku === listingId
    );
    if (byId) return byId;
  }

  // 3. Fuzzy title match (>80%)
  if (item.name) {
    let best: PlatformInventory | null = null;
    let bestScore = 0;
    for (const p of platformItems) {
      const score = wordOverlapSimilarity(item.name, p.title);
      if (score > 0.8 && score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    if (best) return best;
  }

  return null;
}

export function detectMismatches(
  localItems: Item[],
  ebayCSV: PlatformInventory[] | null,
  poshmarkCSV: PlatformInventory[] | null,
  depopListings: PlatformInventory[] | null
): MismatchResult[] {
  const results: MismatchResult[] = [];
  const matchedEbay = new Set<string>();
  const matchedPosh = new Set<string>();
  const matchedDepop = new Set<string>();

  for (const item of localItems) {
    const localQty = item.physicalQuantity ?? item.ebayQuantity ?? 1;
    const localStatus = item.status || 'Active';
    const isSold = localStatus === 'SOLD' || item.stockStatus === 'SOLD';
    const sku = item.ebaySku || item.ebaySku || item.barcode || '';

    const platforms: MismatchResult['platforms'] = {
      local: { quantity: localQty, status: localStatus },
    };

    // Check eBay
    if (ebayCSV) {
      const match = findMatch(item, ebayCSV, 'ebay');
      if (match) {
        matchedEbay.add(match.sku);
        platforms.ebay = { quantity: match.quantity, status: match.status };

        if (isSold && match.status === 'active') {
          results.push({
            itemId: item.id,
            itemTitle: item.name || '',
            sku,
            type: 'SOLD_STILL_LISTED',
            severity: 'critical',
            details: `Sold locally but still active on eBay (qty: ${match.quantity})`,
            platforms,
          });
        } else if (match.quantity > localQty) {
          results.push({
            itemId: item.id,
            itemTitle: item.name || '',
            sku,
            type: 'OVERSOLD',
            severity: 'critical',
            details: `eBay shows ${match.quantity} but only ${localQty} in stock`,
            platforms,
          });
        } else if (match.quantity !== localQty && !isSold) {
          results.push({
            itemId: item.id,
            itemTitle: item.name || '',
            sku,
            type: 'QUANTITY_MISMATCH',
            severity: 'warning',
            details: `Local: ${localQty}, eBay: ${match.quantity}`,
            platforms,
          });
        }
      } else if (!isSold && localQty > 0 && item.ebayListingId) {
        results.push({
          itemId: item.id,
          itemTitle: item.name || '',
          sku,
          type: 'NOT_LISTED',
          severity: 'info',
          details: `Has eBay listing ID but not found in eBay CSV`,
          platforms,
        });
      }
    }

    // Check Poshmark
    if (poshmarkCSV) {
      const match = findMatch(item, poshmarkCSV, 'poshmark');
      if (match) {
        matchedPosh.add(match.sku);
        platforms.poshmark = { quantity: match.quantity, status: match.status };

        if (isSold && match.status === 'active') {
          results.push({
            itemId: item.id,
            itemTitle: item.name || '',
            sku,
            type: 'SOLD_STILL_LISTED',
            severity: 'critical',
            details: `Sold locally but still active on Poshmark (qty: ${match.quantity})`,
            platforms,
          });
        } else if (match.quantity > localQty) {
          results.push({
            itemId: item.id,
            itemTitle: item.name || '',
            sku,
            type: 'OVERSOLD',
            severity: 'critical',
            details: `Poshmark shows ${match.quantity} but only ${localQty} in stock`,
            platforms,
          });
        } else if (match.quantity !== localQty && !isSold) {
          results.push({
            itemId: item.id,
            itemTitle: item.name || '',
            sku,
            type: 'QUANTITY_MISMATCH',
            severity: 'warning',
            details: `Local: ${localQty}, Poshmark: ${match.quantity}`,
            platforms,
          });
        }
      }
    }

    // Check Depop
    if (depopListings) {
      const match = findMatch(item, depopListings, 'depop');
      if (match) {
        matchedDepop.add(match.sku);
        platforms.depop = { quantity: match.quantity, status: match.status };

        if (isSold && match.status === 'active') {
          results.push({
            itemId: item.id,
            itemTitle: item.name || '',
            sku,
            type: 'SOLD_STILL_LISTED',
            severity: 'critical',
            details: `Sold locally but still active on Depop (qty: ${match.quantity})`,
            platforms,
          });
        } else if (match.quantity > localQty) {
          results.push({
            itemId: item.id,
            itemTitle: item.name || '',
            sku,
            type: 'OVERSOLD',
            severity: 'critical',
            details: `Depop shows ${match.quantity} but only ${localQty} in stock`,
            platforms,
          });
        } else if (match.quantity !== localQty && !isSold) {
          results.push({
            itemId: item.id,
            itemTitle: item.name || '',
            sku,
            type: 'QUANTITY_MISMATCH',
            severity: 'warning',
            details: `Local: ${localQty}, Depop: ${match.quantity}`,
            platforms,
          });
        }
      }
    }
  }

  // MISSING_FROM_PLATFORM: items in CSV but not matched to any local item
  if (ebayCSV) {
    for (const p of ebayCSV) {
      if (!matchedEbay.has(p.sku) && p.status === 'active') {
        results.push({
          itemId: '',
          itemTitle: p.title,
          sku: p.sku,
          type: 'MISSING_FROM_PLATFORM',
          severity: 'warning',
          details: `Active on eBay but not in local inventory`,
          platforms: {
            local: { quantity: 0, status: 'MISSING' },
            ebay: { quantity: p.quantity, status: p.status },
          },
        });
      }
    }
  }

  if (poshmarkCSV) {
    for (const p of poshmarkCSV) {
      if (!matchedPosh.has(p.sku) && p.status === 'active') {
        results.push({
          itemId: '',
          itemTitle: p.title,
          sku: p.sku,
          type: 'MISSING_FROM_PLATFORM',
          severity: 'warning',
          details: `Active on Poshmark but not in local inventory`,
          platforms: {
            local: { quantity: 0, status: 'MISSING' },
            poshmark: { quantity: p.quantity, status: p.status },
          },
        });
      }
    }
  }

  if (depopListings) {
    for (const p of depopListings) {
      if (!matchedDepop.has(p.sku) && p.status === 'active') {
        results.push({
          itemId: '',
          itemTitle: p.title,
          sku: p.sku,
          type: 'MISSING_FROM_PLATFORM',
          severity: 'warning',
          details: `Active on Depop but not in local inventory`,
          platforms: {
            local: { quantity: 0, status: 'MISSING' },
            depop: { quantity: p.quantity, status: p.status },
          },
        });
      }
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  results.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return results;
}

export function generateAlerts(mismatches: MismatchResult[]): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  for (const m of mismatches) {
    if (m.severity === 'info') continue; // only critical + warning become alerts

    const platformNames: string[] = [];
    if (m.platforms.ebay) platformNames.push('eBay');
    if (m.platforms.poshmark) platformNames.push('Poshmark');
    if (m.platforms.depop) platformNames.push('Depop');
    const platformStr = platformNames.join(', ') || 'Unknown';

    let actionRequired = '';
    if (m.type === 'SOLD_STILL_LISTED') {
      actionRequired = `Delist from ${platformStr}`;
    } else if (m.type === 'OVERSOLD') {
      actionRequired = `Reduce quantity on ${platformStr} to ${m.platforms.local.quantity}`;
    } else if (m.type === 'QUANTITY_MISMATCH') {
      actionRequired = `Update ${platformStr} quantity to ${m.platforms.local.quantity}`;
    } else if (m.type === 'MISSING_FROM_PLATFORM') {
      actionRequired = `Import from ${platformStr} or delist`;
    }

    alerts.push({
      id: `${m.type}-${m.itemId || m.sku}-${Date.now()}`,
      type: m.type as Alert['type'],
      severity: m.severity as Alert['severity'],
      message: m.details,
      itemId: m.itemId,
      platform: platformStr,
      actionRequired,
      createdAt: now,
    });
  }

  return alerts;
}
