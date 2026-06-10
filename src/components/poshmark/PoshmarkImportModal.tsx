import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { ShoppingBag, Check, Loader2, Download, StopCircle, RefreshCw, Edit3, X as XIcon, Search, Package, AlertTriangle } from 'lucide-react';
import { getFirestore, doc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { importPoshmarkItems, clearStalePoshmarkBindings, PoshmarkListing } from '../../services/poshmark/import';
import { findTopEbayMatchesForListing, EbayMatchResult } from '../../services/inventory/listingMatcher';
import { markListingsAsBacklog } from '../../services/inventory/platformListing';
import { PoshmarkUnmatchedModal } from './PoshmarkUnmatchedModal';
import { toast } from 'sonner';
import type { Item } from '../../types/item';

const db = getFirestore(app);

const POSHMARK_PURPLE = '#7B2E8E';
const POSHMARK_CLOSET_URL = 'https://poshmark.com/closet/retrothriftc0?availability=available#autoScroll';

interface PoshmarkImportModalProps {
  open: boolean;
  onClose: () => void;
  /** When true, render in-flow as a page panel (no portal/overlay). Used by /import. */
  inline?: boolean;
}

type RowSelection = string | 'none' | { manual: string };

/**
 * Stable listing key — Poshmark sometimes carries `listing_id` and sometimes `id`,
 * and selection / candidate maps must use one canonical form.
 */
function listingKey(l: PoshmarkListing): string {
  return l.listing_id || l.id;
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
  if (typeof anyL.price === 'string') {
    const cleaned = anyL.price.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
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

function isPoshmarkListingActive(listing: PoshmarkListing): boolean {
  if (listing.sold) return false;
  const status = listing.status;
  return !status || status === 'available' || status === 'active' || status === 'ONSALE';
}

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

export const PoshmarkImportModal = ({ open, onClose, inline }: PoshmarkImportModalProps) => {
  const { items, initializeStore } = useItemStore();
  const { user } = useAuthStore();

  // Capture state
  const [listings, setListings] = useState<PoshmarkListing[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureComplete, setCaptureComplete] = useState(false);

  // Per-row state
  const [selection, setSelection] = useState<Record<string, RowSelection>>({});
  const [excludeMap, setExcludeMap] = useState<Record<string, Set<string>>>({});
  const [reloadingId, setReloadingId] = useState<string | null>(null);
  const [manualPickerListingId, setManualPickerListingId] = useState<string | null>(null);
  const [manualSearch, setManualSearch] = useState('');

  // Imported-this-session — only listings the user actually imported via this modal.
  // Resets when modal closes. We do NOT use Item.poshmarkListingId as the imported
  // marker because that field can be set by sync/calibrate paths too. We DO use
  // Item.poshmarkImportedAt — that field is set ONLY by importPoshmarkItems and
  // persists across sessions.
  const [importedThisSession, setImportedThisSession] = useState<Set<string>>(new Set());

  // "Already matched" = the Item already carries this poshmarkListingId,
  // regardless of whether the binding came from importPoshmarkItems
  // (poshmarkImportedAt set) or from sync/calibrate. Respect ANY prior binding
  // — user rule: "go off of the last user match." Previously this required
  // `poshmarkImportedAt`, which made sync-bound listings re-appear with random
  // heuristic candidates on re-import.
  const persistedImported = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const anyIt = it as any;
      if (anyIt.poshmarkListingId) set.add(String(anyIt.poshmarkListingId));
    }
    return set;
  }, [items]);

  // Reverse index: listingId → matched Item.id, so the default-selection step
  // can pin already-matched rows to their prior Item (not a fresh heuristic top-3).
  const priorMatchByListingId = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) {
      const anyIt = it as any;
      if (anyIt.poshmarkListingId) m.set(String(anyIt.poshmarkListingId), String(it.id));
    }
    return m;
  }, [items]);

  const isListingImported = (id: string) =>
    importedThisSession.has(id) || persistedImported.has(id);

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

  // Top-3 candidates per Poshmark listing (recomputed when listings or eBay pool
  // changes, or when excludeMap changes via reload). Reload bumps excludeMap →
  // fresh next-3.
  const candidatesByListing = useMemo(() => {
    const out: Record<string, EbayMatchResult[]> = {};
    if (listings.length === 0 || ebayItems.length === 0) return out;
    for (const l of listings) {
      const id = listingKey(l);
      const title = l.title || l.description || '';
      const size = l.size || '';
      const exclude = excludeMap[id] || new Set<string>();
      out[id] = findTopEbayMatchesForListing(title, size, ebayItems, 3, exclude);
    }
    return out;
  }, [listings, ebayItems, excludeMap]);

  // Listings that are NOT connected to an eBay item: zero candidates OR user picked
  // 'none'. These are the "shouldn't be posted" set surfaced via the review modal.
  const unmatchedListings = useMemo(() => {
    return listings.filter(l => {
      const id = listingKey(l);
      if (isListingImported(id)) return false;
      const sel = selection[id];
      const cands = candidatesByListing[id] || [];
      if (sel === 'none') return true;
      if (cands.length === 0 && (sel === undefined || sel === 'none')) return true;
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, selection, candidatesByListing, importedThisSession, persistedImported]);

  // Default selection: (1) if this listing has a PRIOR match (Item already
  // carries the poshmarkListingId), pin to that Item — never re-suggest randomly.
  // (2) Otherwise top heuristic candidate. Set once; never overrides user choice.
  useEffect(() => {
    setSelection(prev => {
      const next = { ...prev };
      for (const l of listings) {
        const id = listingKey(l);
        if (next[id] !== undefined) continue;
        const prior = priorMatchByListingId.get(id);
        if (prior) { next[id] = prior; continue; }
        const cands = candidatesByListing[id] || [];
        next[id] = cands.length > 0 ? cands[0].ebayItem.id : 'none';
      }
      return next;
    });
  }, [listings, candidatesByListing, priorMatchByListingId]);

  const pollFirestore = useCallback(async () => {
    if (!user || !mountedRef.current) return;
    try {
      let syncData: any = null;

      // Authenticated location first: users/{userId}/marketplaceData/sync
      const syncRef = doc(db, 'users', user.id, 'marketplaceData', 'sync');
      const syncSnapshot = await getDoc(syncRef);
      if (syncSnapshot.exists()) {
        const data = syncSnapshot.data();
        if (data.platform === 'poshmark') syncData = data;
      }

      // Fallback: marketplaceData/{userId}
      if (!syncData) {
        const userDocRef = doc(db, 'marketplaceData', user.id);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          if (data.platform === 'poshmark') syncData = data;
        }
      }

      // Last resort: scan public marketplaceData docs for any with platform=poshmark.
      if (!syncData) {
        const publicSnapshot = await getDocs(collection(db, 'marketplaceData'));
        for (const docSnap of publicSnapshot.docs) {
          const data = docSnap.data();
          if (data.platform === 'poshmark' && Array.isArray(data.listings) && data.listings.length > 0) {
            syncData = data;
            break;
          }
        }
      }

      if (!syncData?.listings || !Array.isArray(syncData.listings)) return;

      const allListings = syncData.listings as PoshmarkListing[];
      const activeListings = allListings.filter(isPoshmarkListingActive);
      if (!mountedRef.current) return;
      setListings(activeListings);

      // Stop capturing once the count has been stable for ~30s of polling.
      if (activeListings.length === lastCountRef.current && activeListings.length > 0) {
        stableCountRef.current++;
        if (stableCountRef.current >= 10) stopCapture();
      } else {
        stableCountRef.current = 0;
      }
      lastCountRef.current = activeListings.length;
    } catch (error) {
      console.error('[PoshmarkImportModal] Poll error:', error);
    }
  }, [user, stopCapture]);

  // Fresh scrape: wipe stale data, open Poshmark closet, poll every 3s for the
  // extension's overwrite. Always fresh — never shows cached items. 5min timeout
  // for big closets.
  const startCapture = useCallback(async () => {
    if (!user) return;
    console.log('[PoshmarkImportModal] startCapture — wiping + opening Poshmark');
    setListings([]);
    setSelection({});
    setExcludeMap({});
    setCaptureComplete(false);
    setStatusMessage('Scraping fresh Poshmark data... typically 30-90s for ~200 listings. Please leave the Poshmark tab open.');
    setIsCapturing(true);
    stableCountRef.current = 0;
    lastCountRef.current = 0;

    // Wipe known fallback marketplaceData docs so a stale capture doesn't bleed in.
    const firestore = getFirestore(app);
    for (const id of ['poshmark_retrothriftc0']) {
      try {
        await deleteDoc(doc(firestore, 'marketplaceData', id));
        console.log(`[PoshmarkImportModal] wiped marketplaceData/${id}`);
      } catch (e) {
        console.warn(`[PoshmarkImportModal] wipe marketplaceData/${id} failed:`, e);
      }
    }

    window.open(POSHMARK_CLOSET_URL, '_blank');
    setTimeout(() => window.focus(), 500);

    // Poll every 3s for up to 5 minutes. As soon as the extension writes data, the
    // listings populate.
    setTimeout(() => {
      if (!mountedRef.current) return;
      console.log('[PoshmarkImportModal] starting poll loop');
      pollFirestore();
      pollIntervalRef.current = setInterval(pollFirestore, 3000);
    }, 5000);

    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        console.log('[PoshmarkImportModal] hit 5min timeout');
        stopCapture();
      }
    }, 300000);
  }, [user, pollFirestore, stopCapture]);

  // On modal open: always start a fresh scrape. No cached data shown.
  useEffect(() => {
    if (!open || !user) return;
    console.log('[PoshmarkImportModal] open — initializeStore + startCapture (fresh)');
    initializeStore(user.id).catch(err => console.warn('[PoshmarkImportModal] initializeStore failed:', err));
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
    // Reset selection for this row to top of fresh batch (will be repopulated by
    // the default-selection useEffect, but only if no entry exists — clear it first).
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
    const id = listingKey(l);
    if (isListingImported(id)) return false;
    const s = selection[id];
    return Boolean(s) && s !== 'none';
  }).length;
  const totalBacklog = listings.filter(l => {
    const id = listingKey(l);
    if (isListingImported(id)) return false;
    return selection[id] === 'none';
  }).length;

  // Import: link matched rows to their chosen eBay item AND backlog "None of these"
  // rows. Backlog = user said this Poshmark listing has no eBay match → write to
  // PlatformListing with flagged='backlog'+backloggedAt so sync-stock can pick it
  // up later as an overstock candidate. Item collection is NOT touched for backlog
  // rows (they're not inventory bindings).
  const handleImportSelected = async () => {
    if (!user) return;
    const toImport: PoshmarkListing[] = [];
    const toBacklog: PoshmarkListing[] = [];
    const matchMap = new Map<string, { linkedGroupId: string; canonicalQty: number; ebayItemDocId: string }>();
    for (const l of listings) {
      const id = listingKey(l);
      if (isListingImported(id)) continue;
      const sel = selection[id];
      if (sel === 'none') {
        toBacklog.push(l);
        continue;
      }
      if (!sel) continue;
      const itemId = typeof sel === 'string' ? sel : sel.manual;
      const ebayItem = itemsById.get(itemId);
      if (!ebayItem) continue;
      toImport.push(l);
      matchMap.set(id, {
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
              platform: 'poshmark',
              listingId: listingKey(l),
              title: l.title || l.description || `Item ${listingKey(l)}`,
              price: extractPoshmarkPrice(l),
              description: l.description,
            })),
          );
          console.log(`[PoshmarkImportModal] Backlogged ${backloggedCount} listings as overstock candidates`);
        } catch (err) {
          console.error('[PoshmarkImportModal] backlog write failed:', err);
          toast.error('Backlog write failed — see console');
        }
      }

      // 2. Import matched rows (writes Item.poshmarkListingId + poshmarkImportedAt).
      let importResult = { imported: 0, skipped: 0, errors: [] as Array<{ itemId: string; error: string }> };
      if (toImport.length > 0) {
        importResult = await importPoshmarkItems(toImport, user.id, matchMap);
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
        const allDoneIds = new Set([
          ...toImport.map(l => listingKey(l)),
          ...toBacklog.map(l => listingKey(l)),
        ]);
        setImportedThisSession(prev => {
          const next = new Set(prev);
          for (const id of allDoneIds) next.add(id);
          return next;
        });
        await initializeStore(user.id);
      }
      if (importResult.skipped > 0) toast.info(`${importResult.skipped} skipped`);
      if (importResult.errors.length > 0) {
        console.error('[PoshmarkImportModal] Link errors:', importResult.errors);
        toast.error(`${importResult.errors.length} items failed to link`);
      }

      // 4. Auto-clear stale bindings against the FULL capture (`listings`), not
      // `toImport`. Items marked listed-on-Poshmark but missing from the capture
      // are no longer live → cleared, returning them to ShouldList.
      try {
        const liveIds = listings.map((l) => listingKey(l)).filter(Boolean);
        const cleared = await clearStalePoshmarkBindings(user.id, liveIds);
        if (cleared > 0) {
          toast.info(`${cleared} item${cleared === 1 ? '' : 's'} no longer on Poshmark — moved to “should list”`);
          await initializeStore(user.id);
        }
      } catch (err) {
        console.error('[PoshmarkImportModal] stale-binding cleanup failed:', err);
      }

      setStatusMessage(
        `Done — ${importResult.imported} linked, ${backloggedCount} backlogged${importResult.skipped ? `, ${importResult.skipped} skipped` : ''}`,
      );
    } catch (error) {
      console.error('[PoshmarkImportModal] Import failed:', error);
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
      title={inline ? '' : 'Import Poshmark Listings'}
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
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: POSHMARK_PURPLE }} />
                  <span className="font-medium" style={{ color: POSHMARK_PURPLE }}>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { window.open(POSHMARK_CLOSET_URL, '_blank'); setTimeout(() => window.focus(), 500); }}
                    className="hover:opacity-80"
                    style={{ color: POSHMARK_PURPLE }}
                  >
                    Reopen Poshmark
                  </Button>
                  <Button variant="ghost" size="sm" onClick={stopCapture} className="text-red-400 hover:text-red-300">
                    <StopCircle className="h-4 w-4 mr-1" /> Stop
                  </Button>
                </>
              )}
              {!isCapturing && captureComplete && listings.length === 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startCapture}
                  className="hover:opacity-80"
                  style={{ color: POSHMARK_PURPLE }}
                >
                  Retry Capture
                </Button>
              )}
              {!isCapturing && captureComplete && listings.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startCapture}
                  className="hover:opacity-80"
                  style={{ color: POSHMARK_PURPLE }}
                >
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
                <Button
                  onClick={handleImportSelected}
                  disabled={importing || (totalSelected === 0 && totalBacklog === 0)}
                  loading={importing}
                  className="text-white"
                  style={{ backgroundColor: POSHMARK_PURPLE }}
                >
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
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%`, backgroundColor: POSHMARK_PURPLE }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Body — list of rows */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-2">
          {isCapturing && listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 px-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin mb-4" style={{ color: POSHMARK_PURPLE }} />
              <p className="text-lg font-semibold" style={{ color: POSHMARK_PURPLE }}>Scraping fresh Poshmark data...</p>
              <p className="text-gray-400 text-sm mt-2">Typically 30-90 seconds for ~200 listings.</p>
              <p className="text-gray-500 text-xs mt-1">Keep the Poshmark tab open. Complete any security checks if prompted.</p>
            </div>
          ) : !isCapturing && listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ShoppingBag className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">No Poshmark listings found</p>
              <p className="text-sm mt-2">Try clicking "Retry Capture" above</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {listings.map(listing => {
                const id = listingKey(listing);
                const isImported = isListingImported(id);
                const cands = candidatesByListing[id] || [];
                const sel = selection[id];
                const reloaded = (excludeMap[id]?.size ?? 0) > 0;
                const isReloading = reloadingId === id;
                const imageUrl = getPoshmarkListingImage(listing);
                const price = extractPoshmarkPrice(listing);
                // Prefer title (the seller-written headline) over description for
                // Poshmark — Poshmark titles are typically meaningful, unlike Depop's
                // slugs.
                const poshTitle = listing.title || listing.description || `Item ${id}`;
                const isManual = typeof sel === 'object' && sel !== null && 'manual' in sel;

                return (
                  <div key={id} className={`px-3 py-3 hover:bg-gray-900/30 ${isImported ? 'opacity-50' : ''}`}>
                    {/* Listing row — Poshmark side on top */}
                    <div className="flex items-center gap-3 mb-2">
                      {imageUrl ? (
                        <img src={imageUrl} alt="" className="h-10 w-10 object-cover rounded flex-shrink-0" loading="lazy" />
                      ) : (
                        <div className="h-10 w-10 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                          <ShoppingBag className="h-4 w-4 text-gray-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-100 break-words" title={poshTitle}>{poshTitle}</div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                          <span className="text-green-400 font-semibold">${price.toFixed(2)}</span>
                          {listing.size && <span>· size {listing.size}</span>}
                          <span
                            className="px-1.5 py-px rounded text-[9px] uppercase tracking-wider"
                            style={{ backgroundColor: `${POSHMARK_PURPLE}33`, color: '#D9B7E4' }}
                          >
                            poshmark
                          </span>
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
                              onClick={() => handleReloadCard(id)}
                              disabled={isReloading || importing}
                              title="Reload — swap in next 3 candidates"
                              className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-50"
                            >
                              <RefreshCw className={`h-3 w-3 ${isReloading ? 'animate-spin' : ''}`} />
                            </button>
                            {reloaded && (
                              <button
                                type="button"
                                onClick={() => { setManualPickerListingId(id); setManualSearch(''); }}
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
                                name={`sel-${id}`}
                                checked={isSelected}
                                onChange={() => setSelection(prev => ({ ...prev, [id]: itemId }))}
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
                              <input type="radio" name={`sel-${id}`} checked readOnly className="flex-shrink-0" />
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
                            name={`sel-${id}`}
                            checked={sel === 'none'}
                            onChange={() => setSelection(prev => ({ ...prev, [id]: 'none' }))}
                            className="flex-shrink-0"
                          />
                          <div className="h-8 w-8 flex items-center justify-center flex-shrink-0">
                            <XIcon className="h-3.5 w-3.5 text-gray-500" />
                          </div>
                          <span className="text-[12px] text-gray-400">None of these</span>
                        </label>
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

      {/* Unmatched Poshmark listings — review + delist surface */}
      <PoshmarkUnmatchedModal
        open={showUnmatchedModal}
        onClose={() => setShowUnmatchedModal(false)}
        listings={unmatchedListings}
        onDelisted={ids => {
          // Remove delisted rows from the visible list so the user has accurate counts.
          setListings(prev => prev.filter(l => !ids.includes(listingKey(l))));
        }}
      />
    </Modal>
  );
};
