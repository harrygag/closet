/**
 * Stock Reconciliation Engine
 *
 * Formula: Stock on Hand = eBay Available Qty − (Poshmark sales + Depop sales + In-Person sales)
 *
 * Classifies every item into one of 5 buckets:
 *   DELIST_NOW   — 0 stock but still listed on Poshmark/Depop
 *   OVERSOLD     — negative stock (sold more than you had)
 *   QTY_MISMATCH — eBay shows more than actual stock (needs revision)
 *   SHOULD_LIST  — has stock but not on all platforms
 *   ALL_GOOD     — everything matches
 */

import type { Item } from '../../types/item';

export type ReconciliationSeverity =
  | 'DELIST_NOW'
  | 'OVERSOLD'
  | 'QTY_MISMATCH'
  | 'SHOULD_LIST'
  | 'ALL_GOOD';

export interface ReconciliationItem {
  item: Item;
  severity: ReconciliationSeverity;
  stockOnHand: number;
  ebayAvailable: number;
  poshmarkSales: number;
  depopSales: number;
  whatnotSales: number;
  inPersonSales: number;
  totalSold: number;
  listedOn: ('ebay' | 'poshmark' | 'depop')[];
  notListedOn: ('poshmark' | 'depop')[];
  message: string;
  suggestedAction?: string;
}

export interface ReconciliationResult {
  delistNow: ReconciliationItem[];
  oversold: ReconciliationItem[];
  qtyMismatch: ReconciliationItem[];
  shouldList: ReconciliationItem[];
  allGood: ReconciliationItem[];
  summary: {
    total: number;
    issues: number;
    delistCount: number;
    oversoldCount: number;
    mismatchCount: number;
    shouldListCount: number;
    allGoodCount: number;
  };
}

/**
 * Count sales by platform from an item's unitSales array.
 * When saleWindowDays > 0, only counts sales within the last N days (based on sale.soldAt).
 * Sales without a parseable soldAt date are INCLUDED (conservative — better to count than silently miss).
 * saleWindowDays = 0 or undefined → count all sales (lifetime).
 */
function countSalesByPlatform(
  item: Item,
  saleWindowDays?: number,
): { ebay: number; poshmark: number; depop: number; whatnot: number; inPerson: number } {
  const sales = item.unitSales || [];
  const useWindow = typeof saleWindowDays === 'number' && saleWindowDays > 0;
  const cutoffMs = useWindow ? Date.now() - saleWindowDays * 86400_000 : 0;
  let ebay = 0, poshmark = 0, depop = 0, whatnot = 0, inPerson = 0;
  for (const sale of sales) {
    if (useWindow) {
      const ts = sale.soldAt ? Date.parse(sale.soldAt) : NaN;
      // Skip only if date is VALID AND older than cutoff. Invalid/missing dates → include.
      if (!isNaN(ts) && ts < cutoffMs) continue;
    }
    switch (sale.platform) {
      case 'ebay': ebay++; break;
      case 'poshmark': poshmark++; break;
      case 'depop': depop++; break;
      case 'whatnot': whatnot++; break;
      case 'in_person': inPerson++; break;
    }
  }
  return { ebay, poshmark, depop, whatnot, inPerson };
}

/**
 * Determine which platforms an item is listed on.
 */
function getListedPlatforms(item: Item): ('ebay' | 'poshmark' | 'depop')[] {
  const platforms: ('ebay' | 'poshmark' | 'depop')[] = [];
  if (item.ebayListingId || item.ebayItemId) platforms.push('ebay');
  if (item.poshmarkListingId) platforms.push('poshmark');
  if (item.depopListingId) platforms.push('depop');
  return platforms;
}

/**
 * Run reconciliation on all items.
 * Optionally provide a live eBay quantity map (from Sync Stock) for real-time accuracy.
 */
export function reconcileStock(
  items: Item[],
  liveEbayQtyMap?: Map<string, number>,
  saleWindowDays?: number,
): ReconciliationResult {
  const delistNow: ReconciliationItem[] = [];
  const oversold: ReconciliationItem[] = [];
  const qtyMismatch: ReconciliationItem[] = [];
  const shouldList: ReconciliationItem[] = [];
  const allGood: ReconciliationItem[] = [];

  // Only reconcile items that have an eBay listing (eBay is the anchor)
  const ebayItems = items.filter(i => i.ebayListingId || i.ebayItemId);

  for (const item of ebayItems) {
    const ebayId = item.ebayListingId || item.ebayItemId || '';

    // eBay available quantity: prefer live data, else stored
    const ebayAvailable = liveEbayQtyMap?.get(ebayId) ?? item.ebayQuantity ?? item.physicalQuantity ?? 1;

    // Count platform-specific sales
    const sales = countSalesByPlatform(item, saleWindowDays);
    const nonEbaySold = sales.poshmark + sales.depop + sales.whatnot + sales.inPerson;
    const totalSold = sales.ebay + nonEbaySold;

    // Stock on Hand = eBay Available − non-eBay sales
    // (eBay already decrements its own sales from available qty)
    const stockOnHand = ebayAvailable - nonEbaySold;

    const listedOn = getListedPlatforms(item);
    const notListedOn: ('poshmark' | 'depop')[] = [];
    if (!item.poshmarkListingId) notListedOn.push('poshmark');
    if (!item.depopListingId) notListedOn.push('depop');

    // eBay is "still active" when it hasn't been delisted and still reports
    // available quantity. When real stock hits 0 because OTHER sites sold the
    // remaining units, eBay doesn't know — it still shows qty > 0 — so it MUST
    // be delisted too (real stock = eBay qty − non-eBay sales; at 0 there is
    // nothing left to sell anywhere, including eBay).
    const ebayStillActive = (item as any).ebayDelisted !== true && ebayAvailable > 0;

    let severity: ReconciliationSeverity;
    let message: string;
    let suggestedAction: string | undefined;

    if (stockOnHand < 0) {
      // OVERSOLD: sold more than available
      severity = 'OVERSOLD';
      message = `Oversold by ${Math.abs(stockOnHand)}! eBay shows ${ebayAvailable} available but ${nonEbaySold} sold on other platforms.`;
      suggestedAction = `Delist from ALL platforms (incl. eBay) and cancel pending orders`;
    } else if (stockOnHand === 0 && (ebayStillActive || item.poshmarkListingId || item.depopListingId)) {
      // DELIST NOW: real stock is 0 but the item is still live somewhere. eBay
      // is included — if other-site sales zeroed the stock, the eBay listing is
      // overselling risk and has to come down too.
      severity = 'DELIST_NOW';
      const stillOn = [];
      if (ebayStillActive) stillOn.push('eBay');
      if (item.poshmarkListingId) stillOn.push('Poshmark');
      if (item.depopListingId) stillOn.push('Depop');
      message = `0 stock remaining but still listed on ${stillOn.join(' & ')}`;
      suggestedAction = `Delist from ${stillOn.join(' & ')}`;
    } else if (stockOnHand > 0 && item.physicalQuantity !== undefined && stockOnHand !== item.physicalQuantity) {
      // QTY MISMATCH: local physical qty doesn't match calculated stock on hand
      severity = 'QTY_MISMATCH';
      message = `Stock on hand is ${stockOnHand} but local shows ${item.physicalQuantity}. eBay: ${ebayAvailable}, non-eBay sales: ${nonEbaySold}`;
      suggestedAction = `Update eBay quantity to ${stockOnHand}`;
    } else if (stockOnHand > 0 && notListedOn.length > 0) {
      // SHOULD LIST: has stock but not on all platforms
      severity = 'SHOULD_LIST';
      message = `${stockOnHand} in stock, not listed on ${notListedOn.join(' & ')}`;
      suggestedAction = `List on ${notListedOn.join(' & ')}`;
    } else {
      severity = 'ALL_GOOD';
      message = `${stockOnHand} in stock, listed on ${listedOn.join(', ')}`;
    }

    const reconciled: ReconciliationItem = {
      item,
      severity,
      stockOnHand,
      ebayAvailable,
      poshmarkSales: sales.poshmark,
      depopSales: sales.depop,
      whatnotSales: sales.whatnot,
      inPersonSales: sales.inPerson,
      totalSold,
      listedOn,
      notListedOn,
      message,
      suggestedAction,
    };

    switch (severity) {
      case 'DELIST_NOW': delistNow.push(reconciled); break;
      case 'OVERSOLD': oversold.push(reconciled); break;
      case 'QTY_MISMATCH': qtyMismatch.push(reconciled); break;
      case 'SHOULD_LIST': shouldList.push(reconciled); break;
      case 'ALL_GOOD': allGood.push(reconciled); break;
    }
  }

  const issues = delistNow.length + oversold.length + qtyMismatch.length;

  return {
    delistNow,
    oversold,
    qtyMismatch,
    shouldList,
    allGood,
    summary: {
      total: ebayItems.length,
      issues,
      delistCount: delistNow.length,
      oversoldCount: oversold.length,
      mismatchCount: qtyMismatch.length,
      shouldListCount: shouldList.length,
      allGoodCount: allGood.length,
    },
  };
}
