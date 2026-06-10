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
import { DepopListing } from '../../services/depop/import';
import { getDepopListingImage } from '../../services/depop/extractors';
import { findEbayMatchForListing, EbayMatchResult } from '../../services/inventory/listingMatcher';
import { toast } from 'sonner';
import type { Item } from '../../types/item';

const db = getFirestore(app);

interface DepopSoldModalProps {
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

export const DepopSoldModal = ({ open, onClose, inline }: DepopSoldModalProps) => {
  const { items, initializeStore } = useItemStore();
  const { user } = useAuthStore();

  const [listings, setListings] = useState<DepopListing[]>([]);
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

  // eBay items from store for matching
  const ebayItems = useMemo(() => {
    const filtered = items.filter(i => i.ebayListingId || i.ebayItemId);
    console.log(`[DepopSoldMatch] eBay items in store: ${filtered.length} out of ${items.length} total`);
    return filtered;
  }, [items]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Ensure the item store is populated when the modal opens. Without this, items.length
  // can be 0 on open (race: store not initialized yet), ebayItems is empty, and the
  // matcher returns no candidates for every sold listing.
  useEffect(() => {
    if (open && user && items.length === 0) {
      initializeStore(user.id);
    }
  }, [open, user, items.length, initializeStore]);

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

  // Load listings from Firestore (same data source as DepopImportModal)
  const loadListings = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setListings([]);
    setStatusMessage('');

    try {
      let syncData = null;

      // Try sold-specific doc first
      for (const docId of ['depop_sold_265732668', 'depop_sold_dallassports', '265732668']) {
        const soldRef = doc(db, 'marketplaceData', docId);
        const soldSnap = await getDoc(soldRef);
        if (soldSnap.exists()) {
          const data = soldSnap.data();
          if (data.listings?.length > 0) {
            syncData = data;
            console.log('[DepopSoldModal] Found sold data at', docId, ':', data.listings.length, 'listings');
            break;
          }
        }
      }

      // Fallback: scan all marketplaceData
      if (!syncData) {
        const publicSnapshot = await getDocs(collection(db, 'marketplaceData'));
        for (const d of publicSnapshot.docs) {
          const data = d.data();
          if (data.platform === 'depop' && data.listings?.length > 0) {
            syncData = data;
            break;
          }
        }
      }

      if (!syncData?.listings || !Array.isArray(syncData.listings)) {
        setStatusMessage('No Depop listings found. Please sync from the extension first.');
        return;
      }

      const depopListings = syncData.listings as DepopListing[];
      setListings(depopListings);
    } catch (error) {
      console.error('[DepopSoldModal] Load error:', error);
      setStatusMessage('Failed to load Depop listings');
      toast.error('Failed to load Depop listings');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Open Depop sold tab and start capturing
  const startCapture = useCallback(async () => {
    if (!user) return;

    // Reset
    setListings([]);
    setSelectedIds(new Set());
    setCaptureComplete(false);
    setStatusMessage('Opening Depop sold page... complete any security checks if prompted');
    setIsCapturing(true);

    // Clear old sold data
    try { await deleteDoc(doc(db, 'marketplaceData', 'depop_sold_265732668')); } catch {}

    // Open the Depop selling hub sold page
    window.open('https://www.depop.com/sellinghub/sold-items/#autoScroll', '_blank');
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

  // Filter to sold items only
  const soldListings = useMemo(() => {
    return listings.filter(
      (listing: any) =>
        listing.sold ||
        listing._soldFromAPI ||
        (listing.status && listing.status !== 'ONSALE' && listing.status !== 'onsale')
    );
  }, [listings]);

  // Auto-match sold listings to eBay items
  const ebayMatches = useMemo(() => {
    const map = new Map<string, EbayMatchResult>();
    if (soldListings.length === 0 || ebayItems.length === 0) return map;
    for (const listing of soldListings) {
      const title = listing.description || listing.title || '';
      const size = listing.sizes?.[0] || listing.size || '';
      const match = findEbayMatchForListing(title, size, ebayItems);
      if (match) map.set(listing.id, match);
    }
    console.log(`[DepopSoldMatch] Result: ${map.size}/${soldListings.length} matched`);
    return map;
  }, [soldListings, ebayItems]);

  // Summary stats
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let totalPayout = 0;
    for (const listing of soldListings) {
      const l = listing as any;
      const soldPrice = typeof l._soldPrice === 'number' ? l._soldPrice : parseFloat(l._soldPrice || '0') || 0;
      const sellerPaid = typeof l._sellerPaidAmount === 'number' ? l._sellerPaidAmount : parseFloat(l._sellerPaidAmount || '0') || 0;
      totalRevenue += soldPrice;
      totalPayout += sellerPaid;
    }
    return {
      count: soldListings.length,
      totalRevenue,
      totalPayout,
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
    setSelectedIds(new Set(soldListings.map((l) => l.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Match selected sold items to inventory using the listingMatcher
  const handleMatchToInventory = useCallback(() => {
    if (selectedIds.size === 0) {
      toast.error('Select sold items first');
      return;
    }

    setIsMatching(true);
    const results = new Map<string, MatchResult>();

    for (const listing of soldListings) {
      if (!selectedIds.has(listing.id)) continue;

      // Use pre-computed ebayMatches first, fall back to live match
      const ebayMatch = ebayMatches.get(listing.id);
      if (ebayMatch) {
        results.set(listing.id, {
          listingId: listing.id,
          matchedItem: ebayMatch.ebayItem,
          confidence: ebayMatch.confidence,
        });
      } else {
        // Try a live match against all items (not just eBay)
        const title = listing.description || listing.title || '';
        const size = listing.sizes?.[0] || listing.size || '';
        const liveMatch = findEbayMatchForListing(title, size, ebayItems);
        results.set(listing.id, {
          listingId: listing.id,
          matchedItem: liveMatch ? liveMatch.ebayItem : null,
          confidence: liveMatch ? liveMatch.confidence : 0,
        });
      }
    }

    setMatchResults(results);
    setShowMatchResults(true);
    setIsMatching(false);

    const matchedCount = Array.from(results.values()).filter((r) => r.matchedItem).length;
    toast.success(`Matched ${matchedCount} of ${results.size} sold items to inventory`);
  }, [selectedIds, soldListings, ebayMatches, ebayItems]);

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

      const listing = soldListings.find((l) => l.id === listingId) as any;
      if (!listing) continue;

      const soldDate = listing._soldDate || new Date().toISOString();
      const soldPrice =
        typeof listing._soldPrice === 'number'
          ? listing._soldPrice
          : parseFloat(listing._soldPrice || '0') || 0;

      const currentQuantity = result.matchedItem.physicalQuantity ?? 1;
      const existingSales = result.matchedItem.unitSales || [];

      try {
        const itemRef = doc(db, 'Item', result.matchedItem.id);
        await updateDoc(itemRef, {
          status: 'SOLD',
          stockStatus: 'SOLD',
          soldPlatform: 'depop',
          depopListingId: listingId,
          physicalQuantity: Math.max(0, currentQuantity - 1),
          unitSales: [
            ...existingSales,
            {
              soldAt: soldDate,
              platform: 'depop',
              priceCents: Math.round(soldPrice * 100),
            },
          ],
          updatedAt: serverTimestamp(),
        });
        successCount++;
      } catch (error) {
        console.error(`[DepopSoldModal] Failed to update item ${result.matchedItem.id}:`, error);
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
    <Modal open={open} onOpenChange={onClose} title={inline ? '' : 'Sold Depop Items'} size="xl" inline={inline}>
      <div className={inline ? 'flex flex-col' : 'flex flex-col h-[80vh]'}>
        {/* Header with counts and actions */}
        <div className="flex-shrink-0 pb-4 border-b border-gray-700">
          {/* Summary */}
          <div className="flex items-center gap-6 mb-4">
            <div className="text-sm">
              <span className="text-gray-400">Sold Items:</span>{' '}
              <span className="text-red-400 font-semibold">{summary.count}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-400">Total Revenue:</span>{' '}
              <span className="text-green-400 font-semibold">${summary.totalRevenue.toFixed(2)}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-400">Your Payout:</span>{' '}
              <span className="text-blue-400 font-semibold">${summary.totalPayout.toFixed(2)}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-400">eBay Pool:</span>{' '}
              <span className={`font-semibold ${ebayItems.length > 0 ? 'text-green-400' : 'text-red-400'}`}>{ebayItems.length}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-400">eBay Matched:</span>{' '}
              <span className="text-blue-400 font-semibold">{ebayMatches.size}</span>
            </div>
          </div>

          {/* Capture status */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {isCapturing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-red-400" />
                  <span className="text-red-400 font-medium">
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
                    window.open('https://www.depop.com/sellinghub/sold-items/#autoScroll', '_blank');
                    setTimeout(() => window.focus(), 500);
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  Reopen Depop
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
                    className="text-red-400 hover:text-red-300"
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
                className="bg-red-600 hover:bg-red-700"
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
                const listing = soldListings.find((l) => l.id === listingId);
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
              <Loader2 className="h-8 w-8 text-red-400 animate-spin" />
            </div>
          ) : soldListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ShoppingBag className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">No sold items found</p>
              <p className="text-sm mt-2">
                Sync your sold items from the Chrome extension or Depop selling hub
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {soldListings.map((listing) => {
                const l = listing as any;
                const isSelected = selectedIds.has(listing.id);
                const imageUrl = getDepopListingImage(listing);
                const title = listing.title || listing.description || `Item ${listing.id}`;
                const match = ebayMatches.get(listing.id);
                const displayTitle = match ? match.ebayItem.name : title;
                const ebayImg = match ? (match.ebayItem.imageUrl || match.ebayItem.ebayPrimaryImage || (match.ebayItem as any).ebayPhotos?.[0]?.firebaseStorageUrl || (match.ebayItem as any).ebayPhotos?.[0]?.ebayUrl || null) : null;
                const soldPrice =
                  typeof l._soldPrice === 'number'
                    ? l._soldPrice
                    : parseFloat(l._soldPrice || '0') || 0;
                const sellerPaid =
                  typeof l._sellerPaidAmount === 'number'
                    ? l._sellerPaidAmount
                    : parseFloat(l._sellerPaidAmount || '0') || 0;
                const soldDate = l._soldDate
                  ? new Date(l._soldDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '';
                const buyer = l._buyerUsername || '';

                return (
                  <div
                    key={listing.id}
                    className={`
                      relative bg-gray-800/50 rounded-lg overflow-hidden
                      border-2 transition-all cursor-pointer
                      ${isSelected ? 'border-red-500' : 'border-gray-700 hover:border-gray-600'}
                    `}
                    onClick={() => toggleSelection(listing.id)}
                  >
                    {/* Selection checkbox */}
                    <div className="absolute top-2 left-2 z-10">
                      <div
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center
                          ${isSelected ? 'bg-red-500 border-red-500' : 'bg-gray-900/50 border-gray-600'}
                        `}
                      >
                        {isSelected && <Check className="h-4 w-4 text-white" />}
                      </div>
                    </div>

                    {/* SOLD badge */}
                    <div className="absolute top-2 right-2 z-10">
                      <span className="bg-red-500/90 text-white text-xs font-bold px-2 py-1 rounded">
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

                      {/* eBay match overlay — small thumbnail + confidence at bottom of image */}
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
                            <span className="text-gray-400">Buyer paid:</span>
                            <span className="text-green-400 font-semibold">
                              ${soldPrice.toFixed(2)}
                            </span>
                          </div>
                        )}
                        {sellerPaid > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">Your payout:</span>
                            <span className="text-blue-400 font-semibold">
                              ${sellerPaid.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Sold details */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {soldDate && <span>Sold {soldDate}</span>}
                        {buyer && <span>to @{buyer}</span>}
                      </div>

                      {listing.sizes?.[0] && (
                        <div className="text-xs text-gray-400 mt-1">
                          Size: {listing.sizes[0]}
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
