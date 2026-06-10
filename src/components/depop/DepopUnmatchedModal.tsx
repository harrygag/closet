import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { app } from '../../lib/firebase/client';
import { ShoppingBag, Trash2, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { DepopListing } from '../../services/depop/import';
import { extractDepopPrice, getDepopListingImage } from '../../services/depop/extractors';

interface DepopUnmatchedModalProps {
  open: boolean;
  onClose: () => void;
  listings: DepopListing[];
  onDelisted?: (listingIds: string[]) => void;
}

/**
 * Surfaces Depop listings that have no eBay match (or were marked "None of these")
 * — these are likely items no longer in inventory that shouldn't be posted. The
 * user can delist them from Depop one-by-one or in bulk via `depopDelistItem` CF.
 */
export const DepopUnmatchedModal = ({ open, onClose, listings, onDelisted }: DepopUnmatchedModalProps) => {
  const [delisting, setDelisting] = useState<Set<string>>(new Set());
  const [delisted, setDelisted] = useState<Set<string>>(new Set());

  const handleDelist = async (listing: DepopListing) => {
    const id = listing.id;
    setDelisting(prev => new Set(prev).add(id));
    try {
      const fn = httpsCallable(getFunctions(app), 'depopDelistItem', { timeout: 60000 });
      await fn({ itemId: id });
      setDelisted(prev => new Set(prev).add(id));
      toast.success(`Delisted from Depop: ${(listing.title || listing.description || id).slice(0, 50)}`);
      onDelisted?.([id]);
    } catch (err: any) {
      console.error('[DepopUnmatchedModal] delist failed:', err);
      toast.error(`Delist failed: ${err?.message || 'unknown'}`);
    } finally {
      setDelisting(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelistAll = async () => {
    const remaining = listings.filter(l => !delisted.has(l.id));
    if (remaining.length === 0) return;
    if (!window.confirm(`Delist ${remaining.length} unmatched listings from Depop? This calls depopDelistItem for each — irreversible.`)) return;
    for (const listing of remaining) {
      // Sequential to avoid rate-limit. depopDelistItem should be idempotent.
      // eslint-disable-next-line no-await-in-loop
      await handleDelist(listing);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={newOpen => { if (!newOpen) onClose(); }}
      title="Review unmatched Depop listings"
      size="xl"
    >
      <div className="flex flex-col h-[75vh]">
        {/* Header */}
        <div className="flex-shrink-0 pb-3 border-b border-gray-700">
          <div className="flex items-start gap-3 p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-amber-200 font-medium text-sm">
                {listings.length} Depop listing{listings.length === 1 ? '' : 's'} with no eBay match
              </p>
              <p className="text-amber-100/70 text-xs mt-0.5">
                These likely shouldn't be posted — the matching eBay item is missing or sold. Delist from Depop to clean them up.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">
              <span className="text-gray-500">Delisted this session:</span>{' '}
              <span className="text-green-400 font-semibold">{delisted.size}</span>
              {' / '}
              <span className="text-white">{listings.length}</span>
            </div>
            <Button
              onClick={handleDelistAll}
              disabled={delisted.size === listings.length || delisting.size > 0}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delist all remaining ({listings.length - delisted.size})
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2">
          {listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ShoppingBag className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">No unmatched listings — every Depop row found a match.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {listings.map(listing => {
                const isBusy = delisting.has(listing.id);
                const isDone = delisted.has(listing.id);
                const imageUrl = getDepopListingImage(listing);
                const price = extractDepopPrice(listing);
                const fullText = listing.description || listing.title || `Item ${listing.id}`;
                const depopUrl = listing.url || (listing.slug ? `https://www.depop.com/products/${listing.slug}` : null);

                return (
                  <div
                    key={listing.id}
                    className={`px-3 py-2 flex items-start gap-3 ${isDone ? 'opacity-40' : 'hover:bg-gray-900/30'}`}
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="h-12 w-12 object-cover rounded flex-shrink-0" loading="lazy" />
                    ) : (
                      <div className="h-12 w-12 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="h-4 w-4 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-100 break-words">{fullText}</div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                        <span className="text-green-400 font-semibold">${price.toFixed(2)}</span>
                        {listing.size && <span>· size {listing.size}</span>}
                        {depopUrl && (
                          <a
                            href={depopUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-purple-400 hover:text-purple-300"
                          >
                            view <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                    {isDone ? (
                      <span className="text-[11px] text-green-400 font-semibold flex-shrink-0 self-center">Delisted</span>
                    ) : (
                      <Button
                        onClick={() => handleDelist(listing)}
                        disabled={isBusy}
                        className="bg-red-600/80 hover:bg-red-700 text-white flex-shrink-0"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    )}
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
