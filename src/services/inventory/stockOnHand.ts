/**
 * Real stock on hand for an item: eBay available MINUS matched non-eBay sales
 * (Poshmark + Depop + in-person) recorded in unitSales. Mirrors the math in
 * src/services/inventory/reconciliation.ts (countSalesByPlatform + line 127).
 *
 * Shared by DelistQueueWidget and ShouldListWidget so both surfaces stay
 * consistent with the reconciliation engine: an item is real-stock OOS iff
 * stockOnHand(it) <= 0.
 */

interface UnitSaleLike {
  platform?: 'ebay' | 'poshmark' | 'depop' | 'in_person' | string;
  soldAt?: string;
}

interface ItemLike {
  ebayQuantity?: number;
  physicalQuantity?: number;
  unitSales?: UnitSaleLike[];
}

export function stockOnHand(it: ItemLike): number {
  const ebayQty = typeof it.ebayQuantity === 'number'
    ? it.ebayQuantity
    : (it.physicalQuantity ?? 1);
  const sales = Array.isArray(it.unitSales) ? it.unitSales : [];
  let nonEbay = 0;
  for (const s of sales) {
    const p = s && s.platform;
    if (p === 'poshmark' || p === 'depop' || p === 'in_person' || p === 'whatnot') nonEbay++;
  }
  return ebayQty - nonEbay;
}
