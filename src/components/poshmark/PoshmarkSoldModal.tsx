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
import { getFirestore, doc, getDoc, deleteDoc, collection, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { PoshmarkListing } from '../../services/poshmark/import';
import { toast } from 'sonner';
import type { Item } from '../../types/item';
import { findEbayMatchForListing, EbayMatchResult } from '../../services/inventory/listingMatcher';

const db = getFirestore(app);

const POSHMARK_PURPLE = '#7B2E8E';

interface PoshmarkSoldModalProps {
  open: boolean;
  onClose: () => void;
  /** When true, render in-flow as a page panel (no portal/overlay). Used by /sales. */
  inline?: boolean;
}

interface MatchResult {
  listingId: string;
  matchedItem: Item | null;
  confidence: number;
}

export const PoshmarkSoldModal = ({ open, onClose, inline }: PoshmarkSoldModalProps) => {
  const { items, initializeStore } = useItemStore();
  const { user } = useAuthStore();

  const [listings, setListings] = useState<PoshmarkListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureComplete, setCaptureComplete] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState('');
  const [matchResults, setMatchResults] = useState<Map<string, MatchResult>>(new Map());
  const [isMatching, setIsMatching] = useState(false);
  const [isMarkingSold, setIsMarkingSold] = useState(false);
  const [showMatchResults, setShowMatchResults] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Ensure the item store is populated when the modal opens — otherwise items.length
  // is 0 on open (store-init race) and the matcher returns no candidates.
  useEffect(() => {
    if (open && user && items.length === 0) {
      initializeStore(user.id);
    }
  }, [open, user, items.length, initializeStore]);

  const ebayItems = useMemo(() => {
    const filtered = items.filter(i => i.ebayListingId || i.ebayItemId);
    console.log(`[PoshSoldMatch] eBay items in store: ${filtered.length} out of ${items.length} total`);
    return filtered;
  }, [items]);

  useEffect(() => {
    if (!open) {
      setMatchResults(new Map());
      setShowMatchResults(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [open]);

  // Load listings from Firestore marketplaceData where platform === 'poshmark'
  const loadListings = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setListings([]);
    setStatusMessage('');

    try {
      // Try authenticated location first: users/{userId}/marketplaceData/sync
      const syncRef = doc(db, 'users', user.id, 'marketplaceData', 'sync');
      const syncSnapshot = await getDoc(syncRef);

      let syncData = null;

      if (syncSnapshot.exists()) {
        const data = syncSnapshot.data();
        if (data.platform === 'poshmark') {
          syncData = data;
        }
      }

      if (!syncData) {
        // Try sold-specific doc first
        console.log('[PoshmarkSoldModal] Checking poshmark_sold_retrothriftc0...');
        const soldDocRef = doc(db, 'marketplaceData', 'poshmark_sold_retrothriftc0');
        const soldDocSnap = await getDoc(soldDocRef);
        console.log('[PoshmarkSoldModal] Exists:', soldDocSnap.exists(), 'Listings:', soldDocSnap.data()?.listings?.length || 0);
        if (soldDocSnap.exists()) {
          const data = soldDocSnap.data();
          if (data.listings?.length > 0) syncData = data;
        }
      }

      if (!syncData) {
        // Try fallback: marketplaceData/{userId}
        const userDocRef = doc(db, 'marketplaceData', user.id);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          if (data.platform === 'poshmark') {
            syncData = data;
          }
        }
      }

      if (!syncData) {
        // Try scanning all marketplaceData documents for poshmark
        const publicSnapshot = await getDocs(collection(db, 'marketplaceData'));
        for (const d of publicSnapshot.docs) {
          const data = d.data();
          if (data.platform === 'poshmark' && data.listings && Array.isArray(data.listings) && data.listings.length > 0) {
            syncData = data;
            break;
          }
        }
      }

      if (!syncData?.listings || !Array.isArray(syncData.listings)) {
        setStatusMessage('No Poshmark listings found. Please sync from the integration page first.');
        return;
      }

      const poshmarkListings = syncData.listings as PoshmarkListing[];
      setListings(poshmarkListings);
    } catch (error) {
      console.error('[PoshmarkSoldModal] Load error:', error);
      setStatusMessage('Failed to load Poshmark listings');
      toast.error('Failed to load Poshmark listings');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Open Poshmark sales tab and start capturing
  const startCapture = useCallback(async () => {
    if (!user) return;

    // Reset
    setListings([]);
    setSelectedIds(new Set());
    setCaptureComplete(false);
    setStatusMessage('Opening Poshmark sales page... complete any security checks if prompted');
    setIsCapturing(true);

    // Clear old sold data
    try { await deleteDoc(doc(db, 'marketplaceData', 'poshmark_sold_retrothriftc0')); } catch {}

    // Open the Poshmark order/sales page
    window.open('https://poshmark.com/order/sales#autoScroll', '_blank');
    setTimeout(() => window.focus(), 500);

    // Poll for fresh data after 20s
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      loadListings().then(() => {
        if (mountedRef.current) {
          setIsCapturing(false);
          setCaptureComplete(true);
        }
      });
    }, 20000);

    timeoutRef.current = timer;
  }, [user, loadListings]);

  // Auto-start capture when modal opens
  useEffect(() => {
    if (!open || !user) return;
    startCapture();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [open, user]);

  // Filter to REAL sold items only — exclude refunded/cancelled/returned
  // (Poshmark marks these is_refunded; they are not real sales).
  const soldListings = useMemo(() => {
    const filtered = listings.filter(
      (listing: any) =>
        (listing as any).is_refunded !== true &&
        (listing.sold ||
          listing.status === 'sold' ||
          listing.status === 'sold_out' ||
          listing.status === 'not_for_sale')
    );
    // Render in Poshmark's real page order: scrape_index (0 = top = newest)
    // ascending. ObjectId-derived sold_date_iso is unreliable, so it is no
    // longer used for ordering. Rows with no finite scrape_index sort AFTER
    // ranked rows, preserving their original relative array order (stable:
    // large sentinel + original-index tiebreak).
    const SENTINEL = Number.MAX_SAFE_INTEGER;
    const rank = (l: any) =>
      typeof l.scrape_index === 'number' && Number.isFinite(l.scrape_index)
        ? l.scrape_index
        : SENTINEL;
    return filtered
      .map((listing: any, idx: number) => ({ listing, idx }))
      .sort((a, b) => {
        const ra = rank(a.listing);
        const rb = rank(b.listing);
        if (ra !== rb) return ra - rb;
        return a.idx - b.idx;
      })
      .map(x => x.listing);
  }, [listings]);

  const ebayMatches = useMemo(() => {
    const map = new Map<string, EbayMatchResult>();
    if (soldListings.length === 0 || ebayItems.length === 0) return map;
    for (const listing of soldListings) {
      const listingId = listing.listing_id || listing.id;
      const title = listing.title || listing.description || '';
      const size = listing.size || '';
      const match = findEbayMatchForListing(title, size, ebayItems);
      if (match) map.set(listingId, match);
    }
    console.log(`[PoshSoldMatch] Result: ${map.size}/${soldListings.length} matched`);
    return map;
  }, [soldListings, ebayItems]);

  // Summary stats
  const summary = useMemo(() => {
    let totalRevenue = 0;
    for (const listing of soldListings) {
      const price = typeof listing.price === 'number' ? listing.price : parseFloat(String(listing.price) || '0') || 0;
      totalRevenue += price;
    }
    return {
      count: soldListings.length,
      totalRevenue,
    };
  }, [soldListings]);

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
    setSelectedIds(new Set(soldListings.map((l) => l.listing_id || l.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const getListingId = (listing: PoshmarkListing): string => listing.listing_id || listing.id;

  const getListingImage = (listing: PoshmarkListing): string | null => {
    return listing.cover_shot || listing.imageUrl || listing.images?.[0] || null;
  };

  // Match selected sold items to inventory
  const handleMatchToInventory = useCallback(() => {
    if (selectedIds.size === 0) {
      toast.error('Select sold items first');
      return;
    }

    setIsMatching(true);
    const results = new Map<string, MatchResult>();

    for (const listing of soldListings) {
      const listingId = getListingId(listing);
      if (!selectedIds.has(listingId)) continue;

      const listingTitle = listing.title || listing.description || '';
      const listingSize = listing.size || '';
      const ebayMatch = findEbayMatchForListing(listingTitle, listingSize, items);

      results.set(listingId, {
        listingId,
        matchedItem: ebayMatch ? ebayMatch.ebayItem : null,
        confidence: ebayMatch ? ebayMatch.confidence : 0,
      });
    }

    setMatchResults(results);
    setShowMatchResults(true);
    setIsMatching(false);

    const matchedCount = Array.from(results.values()).filter((r) => r.matchedItem).length;
    toast.success(`Matched ${matchedCount} of ${results.size} sold items to inventory`);
  }, [selectedIds, soldListings, items]);

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

    for (const [listingId, result] of matchedEntries) {
      if (!result.matchedItem) continue;

      const listing = soldListings.find((l) => getListingId(l) === listingId);
      if (!listing) continue;

      const soldDate = new Date().toISOString();
      const soldPrice =
        typeof listing.price === 'number'
          ? listing.price
          : parseFloat(String(listing.price) || '0') || 0;

      const currentQuantity = result.matchedItem.physicalQuantity ?? 1;
      const existingSales = result.matchedItem.unitSales || [];

      try {
        const itemRef = doc(db, 'Item', result.matchedItem.id);
        await updateDoc(itemRef, {
          status: 'SOLD',
          stockStatus: 'SOLD',
          soldPlatform: 'poshmark',
          poshmarkListingId: listingId,
          physicalQuantity: Math.max(0, currentQuantity - 1),
          unitSales: [
            ...existingSales,
            {
              soldAt: soldDate,
              platform: 'poshmark',
              priceCents: Math.round(soldPrice * 100),
            },
          ],
          updatedAt: serverTimestamp(),
        });
        successCount++;
      } catch (error) {
        console.error(`[PoshmarkSoldModal] Failed to update item ${result.matchedItem.id}:`, error);
        errorCount++;
      }
    }

    setIsMarkingSold(false);

    if (successCount > 0) {
      toast.success(`Marked ${successCount} item${successCount > 1 ? 's' : ''} as sold`);
      // Refresh the item store
      if (user) initializeStore(user.id);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} item${errorCount > 1 ? 's' : ''} failed to update`);
    }
  }, [matchResults, soldListings, user, initializeStore]);

  return (
    <Modal open={open} onOpenChange={onClose} title={inline ? '' : 'Sold Poshmark Items'} size="xl" inline={inline}>
      <div className={inline ? 'flex flex-col' : 'flex flex-col h-[80vh]'}>
        {/* Header with counts and actions */}
        <div className="flex-shrink-0 pb-4 border-b border-gray-700">
          {/* Summary */}
          <div className="flex items-center gap-6 mb-4">
            <div className="text-sm">
              <span className="text-gray-400">Sold Items:</span>{' '}
              <span className="font-semibold" style={{ color: POSHMARK_PURPLE }}>
                {summary.count}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-gray-400">Total Revenue:</span>{' '}
              <span className="text-green-400 font-semibold">${summary.totalRevenue.toFixed(2)}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-400">eBay Matched:</span>{' '}
              <span className="text-blue-400 font-semibold">{ebayMatches.size}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-400">eBay Pool:</span>{' '}
              <span className={`font-semibold ${ebayItems.length > 0 ? 'text-green-400' : 'text-red-400'}`}>{ebayItems.length}</span>
            </div>
          </div>

          {/* Capture status */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {isCapturing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: POSHMARK_PURPLE }} />
                  <span className="font-medium" style={{ color: POSHMARK_PURPLE }}>
                    Capturing sold items... {listings.length > 0 ? `${listings.length} found` : ''}
                  </span>
                </div>
              ) : captureComplete ? (
                <span className="text-green-400 font-medium">
                  {soldListings.length} sold items loaded
                </span>
              ) : (
                <div className="text-sm">
                  <span className="text-gray-400">Selected:</span>{' '}
                  <span className="text-white font-semibold">{selectedIds.size}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isCapturing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    window.open('https://poshmark.com/order/sales#autoScroll', '_blank');
                    setTimeout(() => window.focus(), 500);
                  }}
                  className="hover:opacity-80"
                  style={{ color: POSHMARK_PURPLE }}
                >
                  Reopen Poshmark
                </Button>
              )}
              {!isCapturing && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAll}
                    disabled={isLoading || soldListings.length === 0}
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
                  <Button variant="ghost" size="sm" onClick={loadListings} disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startCapture}
                    disabled={isCapturing}
                    className="hover:opacity-80"
                    style={{ color: POSHMARK_PURPLE }}
                  >
                    Retry Capture
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleMatchToInventory}
              disabled={isLoading || isMatching || selectedIds.size === 0}
              loading={isMatching}
              className="bg-blue-600 hover:bg-blue-700"
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
                style={{ backgroundColor: POSHMARK_PURPLE }}
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
              {Array.from(matchResults.entries()).map(([listingId, result]) => {
                const listing = soldListings.find((l) => getListingId(l) === listingId);
                const title = listing?.title || listing?.description || 'Unknown';
                return (
                  <div
                    key={listingId}
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

        {/* Listings grid */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: POSHMARK_PURPLE }} />
            </div>
          ) : soldListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ShoppingBag className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">No sold items found</p>
              <p className="text-sm mt-2">
                Sync your sold items from the Poshmark integration page first
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {soldListings.map((listing) => {
                const listingId = getListingId(listing);
                const isSelected = selectedIds.has(listingId);
                const imageUrl = getListingImage(listing);
                const match = ebayMatches.get(listingId);
                const displayTitle = match ? match.ebayItem.name : (listing.title || listing.description || 'Item ' + listingId);
                const ebayImg = match ? (match.ebayItem.imageUrl || match.ebayItem.ebayPrimaryImage || match.ebayItem.ebayPhotos?.[0]?.firebaseStorageUrl || match.ebayItem.ebayPhotos?.[0]?.ebayUrl || null) : null;
                const soldPrice =
                  typeof listing.price === 'number'
                    ? listing.price
                    : parseFloat(String(listing.price) || '0') || 0;
                const buyer = (listing as any)._buyerUsername || (listing as any).buyer || '';
                const soldDate = (listing as any).sold_date_iso || (listing as any).sold_date || (listing as any)._soldDate || (listing as any).soldDate;
                const soldDateFormatted = soldDate
                  ? new Date(soldDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '';

                return (
                  <div
                    key={listingId}
                    className={`
                      relative bg-gray-800/50 rounded-lg overflow-hidden
                      border-2 transition-all cursor-pointer
                      ${isSelected ? 'border-purple-500' : 'border-gray-700 hover:border-gray-600'}
                    `}
                    style={isSelected ? { borderColor: POSHMARK_PURPLE } : undefined}
                    onClick={() => toggleSelection(listingId)}
                  >
                    {/* Selection checkbox */}
                    <div className="absolute top-2 left-2 z-10">
                      <div
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center
                          ${isSelected ? 'border-purple-500' : 'bg-gray-900/50 border-gray-600'}
                        `}
                        style={isSelected ? { backgroundColor: POSHMARK_PURPLE, borderColor: POSHMARK_PURPLE } : undefined}
                      >
                        {isSelected && <Check className="h-4 w-4 text-white" />}
                      </div>
                    </div>

                    {/* SOLD badge */}
                    <div className="absolute top-2 right-2 z-10">
                      <span
                        className="text-white text-xs font-bold px-2 py-1 rounded"
                        style={{ backgroundColor: `${POSHMARK_PURPLE}E6` }}
                      >
                        SOLD
                      </span>
                    </div>

                    {/* Image area with eBay match overlay */}
                    <div className="relative">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={displayTitle}
                          className="w-full h-48 object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-48 bg-gray-800 flex items-center justify-center">
                          <Package className="h-12 w-12 text-gray-600" />
                        </div>
                      )}

                      {/* eBay match overlay — bottom of image */}
                      {match && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 flex items-center gap-1.5">
                          {ebayImg && (
                            <img src={typeof ebayImg === 'string' ? ebayImg : (ebayImg as string[])[0]} alt="" className="w-6 h-6 rounded object-cover border border-blue-500/60 flex-shrink-0" loading="lazy" />
                          )}
                          <span className="text-[9px] font-semibold text-blue-300 truncate flex-1">eBay Match</span>
                          <span className="text-[9px] font-bold text-blue-400 flex-shrink-0">{Math.round(match.confidence * 100)}%</span>
                        </div>
                      )}
                    </div>

                    {/* Info — shows eBay title when matched */}
                    <div className="p-3">
                      <div className="text-white font-medium text-sm line-clamp-2 mb-2">
                        {displayTitle}
                      </div>

                      {/* Price info */}
                      <div className="space-y-1 text-xs">
                        {soldPrice > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">Price:</span>
                            <span className="text-green-400 font-semibold">
                              ${soldPrice.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Sold details */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {soldDateFormatted && <span>Sold {soldDateFormatted}</span>}
                        {buyer && <span>to @{buyer}</span>}
                      </div>

                      {listing.size && (
                        <div className="text-xs text-gray-400 mt-1">
                          Size: {listing.size}
                        </div>
                      )}
                      {listing.brand && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {listing.brand}
                        </div>
                      )}
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
