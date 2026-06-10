/**
 * Facebook Marketplace Import Modal — same shape as PoshmarkImportModal but
 * driven by `marketplaceData/facebook_{username|me}` documents written by the
 * extension's facebook-content-script. Until the extension scrape is recorded
 * + tuned, this opens the seller-listings page and falls back to whatever the
 * extension wrote (often empty in the early sessions).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { ShoppingBag, Loader2, RefreshCw, Download, Check, AlertTriangle, ExternalLink, X } from 'lucide-react';
import { getFirestore, doc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { FacebookListing, importFacebookItems } from '../../services/facebook/import';
import { findTopEbayMatchesForListing, EbayMatchResult } from '../../services/inventory/listingMatcher';
import { toast } from 'sonner';

const db = getFirestore(app);
const FB_BLUE = '#1877F2';

const FB_SELLING_URL =
  'https://www.facebook.com/marketplace/you/selling?referral_surface=seller_hub&status[0]=IN_STOCK#autoScroll';

interface FacebookImportModalProps {
  open: boolean;
  onClose: () => void;
}

function listingKey(l: FacebookListing): string {
  return l.listing_id || l.id;
}

export const FacebookImportModal = ({ open, onClose }: FacebookImportModalProps) => {
  const { user } = useAuthStore();
  const { items, initializeStore } = useItemStore();

  const [listings, setListings] = useState<FacebookListing[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [selection, setSelection] = useState<Record<string, string | 'none'>>({});
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const ebayItems = useMemo(
    () => items.filter((i: any) => i.ebayListingId || i.ebayItemId).map((i: any) => ({ ...i, name: i.name || i.title || i.ebayFullTitle || '' })),
    [items],
  );

  const candidatesByListing = useMemo(() => {
    const out: Record<string, EbayMatchResult[]> = {};
    if (listings.length === 0 || ebayItems.length === 0) return out;
    for (const l of listings) {
      out[listingKey(l)] = findTopEbayMatchesForListing(l.title || l.description || '', l.size || '', ebayItems as any, 3);
    }
    return out;
  }, [listings, ebayItems]);

  const loadListings = useCallback(async () => {
    if (!user) return;
    setStatusMessage('');
    try {
      // Resolve a marketplaceData doc the extension wrote for Facebook. Try
      // candidate doc ids that the (future) content script may use, plus a
      // wildcard scan for any `facebook_*` doc with listings.
      const candidateDocIds = [
        `facebook_${user.id}`,
        'facebook_me',
        user.id,
      ];
      let data: any = null;
      for (const docId of candidateDocIds) {
        try {
          const snap = await getDoc(doc(db, 'marketplaceData', docId));
          if (snap.exists()) {
            const d = snap.data();
            if ((!d.platform || d.platform === 'facebook') && Array.isArray(d.listings) && d.listings.length > 0) {
              data = d;
              break;
            }
          }
        } catch { /* keep trying */ }
      }
      if (!data) {
        try {
          const all = await getDocs(collection(db, 'marketplaceData'));
          for (const ds of all.docs) {
            if (!ds.id.startsWith('facebook_')) continue;
            const d = ds.data();
            if (Array.isArray(d.listings) && d.listings.length > 0) { data = d; break; }
          }
        } catch { /* swallow */ }
      }
      if (!data) {
        setStatusMessage('No Facebook listings found yet. The extension scrape may still be loading the seller hub.');
        return;
      }
      setListings(data.listings as FacebookListing[]);
    } catch (err) {
      console.error('[FacebookImportModal] Load error:', err);
      setStatusMessage('Failed to load Facebook listings');
    }
  }, [user]);

  const startCapture = useCallback(async () => {
    if (!user) return;
    setListings([]);
    setSelection({});
    setStatusMessage('Opening Facebook Marketplace seller hub — leave the tab open while it scrolls.');
    setIsCapturing(true);
    try { await deleteDoc(doc(db, 'marketplaceData', `facebook_${user.id}`)); } catch { /* not present yet */ }
    window.open(FB_SELLING_URL, '_blank');
    setTimeout(() => window.focus(), 500);
    // Poll every 3s for up to 5 minutes; the extension content script (when
    // wired) will write `marketplaceData/facebook_*` with `scrapeComplete: true`.
    pollIntervalRef.current = setInterval(loadListings, 3000);
    timeoutRef.current = setTimeout(() => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (mountedRef.current) setIsCapturing(false);
    }, 300000);
  }, [user, loadListings]);

  useEffect(() => {
    if (!open || !user) return;
    initializeStore(user.id).catch(() => {});
    startCapture();
    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    };
  }, [open, user]);

  // Auto-stop capture when we've seen listings.
  useEffect(() => {
    if (isCapturing && listings.length > 0) {
      setIsCapturing(false);
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    }
  }, [isCapturing, listings.length]);

  const handleImport = async () => {
    if (!user || listings.length === 0) return;
    setImporting(true);
    try {
      const matchMap = new Map<string, { linkedGroupId: string; canonicalQty: number; ebayItemDocId: string }>();
      const toImport: FacebookListing[] = [];
      for (const l of listings) {
        const key = listingKey(l);
        const sel = selection[key];
        if (!sel || sel === 'none') continue;
        toImport.push(l);
        matchMap.set(key, { linkedGroupId: sel, canonicalQty: 1, ebayItemDocId: sel });
      }
      if (toImport.length === 0) { toast.error('Nothing selected to import'); setImporting(false); return; }
      const result = await importFacebookItems(toImport, user.id, matchMap);
      toast.success(`Linked ${result.imported} listings (${result.unmatched} orphan)`);
      await initializeStore(user.id);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const totalSelected = Object.values(selection).filter((s) => s && s !== 'none').length;

  return (
    <Modal open={open} onOpenChange={onClose} title="Import Facebook Listings" size="xl">
      <div className="flex flex-col h-[80vh]">
        <div className="flex-shrink-0 pb-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {isCapturing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: FB_BLUE }} />
                  <span className="font-medium" style={{ color: FB_BLUE }}>
                    Capturing listings… {listings.length > 0 ? `${listings.length} found` : ''}
                  </span>
                </div>
              ) : listings.length > 0 ? (
                <span className="text-emerald-400 font-medium">{listings.length} listings loaded</span>
              ) : (
                <span className="text-gray-400 text-sm">{statusMessage || 'Awaiting Facebook scrape…'}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { window.open(FB_SELLING_URL, '_blank'); setTimeout(() => window.focus(), 500); }}
              >
                <ExternalLink className="h-4 w-4 mr-1" /> Reopen Facebook
              </Button>
              <Button size="sm" variant="ghost" onClick={loadListings}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={startCapture} style={{ backgroundColor: FB_BLUE }}>
                Retry Capture
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-400">
              <span className="text-white font-semibold">{totalSelected}</span> selected &nbsp;·&nbsp;
              <span className="text-white font-semibold">{ebayItems.length}</span> eBay pool
            </div>
            <Button onClick={handleImport} disabled={importing || totalSelected === 0} style={{ backgroundColor: FB_BLUE }}>
              <Download className="h-4 w-4 mr-2" />
              {importing ? 'Importing…' : `Import ${totalSelected}`}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ShoppingBag className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">No Facebook listings captured yet</p>
              <p className="text-sm mt-2 max-w-md text-center">
                The extension scrape for Facebook Marketplace is being built. For now the seller hub
                opens in a new tab — once the scrape is wired, listings will appear here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {listings.map((l) => {
                const k = listingKey(l);
                const cands = candidatesByListing[k] || [];
                const sel = selection[k];
                return (
                  <li key={k} className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3 flex gap-3">
                    {l.imageUrl ? (
                      <img src={l.imageUrl} alt="" className="h-16 w-16 rounded object-cover flex-shrink-0" loading="lazy" />
                    ) : (
                      <div className="h-16 w-16 rounded bg-gray-800 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-100 truncate" title={l.title}>{l.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">${l.price ?? '—'}</div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {cands.length === 0 ? (
                          <span className="text-[10px] text-amber-400">No eBay candidates — match manually later</span>
                        ) : cands.map((c) => (
                          <button
                            key={c.ebayItem.id}
                            type="button"
                            onClick={() => setSelection((p) => ({ ...p, [k]: c.ebayItem.id }))}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] ${
                              sel === c.ebayItem.id
                                ? 'border-blue-400/70 bg-blue-900/30 text-blue-100'
                                : 'border-gray-700/60 bg-gray-900/40 text-gray-200 hover:border-gray-500/60'
                            }`}
                          >
                            {sel === c.ebayItem.id && <Check className="h-3 w-3" />}
                            <span className="truncate max-w-[18ch]">{c.ebayItem.name || c.ebayItem.id}</span>
                            <span className="text-gray-500">{Math.round(c.confidence * 100)}%</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setSelection((p) => ({ ...p, [k]: 'none' }))}
                          className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] ${
                            sel === 'none'
                              ? 'border-amber-500/60 bg-amber-900/20 text-amber-100'
                              : 'border-gray-700/60 bg-gray-900/40 text-gray-300 hover:border-gray-500/60'
                          }`}
                        >
                          {sel === 'none' && <X className="h-3 w-3" />}
                          None of these
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {ebayItems.length === 0 && listings.length > 0 && (
            <div className="mt-4 flex items-start gap-2 text-amber-300 text-xs">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>eBay item pool is empty — open /closet first so the matcher has candidates.</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
