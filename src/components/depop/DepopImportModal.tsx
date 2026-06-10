import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { ShoppingBag, Check, Loader2, Download, StopCircle, RefreshCw, Edit3, X as XIcon, Search, Package, AlertTriangle } from 'lucide-react';
import { getFirestore, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { importDepopItems, clearStaleDepopBindings, DepopListing } from '../../services/depop/import';
import { extractDepopPrice, getDepopListingImage } from '../../services/depop/extractors';
import { findTopEbayMatchesForListing, EbayMatchResult } from '../../services/inventory/listingMatcher';
import { markListingsAsBacklog } from '../../services/inventory/platformListing';
import { DepopUnmatchedModal } from './DepopUnmatchedModal';
import { toast } from 'sonner';
import type { Item } from '../../types/item';

const db = getFirestore(app);

interface DepopImportModalProps {
  open: boolean;
  onClose: () => void;
  /** When true, render in-flow as a page panel (no portal/overlay). Used by /import. */
  inline?: boolean;
}

type RowSelection = string | 'none' | { manual: string };

const itemImageUrl = (item: Item): string | undefined => {
  const anyIt = item as any;
  return (
    anyIt.imageUrl ||
    anyIt.ebayPrimaryImage ||
    anyIt.ebayPhotos?.[0]?.firebaseStorageUrl ||
    anyIt.ebayPhotos?.[0]?.ebayUrl ||
    undefined
  );
};

const itemDisplayTitle = (item: Item): string =>
  (item as any).ebayFullTitle || item.name || item.id;

export const DepopImportModal = ({ open, onClose, inline }: DepopImportModalProps) => {
  const { items, initializeStore } = useItemStore();
  const { user } = useAuthStore();

  // Capture state
  const [listings, setListings] = useState<DepopListing[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureComplete, setCaptureComplete] = useState(false);

  // Per-row state
  const [selection, setSelection] = useState<Record<string, RowSelection>>({});
  const [excludeMap, setExcludeMap] = useState<Record<string, Set<string>>>({});
  const [reloadingId, setReloadingId] = useState<string | null>(null);
  const [manualPickerListingId, setManualPickerListingId] = useState<string | null>(null);
  const [manualSearch, setManualSearch] = useState('');

  // Imported-this-session — only listings the user actually imported via this modal.
  // Resets when modal closes. We do NOT use Item.depopListingId as the imported marker
  // because that field can be set by sync/calibrate paths too. We DO use
  // Item.depopImportedAt — that field is set ONLY by importDepopItems and persists.
  const [importedThisSession, setImportedThisSession] = useState<Set<string>>(new Set());

  // "Already matched" = the Item already carries this depopListingId, regardless
  // of whether the binding came from importDepopItems (depopImportedAt set) or
  // from sync/calibrate. Respect ANY prior binding — user rule: "go off of the
  // last user match." Previously this required `depopImportedAt` too, which
  // made sync-bound listings re-appear with random heuristic candidates on
  // every re-import.
  const persistedImported = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const anyIt = it as any;
      if (anyIt.depopListingId) set.add(String(anyIt.depopListingId));
    }
    return set;
  }, [items]);

  // Reverse index: listingId → matched Item.id, so the default-selection step
  // can pin already-matched rows to their prior Item (not a fresh heuristic top-3).
  const priorMatchByListingId = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) {
      const anyIt = it as any;
      if (anyIt.depopListingId) m.set(String(anyIt.depopListingId), String(it.id));
    }
    return m;
  }, [items]);

  const isListingImported = (listingId: string) =>
    importedThisSession.has(listingId) || persistedImported.has(listingId);

  // Import progress
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState('');

  // Unmatched-review modal — surfaces listings with no eBay match (or "None of these")
  const [showUnmatchedModal, setShowUnmatchedModal] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableCountRef = useRef(0);
  const lastCountRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
      setSelection({});
      setExcludeMap({});
      setImportedThisSession(new Set());
      stopCapture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // eBay item pool for matching
  const ebayItems = useMemo(() => items.filter(i => i.ebayListingId || i.ebayItemId), [items]);

  // Quick lookup for manual picker thumbnails + titles
  const itemsById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const it of items) map.set(it.id, it);
    return map;
  }, [items]);

  // Top-3 candidates per Depop listing (recomputed when listings or eBay pool changes,
  // or when excludeMap changes via reload). Reload bumps excludeMap → fresh next-3.
  const candidatesByListing = useMemo(() => {
    const out: Record<string, EbayMatchResult[]> = {};
    if (listings.length === 0 || ebayItems.length === 0) return out;
    for (const l of listings) {
      const title = l.description || l.title || (l as any).slug || '';
      const size = l.sizes?.[0] || (l as any).size || '';
      const exclude = excludeMap[l.id] || new Set<string>();
      out[l.id] = findTopEbayMatchesForListing(title, size, ebayItems, 3, exclude);
    }
    return out;
  }, [listings, ebayItems, excludeMap]);

  // Listings that are NOT connected to an eBay item: zero candidates OR user picked
  // 'none'. These are the "shouldn't be posted" set surfaced via the review modal.
  const unmatchedListings = useMemo(() => {
    return listings.filter(l => {
      if (isListingImported(l.id)) return false;
      const sel = selection[l.id];
      const cands = candidatesByListing[l.id] || [];
      if (sel === 'none') return true;
      if (cands.length === 0 && (sel === undefined || sel === 'none')) return true;
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, selection, candidatesByListing, importedThisSession, persistedImported]);

  // Default selection: (1) if this listing has a PRIOR match (Item already
  // carries the depopListingId), pin to that Item — never re-suggest randomly.
  // (2) Otherwise top heuristic candidate. Set once; never overrides user choice.
  useEffect(() => {
    setSelection(prev => {
      const next = { ...prev };
      for (const l of listings) {
        if (next[l.id] !== undefined) continue;
        const prior = priorMatchByListingId.get(l.id);
        if (prior) { next[l.id] = prior; continue; }
        const cands = candidatesByListing[l.id] || [];
        next[l.id] = cands.length > 0 ? cands[0].ebayItem.id : 'none';
      }
      return next;
    });
  }, [listings, candidatesByListing, priorMatchByListingId]);

  const stopCapture = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    stableCountRef.current = 0;
    lastCountRef.current = 0;
    if (mountedRef.current) {
      setIsCapturing(false);
      setCaptureComplete(true);
    }
  }, []);

  const pollFirestore = useCallback(async () => {
    if (!user || !mountedRef.current) return;
    try {
      let syncData = null;
      const syncRef = doc(db, 'users', user.id, 'marketplaceData', 'sync');
      const syncSnapshot = await getDoc(syncRef);
      if (syncSnapshot.exists()) {
        const data = syncSnapshot.data();
        if (!data.platform || data.platform === 'depop') syncData = data;
      }
      if (!syncData) {
        for (const docId of [user.id, 'dallassports', '265732668']) {
          try {
            const docRef = doc(db, 'marketplaceData', docId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (!data.platform || data.platform === 'depop') {
                syncData = data;
                break;
              }
            }
          } catch {}
        }
      }
      if (!syncData?.listings || !Array.isArray(syncData.listings)) return;
      const depopListings = syncData.listings as DepopListing[];
      if (!mountedRef.current) return;
      const activeOnly = depopListings.filter((l: any) => {
        if (l.sold || l._soldFromAPI) return false;
        if (l.status === 'sold' || l.status === 'SOLD') return false;
        return true;
      });
      setListings(activeOnly);
      if (depopListings.length === lastCountRef.current && depopListings.length > 0) {
        stableCountRef.current++;
        if (stableCountRef.current >= 10) stopCapture();
      } else {
        stableCountRef.current = 0;
      }
      lastCountRef.current = depopListings.length;
    } catch (error) {
      console.error('[DepopImportModal] Poll error:', error);
    }
  }, [user, stopCapture]);

  // Fresh scrape: wipe stale data, open Depop tab, poll every 3s for the extension's
  // overwrite. Always fresh — never shows cached items. 5min timeout for big shops.
  const startCapture = useCallback(async () => {
    if (!user) return;
    console.log('[DepopImportModal] startCapture — wiping + opening Depop');
    setListings([]);
    setSelection({});
    setExcludeMap({});
    setCaptureComplete(false);
    setStatusMessage('Scraping fresh Depop data... typically 30-90s for ~200 listings. Please leave the Depop tab open.');
    setIsCapturing(true);
    stableCountRef.current = 0;
    lastCountRef.current = 0;

    const firestore = getFirestore(app);
    for (const id of ['265732668', 'dallassports']) {
      try {
        await deleteDoc(doc(firestore, 'marketplaceData', id));
        console.log(`[DepopImportModal] wiped marketplaceData/${id}`);
      } catch (e) {
        console.warn(`[DepopImportModal] wipe marketplaceData/${id} failed:`, e);
      }
    }

    window.open('https://www.depop.com/sellinghub/selling/active/#autoScroll', '_blank');
    setTimeout(() => window.focus(), 500);

    // Poll every 3s for up to 5 minutes. As soon as the extension writes data, the
    // listings populate.
    setTimeout(() => {
      if (!mountedRef.current) return;
      console.log('[DepopImportModal] starting poll loop');
      pollFirestore();
      pollIntervalRef.current = setInterval(pollFirestore, 3000);
    }, 5000);

    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        console.log('[DepopImportModal] hit 5min timeout');
        stopCapture();
      }
    }, 300000);
  }, [user, pollFirestore, stopCapture]);

  // On modal open: always start a fresh scrape. No cached data shown.
  useEffect(() => {
    if (!open || !user) return;
    console.log('[DepopImportModal] open — initializeStore + startCapture (fresh)');
    initializeStore(user.id).catch(err => console.warn('[DepopImportModal] initializeStore failed:', err));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const handleReloadCard = (listingId: string) => {
    setReloadingId(listingId);
    const currentCands = candidatesByListing[listingId] || [];
    const currentExclude = excludeMap[listingId] || new Set<string>();
    const nextExclude = new Set(currentExclude);
    for (const c of currentCands) nextExclude.add(c.ebayItem.id);
    setExcludeMap(prev => ({ ...prev, [listingId]: nextExclude }));
    // Reset selection for this row to top of fresh batch (will be repopulated by the
    // default-selection useEffect, but only if no entry exists — clear it first).
    setSelection(prev => {
      const next = { ...prev };
      delete next[listingId];
      return next;
    });
    // Brief spin then clear (candidates recompute via useMemo immediately).
    setTimeout(() => setReloadingId(null), 300);
  };

  const handleManualPick = (listingId: string, itemId: string) => {
    setSelection(prev => ({ ...prev, [listingId]: { manual: itemId } }));
    setManualPickerListingId(null);
    setManualSearch('');
  };

  // Show ALL inventory items in the manual picker (no cap). Filter by search query;
  // when empty, show everything so the user can scroll through their full inventory.
  const filteredItemsForManual = useMemo(() => {
    if (!manualSearch.trim()) return ebayItems;
    const q = manualSearch.toLowerCase();
    return ebayItems.filter(it => itemDisplayTitle(it).toLowerCase().includes(q));
  }, [ebayItems, manualSearch]);

  // Selection helpers
  const totalSelected = listings.filter(l => {
    if (isListingImported(l.id)) return false;
    const s = selection[l.id];
    return Boolean(s) && s !== 'none';
  }).length;
  const totalBacklog = listings.filter(l => {
    if (isListingImported(l.id)) return false;
    return selection[l.id] === 'none';
  }).length;

  // Import: link matched rows to their chosen eBay item AND backlog "None of these"
  // rows. Backlog = user said this Depop listing has no eBay match → write to
  // PlatformListing with flagged='backlog'+backloggedAt so sync-stock can pick it
  // up later as an overstock candidate. Item collection is NOT touched for backlog
  // rows (they're not inventory bindings).
  const handleImportSelected = async () => {
    if (!user) return;
    const toImport: DepopListing[] = [];
    const toBacklog: DepopListing[] = [];
    const matchMap = new Map<string, { linkedGroupId: string; canonicalQty: number; ebayItemDocId: string }>();
    for (const l of listings) {
      if (isListingImported(l.id)) continue;
      const sel = selection[l.id];
      if (sel === 'none') {
        toBacklog.push(l);
        continue;
      }
      if (!sel) continue;
      const itemId = typeof sel === 'string' ? sel : sel.manual;
      const ebayItem = itemsById.get(itemId);
      if (!ebayItem) continue;
      toImport.push(l);
      matchMap.set(l.id, {
        linkedGroupId: ebayItem.ebayListingId || ebayItem.id,
        canonicalQty: (ebayItem as any).physicalQuantity ?? (ebayItem as any).ebayQuantity ?? 1,
        ebayItemDocId: ebayItem.id,
      });
    }
    if (toImport.length === 0 && toBacklog.length === 0) {
      toast.info('Nothing selected to import or backlog.');
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: toImport.length });
    setStatusMessage(
      `Linking ${toImport.length} matched · backlogging ${toBacklog.length} unmatched...`,
    );

    try {
      // 1. Backlog the "None of these" rows — overstock candidates for sync-stock.
      let backloggedCount = 0;
      if (toBacklog.length > 0) {
        try {
          backloggedCount = await markListingsAsBacklog(
            user.id,
            toBacklog.map(l => ({
              platform: 'depop',
              listingId: l.id,
              title: l.description || l.title || `Item ${l.id}`,
              price: extractDepopPrice(l),
              description: l.description,
            })),
          );
          console.log(`[DepopImportModal] Backlogged ${backloggedCount} listings as overstock candidates`);
        } catch (err) {
          console.error('[DepopImportModal] backlog write failed:', err);
          toast.error('Backlog write failed — see console');
        }
      }

      // 2. Import matched rows (writes Item.depopListingId + depopImportedAt).
      let importResult = { imported: 0, skipped: 0, errors: [] as Array<{ itemId: string; error: string }> };
      if (toImport.length > 0) {
        importResult = await importDepopItems(toImport, user.id, matchMap);
        if (!mountedRef.current) return;
        setImportProgress({ current: importResult.imported, total: toImport.length });
      }

      // 3. UI feedback + session tracking
      if (importResult.imported > 0 || backloggedCount > 0) {
        const parts: string[] = [];
        if (importResult.imported > 0) parts.push(`${importResult.imported} linked`);
        if (backloggedCount > 0) parts.push(`${backloggedCount} backlogged`);
        toast.success(parts.join(' · '));
        // Mark linked + backlogged listings as session-imported so they show
        // "Imported" / fade and don't re-tempt selection.
        const allDoneIds = new Set([...toImport.map(l => l.id), ...toBacklog.map(l => l.id)]);
        setImportedThisSession(prev => {
          const next = new Set(prev);
          for (const id of allDoneIds) next.add(id);
          return next;
        });
        await initializeStore(user.id);
      }
      if (importResult.skipped > 0) toast.info(`${importResult.skipped} skipped`);
      if (importResult.errors.length > 0) {
        console.error('[DepopImportModal] Link errors:', importResult.errors);
        toast.error(`${importResult.errors.length} items failed to link`);
      }

      // 4. Auto-clear stale bindings: any Item still marked listed-on-Depop but
      // NOT in this full capture is no longer live → clear so it returns to
      // ShouldList. Uses the COMPLETE captured set (`listings`), not `toImport`.
      try {
        const liveListings = listings.map((l) => ({ id: l.id, slug: l.slug, url: l.url }));
        const cleared = await clearStaleDepopBindings(user.id, liveListings);
        if (cleared > 0) {
          toast.info(`${cleared} item${cleared === 1 ? '' : 's'} no longer on Depop — moved to “should list”`);
          await initializeStore(user.id);
        }
      } catch (err) {
        console.error('[DepopImportModal] stale-binding cleanup failed:', err);
      }

      setStatusMessage(
        `Done — ${importResult.imported} linked, ${backloggedCount} backlogged${importResult.skipped ? `, ${importResult.skipped} skipped` : ''}`,
      );
    } catch (error) {
      console.error('[DepopImportModal] Import failed:', error);
      toast.error('Import failed: ' + (error as Error).message);
      if (mountedRef.current) setStatusMessage('Import failed');
    } finally {
      if (mountedRef.current) setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(newOpen) => { if (!newOpen) onClose(); }}
      title={inline ? '' : 'Import Depop Listings'}
      size="xl"
      inline={inline}
    >
      <div className={inline ? 'flex flex-col' : 'flex flex-col h-[80vh]'}>
        {/* Header */}
        <div className="flex-shrink-0 pb-3 border-b border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {isCapturing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                  <span className="text-purple-400 font-medium">
                    Capturing listings... {listings.length} found
                  </span>
                </div>
              ) : captureComplete ? (
                <span className="text-green-400 font-medium">
                  {listings.length} listings ready
                </span>
              ) : (
                <span className="text-gray-400">Waiting...</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isCapturing && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => { window.open('https://www.depop.com/sellinghub/selling/active/#autoScroll', '_blank'); setTimeout(() => window.focus(), 500); }} className="text-purple-400 hover:text-purple-300">
                    Reopen Depop
                  </Button>
                  <Button variant="ghost" size="sm" onClick={stopCapture} className="text-red-400 hover:text-red-300">
                    <StopCircle className="h-4 w-4 mr-1" /> Stop
                  </Button>
                </>
              )}
              {!isCapturing && captureComplete && listings.length === 0 && (
                <Button variant="ghost" size="sm" onClick={startCapture} className="text-purple-400 hover:text-purple-300">
                  Retry Capture
                </Button>
              )}
              {!isCapturing && captureComplete && listings.length > 0 && (
                <Button variant="ghost" size="sm" onClick={startCapture} className="text-purple-400 hover:text-purple-300">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              )}
            </div>
          </div>

          {/* Counts + Import action */}
          {listings.length > 0 && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-sm">
                <div><span className="text-gray-400">Total:</span> <span className="text-white font-semibold">{listings.length}</span></div>
                <div><span className="text-gray-400">Imported:</span> <span className="text-green-400 font-semibold">{importedThisSession.size}</span></div>
                <div><span className="text-gray-400">Selected:</span> <span className="text-blue-400 font-semibold">{totalSelected}</span></div>
                <div><span className="text-gray-400">Backlog:</span> <span className="text-amber-400 font-semibold">{totalBacklog}</span></div>
                <div><span className="text-gray-400">eBay pool:</span> <span className={`font-semibold ${ebayItems.length > 0 ? 'text-green-400' : 'text-red-400'}`}>{ebayItems.length}</span></div>
                {unmatchedListings.length > 0 && (
                  <div>
                    <span className="text-gray-400">Unmatched:</span>{' '}
                    <span className="text-amber-400 font-semibold">{unmatchedListings.length}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unmatchedListings.length > 0 && (
                  <Button
                    onClick={() => setShowUnmatchedModal(true)}
                    className="bg-amber-700/80 hover:bg-amber-700 text-white"
                  >
                    <AlertTriangle className="mr-1.5 h-4 w-4" />
                    Review unmatched ({unmatchedListings.length})
                  </Button>
                )}
                <Button onClick={handleImportSelected} disabled={importing || (totalSelected === 0 && totalBacklog === 0)} loading={importing} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Download className="mr-2 h-4 w-4" />
                {importing
                  ? `Linking ${importProgress.current}/${importProgress.total}…`
                  : totalBacklog > 0 && totalSelected > 0
                    ? `Import (${totalSelected} link · ${totalBacklog} backlog)`
                    : totalBacklog > 0
                      ? `Backlog ${totalBacklog} unmatched`
                      : `Link to eBay (${totalSelected})`}
              </Button>
              </div>
            </div>
          )}

          {statusMessage && <div className="mt-2 text-xs text-gray-400">{statusMessage}</div>}
          {importing && importProgress.total > 0 && (
            <div className="mt-2">
              <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                <div className="bg-purple-500 h-full transition-all duration-300" style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Body — list of rows */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-2">
          {isCapturing && listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 px-8 text-center">
              <Loader2 className="h-10 w-10 text-purple-400 animate-spin mb-4" />
              <p className="text-purple-300 text-lg font-semibold">Scraping fresh Depop data...</p>
              <p className="text-gray-400 text-sm mt-2">Typically 30-90 seconds for ~200 listings.</p>
              <p className="text-gray-500 text-xs mt-1">Keep the Depop tab open. Complete any security checks if prompted.</p>
            </div>
          ) : !isCapturing && listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ShoppingBag className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">No Depop listings found</p>
              <p className="text-sm mt-2">Try clicking "Retry Capture" above</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {listings.map(listing => {
                const isImported = isListingImported(listing.id);
                const cands = candidatesByListing[listing.id] || [];
                const sel = selection[listing.id];
                const reloaded = (excludeMap[listing.id]?.size ?? 0) > 0;
                const isReloading = reloadingId === listing.id;
                const imageUrl = getDepopListingImage(listing);
                const price = extractDepopPrice(listing);
                // Prefer description (full seller-written text) over title (often a
                // short slug like "the-product-is-a-mens..."). The user needs to see
                // the full text to verify the eBay match candidates make sense.
                const depopTitle = listing.description || listing.title || `Item ${listing.id}`;
                const isManual = typeof sel === 'object' && sel !== null && 'manual' in sel;

                return (
                  <div key={listing.id} className={`px-3 py-3 hover:bg-gray-900/30 ${isImported ? 'opacity-50' : ''}`}>
                    {/* Listing row — Depop side on top */}
                    <div className="flex items-center gap-3 mb-2">
                      {imageUrl ? (
                        <img src={imageUrl} alt="" className="h-10 w-10 object-cover rounded flex-shrink-0" loading="lazy" />
                      ) : (
                        <div className="h-10 w-10 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                          <ShoppingBag className="h-4 w-4 text-gray-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-100 break-words" title={depopTitle}>{depopTitle}</div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                          <span className="text-green-400 font-semibold">${price.toFixed(2)}</span>
                          {listing.sizes?.[0] && <span>· size {listing.sizes[0]}</span>}
                          <span className="px-1.5 py-px rounded bg-gray-800 text-gray-300 text-[9px] uppercase tracking-wider">depop</span>
                        </div>
                      </div>
                      {isImported && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-900/40 border border-green-500/40 text-green-200 text-[10px] flex-shrink-0">
                          <Check className="h-3 w-3" /> Imported
                        </div>
                      )}
                    </div>

                    {/* Candidates strip — eBay matches */}
                    {!isImported && (
                      <div className="ml-3 pl-3 border-l border-gray-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider text-blue-300/80">eBay matches</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleReloadCard(listing.id)}
                              disabled={isReloading || importing}
                              title="Reload — swap in next 3 candidates"
                              className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-50"
                            >
                              <RefreshCw className={`h-3 w-3 ${isReloading ? 'animate-spin' : ''}`} />
                            </button>
                            {reloaded && (
                              <button
                                type="button"
                                onClick={() => { setManualPickerListingId(listing.id); setManualSearch(''); }}
                                disabled={importing}
                                title="Match manually — pick any item from inventory"
                                className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-50 flex items-center gap-1 text-[10px] px-1.5"
                              >
                                <Edit3 className="h-3 w-3" /> Match manually
                              </button>
                            )}
                          </div>
                        </div>

                        {cands.length === 0 && !isManual && (
                          <div className="text-[11px] text-gray-500 py-1">
                            No eBay matches found. {reloaded ? 'Try Match manually.' : 'Click ↻ to retry.'}
                          </div>
                        )}

                        {cands.map(c => {
                          const itemId = c.ebayItem.id;
                          const isSelected = sel === itemId;
                          const img = itemImageUrl(c.ebayItem);
                          const fullTitle = itemDisplayTitle(c.ebayItem);
                          return (
                            <label
                              key={itemId}
                              title={fullTitle}
                              className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-900/30 border border-blue-500/50'
                                  : 'bg-gray-900/30 border border-gray-800 hover:border-gray-700'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`sel-${listing.id}`}
                                checked={isSelected}
                                onChange={() => setSelection(prev => ({ ...prev, [listing.id]: itemId }))}
                                className="flex-shrink-0"
                              />
                              {img ? (
                                <img src={img} alt="" className="h-8 w-8 object-cover rounded flex-shrink-0" loading="lazy" />
                              ) : (
                                <div className="h-8 w-8 bg-gray-800 rounded flex items-center justify-center flex-shrink-0">
                                  <Package className="h-3.5 w-3.5 text-gray-600" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className={`text-[12px] break-words ${isSelected ? 'text-blue-100' : 'text-gray-200'}`}>
                                  {fullTitle}
                                </div>
                              </div>
                              <span className={`text-[11px] font-mono flex-shrink-0 ${isSelected ? 'text-blue-300' : 'text-gray-400'}`}>
                                {Math.round(c.confidence * 100)}%
                              </span>
                            </label>
                          );
                        })}

                        {/* Manual pick row */}
                        {isManual && (() => {
                          const manualItemId = (sel as { manual: string }).manual;
                          const manualItem = itemsById.get(manualItemId);
                          if (!manualItem) return null;
                          const img = itemImageUrl(manualItem);
                          const fullTitle = itemDisplayTitle(manualItem);
                          return (
                            <label title={fullTitle} className="flex items-center gap-2 px-2 py-1 rounded bg-blue-900/30 border border-blue-500/40 cursor-pointer">
                              <input type="radio" name={`sel-${listing.id}`} checked readOnly className="flex-shrink-0" />
                              {img ? (
                                <img src={img} alt="" className="h-8 w-8 object-cover rounded flex-shrink-0" loading="lazy" />
                              ) : (
                                <div className="h-8 w-8 bg-gray-800 rounded flex items-center justify-center flex-shrink-0">
                                  <Package className="h-3.5 w-3.5 text-gray-600" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] text-blue-100 break-words">{fullTitle}</div>
                                <div className="text-[10px] text-blue-400">manual pick</div>
                              </div>
                            </label>
                          );
                        })()}

                        {/* None of these */}
                        <label className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer ${
                          sel === 'none' ? 'bg-gray-700/40 border border-gray-500/40' : 'bg-gray-900/20 border border-gray-800 hover:border-gray-700'
                        }`}>
                          <input
                            type="radio"
                            name={`sel-${listing.id}`}
                            checked={sel === 'none'}
                            onChange={() => setSelection(prev => ({ ...prev, [listing.id]: 'none' }))}
                            className="flex-shrink-0"
                          />
                          <div className="h-8 w-8 flex items-center justify-center flex-shrink-0">
                            <XIcon className="h-3.5 w-3.5 text-gray-500" />
                          </div>
                          <span className="text-[12px] text-gray-400">None of these</span>
                        </label>

                        {/* Poshmark slot — placeholder until Poshmark match path lands */}
                        <div className="mt-2 pt-2 border-t border-gray-800/50">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wider text-purple-300/50">Poshmark matches</span>
                            <span className="text-[10px] text-purple-300/40">coming soon</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Manual picker overlay */}
      {manualPickerListingId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setManualPickerListingId(null)}>
          <div className="bg-[#0f0f23] border-2 border-blue-500/40 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-blue-500/20">
              <h3 className="text-base font-bold text-blue-100">Match manually — pick any inventory item</h3>
              <button type="button" onClick={() => setManualPickerListingId(null)} className="p-1 hover:bg-gray-800 rounded text-gray-400">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 border-b border-blue-500/10">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-gray-500" />
                <input
                  autoFocus
                  type="text"
                  value={manualSearch}
                  onChange={e => setManualSearch(e.target.value)}
                  placeholder="Search by title…"
                  className="w-full pl-8 pr-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredItemsForManual.length === 0 && (
                <div className="text-xs text-gray-500 p-4 text-center">No matches.</div>
              )}
              {filteredItemsForManual.map(it => {
                const img = itemImageUrl(it);
                const title = itemDisplayTitle(it);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handleManualPick(manualPickerListingId, it.id)}
                    title={title}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-900/20 flex items-center gap-2"
                  >
                    {img ? (
                      <img src={img} alt="" className="h-8 w-8 object-cover rounded flex-shrink-0" loading="lazy" />
                    ) : (
                      <div className="h-8 w-8 bg-gray-800 rounded flex items-center justify-center flex-shrink-0">
                        <Package className="h-3.5 w-3.5 text-gray-600" />
                      </div>
                    )}
                    <span className="text-sm text-gray-100 break-words flex-1">{title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Unmatched Depop listings — review + delist surface */}
      <DepopUnmatchedModal
        open={showUnmatchedModal}
        onClose={() => setShowUnmatchedModal(false)}
        listings={unmatchedListings}
        onDelisted={ids => {
          // Remove delisted rows from the visible list so the user has accurate counts.
          setListings(prev => prev.filter(l => !ids.includes(l.id)));
        }}
      />
    </Modal>
  );
};
