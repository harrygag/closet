import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { useEbayStore } from '../../store/useEbayStore';
import { ebayService, ListingPreview } from '../../services/ebayService';
import { fetchEbayListings, importEbayItems } from '../../services/ebay/import';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { ShoppingBag, Check, Loader2, Trash2, Download, RefreshCw } from 'lucide-react';

interface EbayImportModalProps {
  open: boolean;
  onClose: () => void;
  /** When true, render in-flow as a page panel (no portal/overlay). Used by /import. */
  inline?: boolean;
}

export const EbayImportModal = ({ open, onClose, inline }: EbayImportModalProps) => {
  const { items } = useItemStore();
  const { user } = useAuthStore();
  const { importItems } = useEbayStore();

  // Fast loading state
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [listings, setListings] = useState<ListingPreview[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isAutoLoading, setIsAutoLoading] = useState(false);

  // UI state
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [deleting, setDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoLoadRef = useRef(false);
  const mountedRef = useRef(true);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      autoLoadRef.current = false;
      setIsAutoLoading(false);
      setImporting(false);
      setDeleting(false);
    }
  }, [open]);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      autoLoadRef.current = false;
    };
  }, []);

  // Suppression list - eBay IDs the user explicitly deleted (should not be auto-reimported)
  const [suppressedIds, setSuppressedIds] = useState<Set<string>>(new Set());

  // Load suppression list from Firestore when modal opens
  useEffect(() => {
    if (!open || !user) return;
    const db = getFirestore(app);
    getDoc(doc(db, 'importSuppressions', user.id)).then(snap => {
      if (snap.exists()) {
        const ids: string[] = snap.data().ids || [];
        setSuppressedIds(new Set(ids));
        console.log(`[EbayImportModal] Loaded ${ids.length} suppressed eBay IDs`);
      }
    }).catch(err => console.warn('[EbayImportModal] Failed to load suppressions:', err));
  }, [open, user]);

  // Track which eBay items are already imported
  const existingEbayIds = useMemo(() => {
    return new Set(items.map(item => (item as any).ebayListingId).filter(Boolean));
  }, [items]);

  // FAST: Get count first (~50ms), then first page (~200ms), then auto-load rest
  const loadInitial = useCallback(async () => {
    if (!user || !mountedRef.current) return;

    setIsLoadingCount(true);
    setListings([]);
    setCurrentPage(0);
    setTotalCount(null);
    setStatusMessage('');
    setSelectedIds(new Set());
    autoLoadRef.current = false;

    try {
      // Step 1: Get count (very fast ~50ms)
      console.log('[EbayImportModal] Getting listing count...');
      const countStart = Date.now();
      const countResult = await ebayService.getListingCount();

      if (!mountedRef.current) return;

      console.log(`[EbayImportModal] Count: ${countResult.total} (${Date.now() - countStart}ms)`);

      setTotalCount(countResult.total);
      setIsLoadingCount(false);

      if (countResult.total === 0) {
        setStatusMessage('No active listings found on eBay');
        return;
      }

      // Step 2: Get first page (fast ~200ms)
      setIsLoadingPage(true);
      console.log('[EbayImportModal] Loading first page...');
      const pageStart = Date.now();
      const pageResult = await ebayService.getListingsPreview(1, 50);

      if (!mountedRef.current) return;

      console.log(`[EbayImportModal] Page 1: ${pageResult.listings.length} items (${Date.now() - pageStart}ms)`);

      setListings(pageResult.listings);
      setCurrentPage(1);
      setHasMore(pageResult.hasMore);
      setIsLoadingPage(false);

      // Step 3: Auto-load remaining pages in background
      if (pageResult.hasMore && mountedRef.current) {
        autoLoadRef.current = true;
        setIsAutoLoading(true);
      }

    } catch (err) {
      console.error('[EbayImportModal] Error loading listings:', err);
      if (mountedRef.current) {
        setStatusMessage('Error loading listings');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoadingCount(false);
        setIsLoadingPage(false);
      }
    }
  }, [user]);

  // Auto-load remaining pages in background
  useEffect(() => {
    if (!isAutoLoading || !autoLoadRef.current || !mountedRef.current) return;

    const loadNextPage = async () => {
      if (!autoLoadRef.current || !hasMore || !mountedRef.current) {
        if (mountedRef.current) setIsAutoLoading(false);
        return;
      }

      const nextPage = currentPage + 1;
      try {
        console.log(`[EbayImportModal] Auto-loading page ${nextPage}...`);
        const pageResult = await ebayService.getListingsPreview(nextPage, 50);

        // Check if still mounted and should continue loading
        if (!autoLoadRef.current || !mountedRef.current) return;

        setListings(prev => [...prev, ...pageResult.listings]);
        setCurrentPage(nextPage);
        setHasMore(pageResult.hasMore);

        if (!pageResult.hasMore) {
          setIsAutoLoading(false);
          autoLoadRef.current = false;
        }
      } catch (err) {
        console.error('[EbayImportModal] Auto-load error:', err);
        if (mountedRef.current) {
          setIsAutoLoading(false);
        }
        autoLoadRef.current = false;
      }
    };

    // Small delay between pages to not overwhelm
    const timer = setTimeout(loadNextPage, 100);
    return () => clearTimeout(timer);
  }, [isAutoLoading, hasMore, currentPage]);

  // Load initial on open
  useEffect(() => {
    if (open && user) {
      loadInitial();
    }
    return () => {
      autoLoadRef.current = false;
    };
  }, [open, user, loadInitial]);

  // Selection handlers
  const handleToggleSelect = (itemId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    const availableIds = inStockListings
      .filter(l => !existingEbayIds.has(l.itemId))
      .map(l => l.itemId);

    if (selectedIds.size === availableIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableIds));
    }
  };

  // Delete non-eBay items
  const handleDeleteNonEbay = async () => {
    if (!confirm('Delete all items that were NOT imported from eBay?')) return;

    setDeleting(true);
    setStatusMessage('Deleting non-eBay items...');
    try {
      const result = await ebayService.deleteItemsWithoutEbay();
      if (!mountedRef.current) return;
      setStatusMessage(`Deleted ${result.deletedCount} non-eBay items`);
      if (user) await useItemStore.getState().initializeStore(user.id);
    } catch (error) {
      console.error('[EbayImportModal] Delete failed:', error);
      if (mountedRef.current) {
        setStatusMessage('Failed to delete items');
      }
    } finally {
      if (mountedRef.current) {
        setDeleting(false);
      }
    }
  };

  // Delete ALL items
  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL items? This cannot be undone.')) return;

    setDeleting(true);
    setStatusMessage('Deleting all items...');
    try {
      const result = await ebayService.deleteAllItems();
      if (!mountedRef.current) return;
      setStatusMessage(`Deleted ${result.deletedCount} items`);
      if (user) await useItemStore.getState().initializeStore(user.id);
    } catch (error) {
      console.error('[EbayImportModal] Delete failed:', error);
      if (mountedRef.current) {
        setStatusMessage('Failed to delete items');
      }
    } finally {
      if (mountedRef.current) {
        setDeleting(false);
      }
    }
  };

  // Delete items imported in the last hour (undo accidental import)
  const handleDeleteRecentImports = async () => {
    if (!user) return;
    if (!confirm('Delete all eBay items imported in the last hour? Use this to undo an accidental import.')) return;

    setDeleting(true);
    setStatusMessage('Finding recently imported items...');
    try {
      const db = getFirestore(app);
      const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      // Query items created recently that have an ebayListingId (eBay imports)
      const q = query(
        collection(db, 'Item'),
        where('user_uuid', '==', user.id),
        where('marketplace', '==', 'ebay'),
        where('createdAt', '>=', cutoff.toISOString())
      );

      const snap = await getDocs(q);
      if (!mountedRef.current) return;

      if (snap.empty) {
        setStatusMessage('No recent eBay imports found in the last hour');
        return;
      }

      setStatusMessage(`Deleting ${snap.size} recently imported items...`);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));

      if (!mountedRef.current) return;
      setStatusMessage(`Deleted ${snap.size} recently imported eBay items`);
      await useItemStore.getState().initializeStore(user.id);
    } catch (error) {
      console.error('[EbayImportModal] Delete recent imports failed:', error);
      if (mountedRef.current) {
        setStatusMessage('Failed — try deleting items manually from the closet');
      }
    } finally {
      if (mountedRef.current) setDeleting(false);
    }
  };

  // Delete BROKEN items (empty titles from failed imports)
  const handleDeleteBroken = async () => {
    if (!confirm('Delete all broken items (items with empty titles from failed imports)?')) return;

    setDeleting(true);
    setStatusMessage('Deleting broken items... This may take a few minutes.');
    try {
      const result = await ebayService.deleteBrokenItems();
      if (!mountedRef.current) return;
      setStatusMessage(`Deleted ${result.deletedCount} broken items`);
      if (user) await useItemStore.getState().initializeStore(user.id);
    } catch (error) {
      console.error('[EbayImportModal] Delete broken items failed:', error);
      if (mountedRef.current) {
        setStatusMessage('Failed to delete broken items');
      }
    } finally {
      if (mountedRef.current) {
        setDeleting(false);
      }
    }
  };

  // IMPORT ALL: Frontend-controlled import that respects the suppression list
  const handleImportAll = async (deleteFirst: boolean = false) => {
    if (deleteFirst && !confirm('DELETE all items and import fresh from eBay?')) return;
    if (!user) return;

    setImporting(true);
    setImportProgress({ current: 0, total: 0 });

    try {
      if (deleteFirst) {
        setStatusMessage('Deleting existing items...');
        await ebayService.deleteAllItems();
        if (!mountedRef.current) return;
      }

      setStatusMessage('Fetching eBay listings...');
      const allListings = await fetchEbayListings(user.id);
      if (!mountedRef.current) return;

      // Filter out suppressed IDs (items the user deliberately deleted)
      const currentSuppressed = suppressedIds;
      const toImport = allListings.filter(l => !currentSuppressed.has(l.itemId));
      const suppressedCount = allListings.length - toImport.length;

      console.log(`[Import All] ${allListings.length} listings, ${suppressedCount} suppressed, ${toImport.length} to import`);

      if (toImport.length === 0) {
        setStatusMessage('Nothing new to import (all listings already in inventory or suppressed)');
        return;
      }

      setStatusMessage(`Importing ${toImport.length} listings${suppressedCount > 0 ? ` (skipping ${suppressedCount} deleted items)` : ''}...`);
      setImportProgress({ current: 0, total: toImport.length });

      // Import in batches of 10
      const batchSize = 10;
      let totalImported = 0;
      let totalSkipped = 0;

      for (let i = 0; i < toImport.length; i += batchSize) {
        if (!mountedRef.current) return;
        const batch = toImport.slice(i, i + batchSize);
        const result = await importEbayItems(user.id, batch);
        totalImported += result.imported.length;
        totalSkipped += result.skipped.length;
        setImportProgress({ current: Math.min(i + batchSize, toImport.length), total: toImport.length });
        setStatusMessage(`Importing... ${Math.min(i + batchSize, toImport.length)}/${toImport.length}`);
      }

      if (mountedRef.current) {
        setStatusMessage(`Done! Imported ${totalImported} items (${totalSkipped} already existed${suppressedCount > 0 ? `, ${suppressedCount} skipped — previously deleted` : ''})`);
      }
      await useItemStore.getState().initializeStore(user.id);

    } catch (error) {
      console.error('[EbayImportModal] Import failed:', error);
      if (mountedRef.current) {
        setStatusMessage('Import failed - check console');
      }
    } finally {
      if (mountedRef.current) {
        setImporting(false);
        setImportProgress({ current: 0, total: 0 });
      }
    }
  };

  // IMPORT SELECTED: Import only selected items
  const handleImportSelected = async () => {
    if (!user || selectedIds.size === 0) return;

    setImporting(true);
    setImportProgress({ current: 0, total: selectedIds.size });

    try {
      // Convert selected listings to the format expected by importItems
      const selectedListings = listings
        .filter(l => selectedIds.has(l.itemId))
        .map(l => ({
          itemId: l.itemId,
          title: l.title,
          price: l.price,
          currency: l.currency,
          quantity: l.quantity,
          imageUrl: l.imageUrl,
          listingUrl: `https://www.ebay.com/itm/${l.itemId}`,
          format: 'FixedPriceItem',
          condition: l.condition,
        }));

      setStatusMessage(`Importing ${selectedListings.length} selected items...`);

      // Import in batches of 5
      const batchSize = 5;
      let totalImported = 0;
      let totalSkipped = 0;

      for (let i = 0; i < selectedListings.length; i += batchSize) {
        if (!mountedRef.current) return;

        const batch = selectedListings.slice(i, i + batchSize);
        const result = await importItems(user.id, batch);
        if (!mountedRef.current) return;

        totalImported += result.imported.length;
        totalSkipped += result.skipped.length;
        setImportProgress({ current: i + batch.length, total: selectedListings.length });
      }

      if (mountedRef.current) {
        setStatusMessage(`Done! Imported ${totalImported} items (${totalSkipped} skipped)`);
      }
      await useItemStore.getState().initializeStore(user.id);
      if (mountedRef.current) {
        setSelectedIds(new Set());
      }

    } catch (error) {
      console.error('[EbayImportModal] Import selected failed:', error);
      if (mountedRef.current) {
        setStatusMessage('Import failed - check console');
      }
    } finally {
      if (mountedRef.current) {
        setImporting(false);
        setImportProgress({ current: 0, total: 0 });
      }
    }
  };

  // Filter out zero-quantity and sold-out listings as a client-side safety net
  // Note: can't use || fallback — quantity=0 is falsy but valid
  const inStockListings = listings.filter(l => {
    const qty = typeof l.quantity === 'number' ? l.quantity : 1;
    const sold = typeof (l as any).quantitySold === 'number' ? (l as any).quantitySold : 0;
    return qty > 0 && qty - sold > 0;
  });

  const availableCount = inStockListings.filter(l => !existingEbayIds.has(l.itemId)).length;
  const alreadyImportedCount = inStockListings.length - availableCount;

  return (
    <Modal
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) {
          autoLoadRef.current = false;
          onClose();
        }
      }}
      title={inline ? '' : 'Import from eBay'}
      size="xl"
      inline={inline}
    >
      <div className="space-y-4 max-w-4xl">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => handleImportAll(false)}
            disabled={importing || deleting || totalCount === 0}
            className="bg-green-600 hover:bg-green-700 text-white h-auto py-3"
          >
            {importing && selectedIds.size === 0 ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Import All from eBay
              </>
            )}
          </Button>

          <Button
            onClick={() => handleImportAll(true)}
            disabled={importing || deleting}
            className="bg-purple-600 hover:bg-purple-700 text-white h-auto py-3"
          >
            <RefreshCw className="mr-2 h-5 w-5" />
            Fresh Import (Delete First)
          </Button>

          <Button
            onClick={handleDeleteNonEbay}
            variant="secondary"
            disabled={deleting || importing}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {deleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete Non-eBay Items
          </Button>

          <Button
            onClick={handleDeleteAll}
            variant="secondary"
            disabled={deleting || importing}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete All Items
          </Button>

          <Button
            onClick={handleDeleteRecentImports}
            variant="secondary"
            disabled={deleting || importing}
            className="col-span-2 bg-orange-500 hover:bg-orange-600 text-white"
          >
            {deleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            ↩ Undo Recent Import (Last Hour)
          </Button>

          <Button
            onClick={handleDeleteBroken}
            variant="secondary"
            disabled={deleting || importing}
            className="col-span-2 bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            {deleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete Broken Items (Empty Titles)
          </Button>
        </div>

        {/* Import Selected Button */}
        {selectedIds.size > 0 && (
          <Button
            onClick={handleImportSelected}
            disabled={importing || deleting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-auto py-3"
          >
            {importing && selectedIds.size > 0 ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Importing {importProgress.current}/{importProgress.total}...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Import {selectedIds.size} Selected Items
              </>
            )}
          </Button>
        )}

        {/* Status & Progress */}
        {(statusMessage || importing) && (
          <div className="rounded-lg bg-blue-500/10 p-3 border border-blue-500/30">
            <p className="text-sm text-blue-300">{statusMessage}</p>
            {importing && importProgress.total > 0 && (
              <div className="mt-3">
                <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-purple-500 h-full transition-all duration-300"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-center">
                  {importProgress.current} of {importProgress.total}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Loading Count State */}
        {isLoadingCount && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400 mr-3" />
            <span className="text-gray-400">Loading listing count...</span>
          </div>
        )}

        {/* Total Count Header */}
        {totalCount !== null && !isLoadingCount && (
          <div className="flex items-center justify-between rounded-lg bg-gray-800/50 p-4">
            <div>
              <p className="text-lg font-semibold text-white">
                {totalCount} eBay Listings
                {isAutoLoading && (
                  <span className="ml-2 text-sm text-gray-400">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-1" />
                    Loading...
                  </span>
                )}
              </p>
              <p className="text-sm text-gray-400">
                {inStockListings.length > 0 && (
                  <>
                    Loaded {inStockListings.length} in-stock • {availableCount} new
                    {alreadyImportedCount > 0 && ` • ${alreadyImportedCount} already imported`}
                    {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
                  </>
                )}
              </p>
            </div>
            {listings.length > 0 && (
              <Button
                onClick={handleSelectAll}
                variant="secondary"
                size="sm"
                disabled={availableCount === 0}
              >
                {selectedIds.size === availableCount ? 'Deselect All' : 'Select All'}
              </Button>
            )}
          </div>
        )}

        {/* Empty State */}
        {totalCount === 0 && !isLoadingCount && (
          <div className="flex flex-col items-center justify-center py-12">
            <ShoppingBag className="h-16 w-16 text-gray-600" />
            <p className="mt-4 text-gray-400">No active listings found</p>
          </div>
        )}

        {/* Listings Grid */}
        {inStockListings.length > 0 && (
          <div
            ref={scrollContainerRef}
            className="max-h-[400px] space-y-2 overflow-y-auto pr-2"
          >
            {inStockListings.map((listing) => {
              const isImported = existingEbayIds.has(listing.itemId);
              const isSelected = selectedIds.has(listing.itemId);

              return (
                <div
                  key={listing.itemId}
                  onClick={() => !isImported && handleToggleSelect(listing.itemId)}
                  className={`flex items-start gap-4 rounded-lg border p-3 transition-colors cursor-pointer ${
                    isImported
                      ? 'border-gray-700 bg-gray-800/30 opacity-50 cursor-not-allowed'
                      : isSelected
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                      isImported
                        ? 'border-gray-600 bg-gray-700'
                        : isSelected
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-gray-600'
                    }`}
                  >
                    {isSelected && <Check className="h-4 w-4 text-white" />}
                  </div>

                  {/* Image */}
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-700">
                    {listing.imageUrl ? (
                      <img
                        src={listing.imageUrl}
                        alt={listing.title}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ShoppingBag className="h-6 w-6 text-gray-600" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-white text-sm truncate">
                      {listing.title}
                    </h4>
                    <p className="mt-1 text-lg font-semibold text-purple-400">
                      ${listing.price.toFixed(2)}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Qty: {listing.quantity}</span>
                      {listing.condition && (
                        <>
                          <span>•</span>
                          <span>{listing.condition}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  {isImported && (
                    <span className="flex items-center gap-1 rounded-full bg-gray-700 px-2 py-1 text-xs text-gray-400">
                      <Check className="h-3 w-3" />
                      Imported
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* First Page Loading */}
        {isLoadingPage && inStockListings.length === 0 && !isLoadingCount && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400 mr-3" />
            <span className="text-gray-400">Loading listings...</span>
          </div>
        )}
      </div>
    </Modal>
  );
};
