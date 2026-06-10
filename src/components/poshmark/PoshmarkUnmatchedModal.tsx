import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { app } from '../../lib/firebase/client';
import { getAuth } from 'firebase/auth';
import { ShoppingBag, Trash2, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { PoshmarkListing } from '../../services/poshmark/import';

interface PoshmarkUnmatchedModalProps {
  open: boolean;
  onClose: () => void;
  listings: PoshmarkListing[];
  onDelisted?: (listingIds: string[]) => void;
}

/**
 * Build a Poshmark URL for a listing — used both for the "view" link and as the
 * itemUrl payload for the gologinDelistItem Cloud Function (which expects a URL,
 * not an ID).
 */
function getPoshmarkListingUrl(listing: PoshmarkListing): string | null {
  const id = listing.listing_id || listing.id;
  return (
    listing.listingUrl ||
    listing.listing_url ||
    (id ? `https://poshmark.com/listing/${id}` : null)
  );
}

function getPoshmarkListingImage(listing: PoshmarkListing): string | null {
  const anyL = listing as any;
  if (listing.cover_shot) {
    if (typeof listing.cover_shot === 'string') return listing.cover_shot;
    if (typeof listing.cover_shot === 'object') {
      const cs = listing.cover_shot as any;
      return cs.url_medium || cs.url_small || cs.url || null;
    }
  }
  if (anyL.pictures && Array.isArray(anyL.pictures) && anyL.pictures.length > 0) {
    const pic = anyL.pictures[0];
    if (typeof pic === 'string') return pic;
    if (typeof pic === 'object') return pic.url_medium || pic.url_small || pic.url || null;
  }
  if (listing.images && listing.images.length > 0) return listing.images[0];
  if (listing.imageUrl) return listing.imageUrl;
  return null;
}

function extractPoshmarkPrice(listing: PoshmarkListing): number {
  const anyL = listing as any;
  if (typeof listing.price === 'number' && listing.price > 0) return listing.price;
  if (anyL.price_amount?.val) {
    const parsed = parseFloat(anyL.price_amount.val);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (typeof listing.original_price === 'number' && listing.original_price > 0) return listing.original_price;
  if (typeof listing.originalPrice === 'number' && listing.originalPrice > 0) return listing.originalPrice;
  return 0;
}

/**
 * Surfaces Poshmark listings that have no eBay match (or were marked "None of these")
 * — these are likely items no longer in inventory that shouldn't be posted. The user
 * can delist them from Poshmark one-by-one or in bulk via `gologinDelistItem` CF
 * (the GoLogin browser agent that handles cross-platform delists).
 */
export const PoshmarkUnmatchedModal = ({ open, onClose, listings, onDelisted }: PoshmarkUnmatchedModalProps) => {
  const [delisting, setDelisting] = useState<Set<string>>(new Set());
  const [delisted, setDelisted] = useState<Set<string>>(new Set());

  const handleDelist = async (listing: PoshmarkListing) => {
    const id = listing.listing_id || listing.id;
    const url = getPoshmarkListingUrl(listing);
    if (!url) {
      toast.error('Could not build Poshmark URL for this listing');
      return;
    }
    setDelisting(prev => new Set(prev).add(id));
    try {
      // gologinDelistItem is deployed as `https.onRequest` (NOT onCall) — see
      // functions/src/index.ts:6075. We must hit its public URL with fetch + the
      // user's ID token, not httpsCallable. Body shape: { platform, itemUrl, profileId }.
      const auth = getAuth(app);
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(
        'https://us-central1-closet-da8f2.cloudfunctions.net/gologinDelistItem',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ platform: 'poshmark', itemUrl: url, profileId: '' }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      setDelisted(prev => new Set(prev).add(id));
      toast.success(`Delisted from Poshmark: ${(listing.title || listing.description || id).slice(0, 50)}`);
      onDelisted?.([id]);
    } catch (err: any) {
      console.error('[PoshmarkUnmatchedModal] delist failed:', err);
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
    const remaining = listings.filter(l => !delisted.has(l.listing_id || l.id));
    if (remaining.length === 0) return;
    if (!window.confirm(`Delist ${remaining.length} unmatched listings from Poshmark? This calls gologinDelistItem for each — irreversible.`)) return;
    for (const listing of remaining) {
      // Sequential to avoid GoLogin profile contention. gologinDelistItem should
      // be idempotent if a listing has already been delisted.
      // eslint-disable-next-line no-await-in-loop
      await handleDelist(listing);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={newOpen => { if (!newOpen) onClose(); }}
      title="Review unmatched Poshmark listings"
      size="xl"
    >
      <div className="flex flex-col h-[75vh]">
        {/* Header */}
        <div className="flex-shrink-0 pb-3 border-b border-gray-700">
          <div className="flex items-start gap-3 p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-amber-200 font-medium text-sm">
                {listings.length} Poshmark listing{listings.length === 1 ? '' : 's'} with no eBay match
              </p>
              <p className="text-amber-100/70 text-xs mt-0.5">
                These likely shouldn't be posted — the matching eBay item is missing or sold. Delist from Poshmark to clean them up.
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
              <p className="text-sm">No unmatched listings — every Poshmark row found a match.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {listings.map(listing => {
                const id = listing.listing_id || listing.id;
                const isBusy = delisting.has(id);
                const isDone = delisted.has(id);
                const imageUrl = getPoshmarkListingImage(listing);
                const price = extractPoshmarkPrice(listing);
                const fullText = listing.title || listing.description || `Item ${id}`;
                const poshUrl = getPoshmarkListingUrl(listing);

                return (
                  <div
                    key={id}
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
                        {poshUrl && (
                          <a
                            href={poshUrl}
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
