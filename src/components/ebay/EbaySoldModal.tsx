import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import {
  ShoppingBag,
  Check,
  Loader2,
  RefreshCw,
  Package,
  Link2,
  CheckCircle,
  AlertCircle,
  DollarSign,
} from 'lucide-react';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../lib/firebase/client';
import { toast } from 'sonner';
import type { Item } from '../../types/item';

const db = getFirestore(app);
const functions = getFunctions(app);

const EBAY_BLUE = '#0064D2';

interface EbaySoldModalProps {
  open: boolean;
  onClose: () => void;
  /** When true, render in-flow as a page panel (no portal/overlay). Used by /sales. */
  inline?: boolean;
}

// eBay order shape returned by ebayGetOrders Cloud Function
interface EbayLineItem {
  legacyItemId: string;
  title: string;
  lineItemCost: { value: string; currency: string };
  quantity: number;
}

interface EbayOrder {
  orderId: string;
  orderFulfillmentStatus: string;
  orderPaymentStatus: string;
  buyer: string;
  pricingSummary: { total: { value: string; currency: string } };
  lineItems: EbayLineItem[];
  creationDate: string;
  lastModifiedDate: string;
}

interface GetOrdersResponse {
  success: boolean;
  total: number;
  orders: EbayOrder[];
}

// Flattened sold item for display (one card per line item)
interface SoldItem {
  id: string; // orderId-legacyItemId for uniqueness
  orderId: string;
  legacyItemId: string;
  title: string;
  soldPrice: number;
  quantity: number;
  buyer: string;
  creationDate: string;
  orderFulfillmentStatus: string;
  imageUrl: string | null;
}

// Word-overlap similarity (same approach as DepopSoldModal / mismatchDetector.ts)
function similarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
  const wordsA = normalize(a);
  const wordsB = normalize(b);
  if (!wordsA.length || !wordsB.length) return 0;
  const setB = new Set(wordsB);
  return wordsA.filter((w) => setB.has(w)).length / Math.max(wordsA.length, wordsB.length);
}

const MATCH_THRESHOLD = 0.4;

interface MatchResult {
  soldItemId: string;
  matchedItem: Item | null;
  confidence: number;
}

export const EbaySoldModal = ({ open, onClose, inline }: EbaySoldModalProps) => {
  const { items, initializeStore } = useItemStore();
  const { user } = useAuthStore();

  const [soldItems, setSoldItems] = useState<SoldItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState('');
  const [matchResults, setMatchResults] = useState<Map<string, MatchResult>>(new Map());
  const [isMatching, setIsMatching] = useState(false);
  const [isMarkingSold, setIsMarkingSold] = useState(false);
  const [showMatchResults, setShowMatchResults] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setMatchResults(new Map());
      setShowMatchResults(false);
    }
  }, [open]);

  // Fetch orders from the ebayGetOrders Cloud Function
  const loadOrders = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setSoldItems([]);
    setStatusMessage('');

    try {
      const getOrders = httpsCallable<{ limit: number; offset: number }, GetOrdersResponse>(
        functions,
        'ebayGetOrders',
        { timeout: 120000 }
      );

      // Fetch ALL orders with pagination
      const allOrders: EbayOrder[] = [];
      let offset = 0;
      const pageSize = 50;
      let totalOrders = 0;

      do {
        setStatusMessage(`Fetching orders... ${allOrders.length} so far`);
        const result = await getOrders({ limit: pageSize, offset });
        if (!mountedRef.current) return;
        const data = result.data;
        if (!data.success || !data.orders) break;
        allOrders.push(...data.orders);
        totalOrders = data.total || allOrders.length;
        offset += pageSize;
      } while (allOrders.length < totalOrders && offset < 1000);

      if (allOrders.length === 0) {
        setStatusMessage('No eBay orders found.');
        return;
      }

      setStatusMessage(`Processing ${allOrders.length} orders...`);

      // Flatten orders into sold items (one entry per line item)
      const flattened: SoldItem[] = [];
      for (const order of allOrders) {
        for (const lineItem of order.lineItems) {
          const soldPrice = parseFloat(lineItem.lineItemCost?.value || '0') || 0;

          // Try to find an image from local inventory matching this eBay listing ID
          const matchedLocal = items.find(
            (item) =>
              item.ebayListingId === lineItem.legacyItemId ||
              item.ebayItemId === lineItem.legacyItemId
          );
          const imageUrl = matchedLocal?.imageUrl || matchedLocal?.ebayPrimaryImage || null;

          flattened.push({
            id: `${order.orderId}-${lineItem.legacyItemId}`,
            orderId: order.orderId,
            legacyItemId: lineItem.legacyItemId,
            title: lineItem.title,
            soldPrice,
            quantity: lineItem.quantity || 1,
            buyer: order.buyer || 'Unknown',
            creationDate: order.creationDate,
            orderFulfillmentStatus: order.orderFulfillmentStatus,
            imageUrl,
          });
        }
      }

      setSoldItems(flattened);
      setStatusMessage(`Loaded ${flattened.length} sold item${flattened.length !== 1 ? 's' : ''} from ${allOrders.length} order${allOrders.length !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error('[EbaySoldModal] Load error:', error);
      setStatusMessage('Failed to load eBay orders');
      toast.error('Failed to load eBay orders');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [user, items]);

  // Load orders when modal opens
  useEffect(() => {
    if (open && user) {
      loadOrders();
    }
  }, [open, user, loadOrders]);

  // Summary stats
  const summary = useMemo(() => {
    let totalRevenue = 0;
    for (const item of soldItems) {
      totalRevenue += item.soldPrice;
    }
    return {
      count: soldItems.length,
      totalRevenue,
    };
  }, [soldItems]);

  // Selection handlers
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(soldItems.map((s) => s.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Match selected sold items to inventory
  const handleMatchToInventory = useCallback(() => {
    if (selectedIds.size === 0) {
      toast.error('Select sold items first');
      return;
    }

    setIsMatching(true);
    const results = new Map<string, MatchResult>();

    for (const soldItem of soldItems) {
      if (!selectedIds.has(soldItem.id)) continue;

      let bestMatch: Item | null = null;
      let bestScore = 0;

      for (const item of items) {
        // First try exact match by eBay listing ID
        if (
          soldItem.legacyItemId &&
          (item.ebayListingId === soldItem.legacyItemId ||
            item.ebayItemId === soldItem.legacyItemId)
        ) {
          bestMatch = item;
          bestScore = 1.0;
          break;
        }

        // Fall back to fuzzy title match
        const score = similarity(soldItem.title, item.name);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }

      results.set(soldItem.id, {
        soldItemId: soldItem.id,
        matchedItem: bestScore >= MATCH_THRESHOLD ? bestMatch : null,
        confidence: bestScore,
      });
    }

    setMatchResults(results);
    setShowMatchResults(true);
    setIsMatching(false);

    const matchedCount = Array.from(results.values()).filter((r) => r.matchedItem).length;
    toast.success(`Matched ${matchedCount} of ${results.size} sold items to inventory`);
  }, [selectedIds, soldItems, items]);

  // Mark matched items as sold in Firestore
  const handleMarkAsSold = useCallback(async () => {
    if (!user) return;

    const matchedEntries = Array.from(matchResults.entries()).filter(
      ([, result]) => result.matchedItem !== null
    );

    if (matchedEntries.length === 0) {
      toast.error('No matched items to mark as sold');
      return;
    }

    setIsMarkingSold(true);

    let successCount = 0;
    let errorCount = 0;

    for (const [soldItemId, result] of matchedEntries) {
      if (!result.matchedItem) continue;

      const soldItem = soldItems.find((s) => s.id === soldItemId);
      if (!soldItem) continue;

      const soldDate = soldItem.creationDate || new Date().toISOString();
      const soldPrice = soldItem.soldPrice;

      const currentQuantity = result.matchedItem.physicalQuantity ?? 1;
      const existingSales = result.matchedItem.unitSales || [];

      try {
        const itemRef = doc(db, 'Item', result.matchedItem.id);
        await updateDoc(itemRef, {
          status: 'SOLD',
          stockStatus: 'SOLD',
          soldPlatform: 'ebay',
          ebayListingId: soldItem.legacyItemId,
          physicalQuantity: Math.max(0, currentQuantity - 1),
          unitSales: [
            ...existingSales,
            {
              soldAt: soldDate,
              platform: 'ebay',
              priceCents: Math.round(soldPrice * 100),
            },
          ],
          updatedAt: serverTimestamp(),
        });
        successCount++;
      } catch (error) {
        console.error(`[EbaySoldModal] Failed to update item ${result.matchedItem.id}:`, error);
        errorCount++;
      }
    }

    setIsMarkingSold(false);

    if (successCount > 0) {
      toast.success(`Marked ${successCount} item${successCount > 1 ? 's' : ''} as sold`);
      if (user) initializeStore(user.id);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} item${errorCount > 1 ? 's' : ''} failed to update`);
    }
  }, [matchResults, soldItems, user, initializeStore]);

  return (
    <Modal open={open} onOpenChange={onClose} title={inline ? '' : 'eBay Sold Orders'} size="xl" inline={inline}>
      <div className={inline ? 'flex flex-col' : 'flex flex-col h-[80vh]'}>
        {/* Header with counts and actions */}
        <div className="flex-shrink-0 pb-4 border-b border-gray-700">
          {/* Summary */}
          <div className="flex items-center gap-6 mb-4">
            <div className="text-sm">
              <span className="text-gray-400">Sold Items:</span>{' '}
              <span className="font-semibold" style={{ color: EBAY_BLUE }}>
                {summary.count}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-gray-400">Total Revenue:</span>{' '}
              <span className="text-green-400 font-semibold">${summary.totalRevenue.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="text-sm">
              <span className="text-gray-400">Selected:</span>{' '}
              <span className="text-white font-semibold">{selectedIds.size}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                disabled={isLoading || soldItems.length === 0}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={deselectAll}
                disabled={isLoading || selectedIds.size === 0}
              >
                Deselect All
              </Button>
              <Button variant="ghost" size="sm" onClick={loadOrders} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="sm"
                onClick={loadOrders}
                disabled={isLoading}
                style={{ backgroundColor: EBAY_BLUE }}
                className="text-white"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Fetch from eBay
              </Button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleMatchToInventory}
              disabled={isLoading || isMatching || selectedIds.size === 0}
              loading={isMatching}
              style={{ backgroundColor: EBAY_BLUE }}
              className="text-white"
            >
              <Link2 className="mr-2 h-4 w-4" />
              Match to Inventory ({selectedIds.size})
            </Button>
            {showMatchResults && (
              <Button
                onClick={handleMarkAsSold}
                disabled={
                  isMarkingSold ||
                  Array.from(matchResults.values()).filter((r) => r.matchedItem).length === 0
                }
                loading={isMarkingSold}
                className="bg-green-600 hover:bg-green-700"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Mark Selected as Sold (
                {Array.from(matchResults.values()).filter((r) => r.matchedItem).length})
              </Button>
            )}
          </div>

          {statusMessage && <div className="mt-3 text-sm text-gray-400">{statusMessage}</div>}
        </div>

        {/* Match results panel */}
        {showMatchResults && matchResults.size > 0 && (
          <div className="flex-shrink-0 py-3 border-b border-gray-700 max-h-48 overflow-y-auto">
            <p className="text-sm text-gray-400 font-medium mb-2">
              Match Results &mdash;{' '}
              <span className="text-green-400">
                {Array.from(matchResults.values()).filter((r) => r.matchedItem).length} matched
              </span>
              {' / '}
              <span className="text-yellow-400">
                {Array.from(matchResults.values()).filter((r) => !r.matchedItem).length} unmatched
              </span>
            </p>
            <div className="space-y-2">
              {Array.from(matchResults.entries()).map(([soldItemId, result]) => {
                const soldItem = soldItems.find((s) => s.id === soldItemId);
                const title = soldItem?.title || 'Unknown';
                return (
                  <div
                    key={soldItemId}
                    className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                      result.matchedItem
                        ? 'bg-green-900/10 border border-green-700/30'
                        : 'bg-gray-700/20 border border-gray-700/30'
                    }`}
                  >
                    {result.matchedItem ? (
                      <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-200 truncate">
                        {title.substring(0, 60)}
                        {title.length > 60 ? '...' : ''}
                      </p>
                      {result.matchedItem ? (
                        <p className="text-green-400 text-xs truncate">
                          Matched: {result.matchedItem.name} (
                          {Math.round(result.confidence * 100)}% confidence)
                        </p>
                      ) : (
                        <p className="text-yellow-400 text-xs">No match found</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sold items grid */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: EBAY_BLUE }} />
            </div>
          ) : soldItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ShoppingBag className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">No sold orders found</p>
              <p className="text-sm mt-2">
                Click "Fetch from eBay" to load your recent sold orders
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {soldItems.map((soldItem) => {
                const isSelected = selectedIds.has(soldItem.id);
                const soldDate = soldItem.creationDate
                  ? new Date(soldItem.creationDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '';

                return (
                  <div
                    key={soldItem.id}
                    className={`
                      relative bg-gray-800/50 rounded-lg overflow-hidden
                      border-2 transition-all cursor-pointer
                      ${isSelected ? 'border-blue-500' : 'border-gray-700 hover:border-gray-600'}
                    `}
                    onClick={() => toggleSelection(soldItem.id)}
                  >
                    {/* Selection checkbox */}
                    <div className="absolute top-2 left-2 z-10">
                      <div
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center
                          ${isSelected ? 'border-blue-500' : 'bg-gray-900/50 border-gray-600'}
                        `}
                        style={isSelected ? { backgroundColor: EBAY_BLUE, borderColor: EBAY_BLUE } : undefined}
                      >
                        {isSelected && <Check className="h-4 w-4 text-white" />}
                      </div>
                    </div>

                    {/* SOLD badge */}
                    <div className="absolute top-2 right-2 z-10">
                      <span
                        className="text-white text-xs font-bold px-2 py-1 rounded"
                        style={{ backgroundColor: `${EBAY_BLUE}E6` }}
                      >
                        SOLD
                      </span>
                    </div>

                    {/* Image */}
                    {soldItem.imageUrl ? (
                      <img
                        src={soldItem.imageUrl}
                        alt={soldItem.title}
                        className="w-full h-48 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-800 flex items-center justify-center">
                        <Package className="h-12 w-12 text-gray-600" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="p-3">
                      <div className="text-white font-medium text-sm line-clamp-2 mb-2">
                        {soldItem.title}
                      </div>

                      {/* Price info */}
                      <div className="space-y-1 text-xs">
                        {soldItem.soldPrice > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">Sold Price:</span>
                            <span className="text-green-400 font-semibold">
                              ${soldItem.soldPrice.toFixed(2)}
                            </span>
                          </div>
                        )}
                        {soldItem.quantity > 1 && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">Quantity:</span>
                            <span className="text-gray-300">{soldItem.quantity}</span>
                          </div>
                        )}
                      </div>

                      {/* Order details */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {soldDate && <span>Sold {soldDate}</span>}
                        {soldItem.buyer && soldItem.buyer !== 'Unknown' && (
                          <span>to {soldItem.buyer}</span>
                        )}
                      </div>

                      {/* Order status */}
                      <div className="mt-1 text-xs">
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            soldItem.orderFulfillmentStatus === 'FULFILLED'
                              ? 'bg-green-900/30 text-green-400'
                              : soldItem.orderFulfillmentStatus === 'IN_PROGRESS'
                              ? 'bg-yellow-900/30 text-yellow-400'
                              : 'bg-gray-700/50 text-gray-400'
                          }`}
                        >
                          {soldItem.orderFulfillmentStatus || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
