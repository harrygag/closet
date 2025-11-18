import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useEbayStore } from '../../store/useEbayStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { ShoppingBag, Check, AlertCircle, Loader2 } from 'lucide-react';

interface EbayImportModalProps {
  open: boolean;
  onClose: () => void;
}

export const EbayImportModal = ({ open, onClose }: EbayImportModalProps) => {
  const { listings, isLoading, fetchListings, importItems } = useEbayStore();
  const { items } = useItemStore();
  const { user } = useAuthStore();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Check which items are already imported
  const existingEbayIds = useMemo(() => {
    return new Set(items.map(item => (item as any).ebay_item_id).filter(Boolean));
  }, [items]);

  useEffect(() => {
    if (open && user) {
      fetchListings(user.id);
    }
  }, [open, user, fetchListings]);

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
    if (selectedIds.size === listings.filter(l => !existingEbayIds.has(l.itemId)).length) {
      setSelectedIds(new Set());
    } else {
      const allAvailable = listings
        .filter(l => !existingEbayIds.has(l.itemId))
        .map(l => l.itemId);
      setSelectedIds(new Set(allAvailable));
    }
  };

  const handleImport = async () => {
    if (!user || selectedIds.size === 0) return;

    setImporting(true);
    setImportProgress({ current: 0, total: selectedIds.size });

    const selectedListings = listings.filter(l => selectedIds.has(l.itemId));
    
    try {
      // Import in batches to show progress
      const batchSize = 5;
      const batches = [];
      for (let i = 0; i < selectedListings.length; i += batchSize) {
        batches.push(selectedListings.slice(i, i + batchSize));
      }

      let importedCount = 0;
      for (const batch of batches) {
        await importItems(user.id, batch);
        importedCount += batch.length;
        setImportProgress({ current: importedCount, total: selectedIds.size });
      }

      // Refresh items list
      await useItemStore.getState().initializeStore();
      
      setSelectedIds(new Set());
      onClose();
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const availableListings = listings.filter(l => !existingEbayIds.has(l.itemId));
  const alreadyImportedCount = listings.length - availableListings.length;

  return (
    <Modal 
      open={open} 
      onOpenChange={onClose} 
      title="Import from eBay"
    >
      <div className="space-y-4 max-w-4xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            <span className="ml-3 text-gray-400">Loading your eBay listings...</span>
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <ShoppingBag className="h-16 w-16 text-gray-600" />
            <p className="mt-4 text-gray-400">No active listings found</p>
            <p className="mt-2 text-sm text-gray-500">
              Make sure you have active items listed on eBay
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="flex items-center justify-between rounded-lg bg-gray-800/50 p-4">
              <div>
                <p className="text-sm text-gray-400">
                  {availableListings.length} new items available
                  {alreadyImportedCount > 0 && (
                    <span className="ml-2 text-gray-500">
                      ({alreadyImportedCount} already imported)
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedIds.size} selected
                </p>
              </div>
              <Button
                onClick={handleSelectAll}
                variant="secondary"
                size="sm"
                disabled={availableListings.length === 0}
              >
                {selectedIds.size === availableListings.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            {/* Listings Grid */}
            <div className="max-h-[500px] space-y-2 overflow-y-auto pr-2">
              {listings.map((listing) => {
                const isImported = existingEbayIds.has(listing.itemId);
                const isSelected = selectedIds.has(listing.itemId);

                return (
                  <div
                    key={listing.itemId}
                    className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
                      isImported
                        ? 'border-gray-700 bg-gray-800/30 opacity-50'
                        : isSelected
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => !isImported && handleToggleSelect(listing.itemId)}
                      disabled={isImported}
                      className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                        isImported
                          ? 'cursor-not-allowed border-gray-600 bg-gray-700'
                          : isSelected
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-gray-600 hover:border-purple-400'
                      }`}
                    >
                      {isSelected && <Check className="h-4 w-4 text-white" />}
                    </button>

                    {/* Image */}
                    <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-700">
                      {listing.imageUrl ? (
                        <img
                          src={listing.imageUrl}
                          alt={listing.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ShoppingBag className="h-8 w-8 text-gray-600" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white truncate">
                        {listing.title}
                      </h4>
                      <p className="mt-1 text-lg font-semibold text-purple-400">
                        ${listing.price.toFixed(2)} {listing.currency}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                        <span>Qty: {listing.quantity}</span>
                        {listing.categoryName && (
                          <>
                            <span>•</span>
                            <span>{listing.categoryName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
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

            {/* Import Info */}
            {availableListings.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 p-3">
                <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-300">
                  Items will be imported with their eBay price as the selling price. 
                  You'll need to add cost price and other details manually.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 border-t border-gray-700 pt-4">
              <Button onClick={onClose} variant="secondary" disabled={importing}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedIds.size === 0 || importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing {importProgress.current}/{importProgress.total}
                  </>
                ) : (
                  `Import ${selectedIds.size} Items`
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

