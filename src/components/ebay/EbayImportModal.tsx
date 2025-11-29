import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { useEbayStore } from '../../store/useEbayStore';
import { ebayService, ListingPreview } from '../../services/ebayService';
import { ShoppingBag, Check, Loader2, Trash2, Download, RefreshCw } from 'lucide-react';

interface EbayImportModalProps {
  open: boolean;
  onClose: () => void;
}

export const EbayImportModal = ({ open, onClose }: EbayImportModalProps) => {
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
    const availableIds = listings
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
      await useItemStore.getState().initializeStore();
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
      await useItemStore.getState().initializeStore();
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

  // IMPORT ALL: Server-side page-by-page import with progress
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

      let page = 1;
      let totalPages = 1;
      let totalImported = 0;
      let totalSkipped = 0;
      let hasMorePages = true;

      while (hasMorePages && mountedRef.current) {
        setStatusMessage(`Importing page ${page}${totalPages > 1 ? ` of ${totalPages}` : ''}...`);
        setImportProgress({ current: page, total: totalPages || page });

        const result = await ebayService.importPage(page, 200);
        if (!mountedRef.current) return;

        totalPages = result.totalPages;
        totalImported += result.imported;
        totalSkipped += result.skipped;
        hasMorePages = result.hasMoreItems;

        setImportProgress({ current: page, total: totalPages });
        page++;
      }

      if (mountedRef.current) {
        setStatusMessage(`Done! Imported ${totalImported} items (${totalSkipped} skipped)`);
      }
      await useItemStore.getState().initializeStore();

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
      await useItemStore.getState().initializeStore();
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

  const availableCount = listings.filter(l => !existingEbayIds.has(l.itemId)).length;
  const alreadyImportedCount = listings.length - availableCount;

  return (
    <Modal
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) {
          autoLoadRef.current = false;
          onClose();
        }
      }}
      title="Import from eBay"
      size="xl"
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
                {listings.length > 0 && (
                  <>
                    Loaded {listings.length} of {totalCount} • {availableCount} new
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
        {listings.length > 0 && (
          <div
            ref={scrollContainerRef}
            className="max-h-[400px] space-y-2 overflow-y-auto pr-2"
          >
            {listings.map((listing) => {
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
        {isLoadingPage && listings.length === 0 && !isLoadingCount && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400 mr-3" />
            <span className="text-gray-400">Loading listings...</span>
          </div>
        )}
      </div>
    </Modal>
  );
};
