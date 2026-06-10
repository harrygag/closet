/**
 * SaleReconcileModal — turn `pending` SaleSnapshot rows (Poshmark/Depop sales since
 * calibration) into actual eBay-stock decrements.
 *
 * Three steps:
 *   1. MATCH   — each pending sale gets matched to an eBay-anchored Item. Rows whose
 *                listingId is already bound to an Item auto-link; the rest get top-3
 *                candidates from the deterministic matcher (same as the import flow),
 *                with reload / manual-pick / "none of these" (= skip this sale).
 *   2. PREVIEW — group matched sales by Item. Show, per Item: current eBay qty (from
 *                the last Check Quantity), how many matched sales subtract, and the
 *                projected new qty. Flags OVERSOLD (sales > qty) and OOS (new qty 0).
 *   3. REVIEW  — after submit (which calls ebayReviseItemQuantity / endItem and flips
 *                the rows to `reconciled`), show per-Item result + for OOS items, a
 *                "delist from {other platform}" button so the user closes the loop.
 *
 * `ebayService.reviseItemQuantity` / `endItem` take the eBay ItemID
 * (`Item.ebayListingId` / `ebayItemId`), not the Firestore doc id.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  X as XIcon, RefreshCw, Edit3, CheckCircle2, Loader2, Search, Package,
  ArrowRight, ArrowLeft, AlertTriangle, ExternalLink, DollarSign,
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { app } from '../../lib/firebase/client';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { getSnapshot, markNeedsCancel } from '../../services/inventory/saleSnapshot';
import { findTopEbayMatchesForListing } from '../../services/inventory/listingMatcher';
import { ebayService } from '../../services/ebayService';
import type { SaleSnapshotEntry } from '../../types/saleSnapshot';
import type { Item } from '../../types/item';
import { toast } from 'sonner';

const db = getFirestore(app);

interface SaleReconcileModalProps {
  open: boolean;
  platform: 'depop' | 'poshmark';
  onClose: () => void;
  onApplied?: () => void;
}

const PLATFORM_LABEL = { depop: 'Depop', poshmark: 'Poshmark', ebay: 'eBay' } as const;
const OTHER_NON_EBAY = { depop: 'poshmark', poshmark: 'depop' } as const;
const PLATFORM_ACCENT = {
  depop: 'border-gray-600/50 bg-gray-800 text-gray-200',
  poshmark: 'border-gray-600/50 bg-gray-800 text-gray-200',
} as const;

type Selection = string | 'none' | { manual: string; manualTitle: string };

interface CandRow { itemId: string; itemTitle: string; score: number; imageUrl?: string; auto?: boolean; }

interface ItemGroup {
  item: Item;
  rows: SaleSnapshotEntry[];
  saleCount: number;
  currentQty: number;
  newQty: number;
  oversold: boolean;
}

interface ApplyRow {
  itemId: string;
  itemName: string;
  imageUrl?: string;
  currentQty: number;
  newQty: number;
  ebayItemId?: string;
  ebayStatus: 'revised' | 'ended' | 'failed' | 'skipped';
  ebayError?: string;
  otherPlatformListingId?: string;
  otherPlatformUrl?: string;
}

function itemImage(it: any): string | undefined {
  return it?.imageUrl || it?.ebayPrimaryImage || it?.ebayPhotos?.[0]?.firebaseStorageUrl || it?.ebayPhotos?.[0]?.ebayUrl || undefined;
}
function itemTitleOf(it: any): string {
  return it?.ebayFullTitle || it?.title || it?.name || it?.id || '(no title)';
}
function ebayItemIdOf(it: any): string | undefined {
  return it?.ebayListingId || it?.ebayItemId || undefined;
}
function ebayQtyOf(it: any): number {
  if (it?.ebayDelisted === true) return 0;
  const q = it?.ebayQuantity;
  return typeof q === 'number' ? q : 1;
}
function poshmarkListingUrl(id: string): string { return `https://poshmark.com/listing/${id}`; }
function depopListingUrl(id: string): string { return `https://www.depop.com/products/${id}`; }

export const SaleReconcileModal = ({ open, platform, onClose, onApplied }: SaleReconcileModalProps) => {
  const { user } = useAuthStore();
  const { items, initializeStore } = useItemStore();

  const [step, setStep] = useState<'match' | 'preview' | 'review'>('match');
  const [loading, setLoading] = useState(false);
  const [pendingRows, setPendingRows] = useState<SaleSnapshotEntry[]>([]);
  const [candsByRow, setCandsByRow] = useState<Record<string, CandRow[]>>({});
  const [selection, setSelection] = useState<Record<string, Selection>>({});
  const [excludeMap, setExcludeMap] = useState<Record<string, string[]>>({});
  const [manualPickerRowId, setManualPickerRowId] = useState<string | null>(null);
  const [manualSearch, setManualSearch] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyRows, setApplyRows] = useState<ApplyRow[]>([]);
  const [delistKey, setDelistKey] = useState<string | null>(null);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [cancelBusy, setCancelBusy] = useState<Set<string>>(new Set());

  // The client matcher (findTopEbayMatchesForListing) reads `item.name` for keyword
  // extraction and player-detection, but the Item docs in Firestore store the title
  // in `title` (not `name`). Project `title` into `name` so the matcher actually has
  // something to score against — otherwise it returns 0 candidates for every row.
  const ebayItems = useMemo(
    () => items.filter(it => !!ebayItemIdOf(it)).map((it: any) => ({ ...it, name: it.name || it.title || it.ebayFullTitle || '' })),
    [items],
  );
  const itemsById = useMemo(() => { const m = new Map<string, Item>(); for (const it of items) m.set(it.id, it as Item); return m; }, [items]);

  // Rows whose listingId is already bound to an Item's {platform}ListingId → auto-link.
  const itemByPlatformListingId = useMemo(() => {
    const m = new Map<string, Item>();
    for (const it of items as any[]) {
      const pid = platform === 'poshmark' ? it.poshmarkListingId : it.depopListingId;
      if (pid) m.set(String(pid), it as Item);
    }
    return m;
  }, [items, platform]);

  // Manual match must let you pick ANY inventory item, not only eBay-anchored
  // ones, and must not silently hide most of them behind a 30-row cap.
  const allItemsForManual = useMemo(
    () => items.map((it: any) => ({ ...it, name: it.name || it.title || it.ebayFullTitle || '' })),
    [items],
  );
  const filteredItemsForManual = useMemo(() => {
    const q = manualSearch.trim().toLowerCase();
    const pool = q
      ? allItemsForManual.filter(it => itemTitleOf(it).toLowerCase().includes(q))
      : allItemsForManual;
    return pool.slice(0, 200);
  }, [allItemsForManual, manualSearch]);

  function topCandsForRow(row: SaleSnapshotEntry, exclude: string[]): CandRow[] {
    const ex = new Set(exclude);
    return findTopEbayMatchesForListing(row.title || '', '', ebayItems, 3, ex).map(r => ({
      itemId: r.ebayItem.id, itemTitle: itemTitleOf(r.ebayItem), score: Math.round(r.confidence * 100), imageUrl: itemImage(r.ebayItem),
    }));
  }

  useEffect(() => {
    if (!open || !user) return;
    // Wait for the item store to populate — if items hasn't loaded yet, ebayItems is
    // empty and the matcher returns 0 candidates for every row. Re-run when items
    // arrives (deps include items.length below). Pending rows are loaded only once
    // per modal-open (we don't reset them when items grow).
    if (ebayItems.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setStep('match'); setCandsByRow({}); setSelection({}); setExcludeMap({}); setApplyRows([]); setDoneKeys(new Set());
      try {
        // Query by userId only (no composite index needed) and filter client-side.
        // The (userId, platform, status) compound where requires a Firestore composite
        // index that doesn't exist; without it the client SDK throws → the modal showed
        // "No pending sales" even when SaleSnapshot had pending rows.
        const all = await getSnapshot(user.id);
        const rows = all
          .filter(r => r.platform === platform && r.status === 'pending')
          // Same ordering as NewSalesSinceBaselineWidget so the reconcile list
          // matches the /tools preview: newest sale first. Poshmark orders by
          // scrapeIndex (0 = top = newest; its ObjectId-derived soldAt is
          // unreliable); every other platform orders by soldAt desc, falling
          // back to firstSeenAt so rows without a soldAt still land sensibly
          // instead of in arbitrary Firestore document-id order.
          .sort((a, b) => {
            if (
              platform === 'poshmark' &&
              typeof a.scrapeIndex === 'number' && Number.isFinite(a.scrapeIndex) &&
              typeof b.scrapeIndex === 'number' && Number.isFinite(b.scrapeIndex)
            ) {
              if (a.scrapeIndex !== b.scrapeIndex) return a.scrapeIndex - b.scrapeIndex;
            }
            const aKey = a.soldAt || a.firstSeenAt || '';
            const bKey = b.soldAt || b.firstSeenAt || '';
            const c = bKey.localeCompare(aKey);
            if (c !== 0) return c;
            return b.id.localeCompare(a.id);
          });
        if (cancelled) return;
        setPendingRows(rows);
        const cbr: Record<string, CandRow[]> = {};
        const sel: Record<string, Selection> = {};
        for (const row of rows) {
          const bound = itemByPlatformListingId.get(String(row.listingId));
          if (bound) {
            cbr[row.id] = [{ itemId: bound.id, itemTitle: itemTitleOf(bound), score: 100, imageUrl: itemImage(bound), auto: true }];
            sel[row.id] = bound.id;
            continue;
          }
          const cands = topCandsForRow(row, []);
          cbr[row.id] = cands;
          sel[row.id] = cands.length > 0 ? cands[0].itemId : 'none';
        }
        setCandsByRow(cbr);
        setSelection(sel);
      } catch (err: any) {
        if (!cancelled) toast.error(`Failed to load pending sales: ${err?.message || 'unknown'}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user, platform, ebayItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const rowIds = pendingRows.map(r => r.id);
  const rowById = new Map(pendingRows.map(r => [r.id, r]));

  const handleReloadRow = (rowId: string) => {
    const row = rowById.get(rowId);
    if (!row) return;
    const current = candsByRow[rowId] || [];
    const newEx = [...(excludeMap[rowId] || []), ...current.map(c => c.itemId)];
    setExcludeMap(prev => ({ ...prev, [rowId]: newEx }));
    const fresh = topCandsForRow(row, newEx);
    if (fresh.length === 0) {
      toast.info('No more candidates for this sale.');
      setCandsByRow(prev => ({ ...prev, [rowId]: [] }));
      setSelection(prev => ({ ...prev, [rowId]: 'none' }));
    } else {
      setCandsByRow(prev => ({ ...prev, [rowId]: fresh }));
      setSelection(prev => ({ ...prev, [rowId]: fresh[0].itemId }));
    }
  };

  const handleManualPick = (rowId: string, itemId: string) => {
    const it = itemsById.get(itemId);
    if (!it) return;
    setSelection(prev => ({ ...prev, [rowId]: { manual: itemId, manualTitle: itemTitleOf(it) } }));
    setManualPickerRowId(null);
    setManualSearch('');
  };

  // "None of these" → the sale matched no inventory item, which almost always
  // means the order was cancelled. Flip the SaleSnapshot row → needs_cancel
  // (status flip + audit only, no delete) so it's permanently excluded from
  // stock decrements, and drop it from this run.
  const handleMarkCancelled = async (rowId: string) => {
    setCancelBusy(prev => new Set(prev).add(rowId));
    try {
      await markNeedsCancel(rowId);
      setPendingRows(prev => prev.filter(r => r.id !== rowId));
      setSelection(prev => { const n = { ...prev }; delete n[rowId]; return n; });
      toast.success('Marked as cancelled — excluded from stock changes (no delete).');
    } catch (e: any) {
      toast.error(`Mark cancelled failed: ${e?.message || e}`);
    } finally {
      setCancelBusy(prev => { const n = new Set(prev); n.delete(rowId); return n; });
    }
  };

  // Build the matched groups (item → its matched pending rows) for the preview.
  function buildGroups(): ItemGroup[] {
    const byItem = new Map<string, SaleSnapshotEntry[]>();
    for (const rowId of rowIds) {
      const sel = selection[rowId];
      if (!sel || sel === 'none') continue;
      const itemId = typeof sel === 'string' ? sel : sel.manual;
      const arr = byItem.get(itemId) || [];
      const row = rowById.get(rowId);
      if (row) arr.push(row);
      byItem.set(itemId, arr);
    }
    const groups: ItemGroup[] = [];
    for (const [itemId, rows] of byItem) {
      const item = itemsById.get(itemId);
      if (!item) continue;
      const currentQty = ebayQtyOf(item);
      const saleCount = rows.length;
      const newQty = Math.max(0, currentQty - saleCount);
      groups.push({ item, rows, saleCount, currentQty, newQty, oversold: currentQty < saleCount });
    }
    // OOS / oversold first
    groups.sort((a, b) => (a.newQty === 0 ? 0 : 1) - (b.newQty === 0 ? 0 : 1) || b.saleCount - a.saleCount);
    return groups;
  }

  const groups = step !== 'match' ? buildGroups() : [];
  const totalSelected = rowIds.filter(id => { const s = selection[id]; return s && s !== 'none'; }).length;
  const oosCount = groups.filter(g => g.newQty === 0).length;
  const oversoldCount = groups.filter(g => g.oversold).length;

  const handleSubmit = async () => {
    if (!user) return;
    const grps = buildGroups();
    if (grps.length === 0) { toast.info('Nothing matched to apply.'); return; }
    setApplying(true);
    const results: ApplyRow[] = [];
    // Re-baseline timestamp shared across all items in this run — the post-decrement
    // state IS the new baseline (per user: "moved to our new baseline since the
    // inventory should update"). Future reconciles measure from here.
    const reBaselineIso = new Date().toISOString();

    // Build a tokenized index of the OPPOSITE platform's active listings so we
    // can fuzzy-stamp the cross-platform binding (depopListingId on poshmark
    // reconciles, poshmarkListingId on depop reconciles) for items that didn't
    // have it before. Mirrors scripts/_backfill-platform-bindings.ts tokenizer.
    // Threshold 0.85 (looser than the backfill's 0.90 to catch more, still high
    // enough to avoid color/variant mistakes). Fetch failure = non-fatal,
    // falls through to original behavior (no cross-platform stamping).
    const STAMP_STOP = new Set(['the','a','an','and','or','for','in','on','of','to','with','new','nwt','size','mens','men','womens','women','jersey','product','this','that','is','are','fan','apparel','item','designed','made','perfect','fans','looking','featuring','features','team','logo','short','sleeve','machine','washable','fanatics','stitched','authentic','embroidered','adult','retro','navy','blue','red','white','green','black','gray','grey','small','medium','large']);
    const stampTok = (s: string): Set<string> => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STAMP_STOP.has(w)));
    const stampJac = (a: Set<string>, b: Set<string>): number => { if (!a.size || !b.size) return 0; let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i); };
    const STAMP_THRESHOLD = 0.85;
    type StampIdxEntry = { id: string; url: string; title: string; tok: Set<string> };
    let oppositeIdx: StampIdxEntry[] = [];
    const oppositePlatform: 'depop' | 'poshmark' = platform === 'poshmark' ? 'depop' : 'poshmark';
    try {
      const oppositeDocId = platform === 'poshmark' ? '486170762' : 'poshmark_retrothriftc0';
      const oppSnap = await getDoc(doc(db, 'marketplaceData', oppositeDocId));
      const rawListings: any[] = (oppSnap.exists() ? (oppSnap.data() as any)?.listings : []) || [];
      if (oppositePlatform === 'depop') {
        oppositeIdx = rawListings.map(l => ({
          id: String(l.id || l.product_id || l.listingId || l.slug || ''),
          url: l.listing_url || l.url || l.web_url || '',
          title: l.description || l.title || l.name || '',
          tok: stampTok(l.description || l.title || l.name || ''),
        })).filter(l => l.id);
      } else {
        oppositeIdx = rawListings.map(l => ({
          id: String(l.id || l.listing_id || l.listingId || ''),
          url: l.listing_url || l.url || '',
          title: l.title || l.description || l.name || '',
          tok: stampTok(l.title || l.description || l.name || ''),
        })).filter(l => l.id);
      }
    } catch (e: any) {
      console.warn(`[reconcile] opposite-platform active fetch failed (non-fatal): ${e?.message || e}`);
      oppositeIdx = [];
    }
    // Don't let two items in the same reconcile run both claim the same
    // opposite-platform listing.
    const claimedCross = new Set<string>();

    try {
      for (const g of grps) {
        const it: any = g.item;
        const ebId = ebayItemIdOf(it);
        let ebayStatus: ApplyRow['ebayStatus'] = 'skipped';
        let ebayError: string | undefined;

        // Compute binding patches. SAME-platform binding is definitive (exact
        // listingId from the SaleSnapshot row). CROSS-platform binding is
        // fuzzy title-match against the opposite platform's active scrape and
        // only fills when the item has no existing binding for that platform.
        const bindingPatch: Record<string, any> = {};
        let stampedSamePid: string | undefined;
        let stampedCrossPid: string | undefined;
        const samePidExisting = platform === 'poshmark' ? it.poshmarkListingId : it.depopListingId;
        if (!samePidExisting) {
          const sameListingId = g.rows.map(r => r.listingId).find(x => !!x);
          if (sameListingId) {
            if (platform === 'poshmark') bindingPatch.poshmarkListingId = String(sameListingId);
            else bindingPatch.depopListingId = String(sameListingId);
            stampedSamePid = String(sameListingId);
          }
        }
        const crossPidExisting = platform === 'poshmark' ? it.depopListingId : it.poshmarkListingId;
        if (!crossPidExisting && oppositeIdx.length > 0) {
          const itTitle = String(it.ebayFullTitle || it.title || it.name || '');
          const itTok = stampTok(itTitle);
          if (itTok.size > 0) {
            let best: { s: number; l: StampIdxEntry | null } = { s: 0, l: null };
            for (const l of oppositeIdx) {
              if (claimedCross.has(l.id)) continue;
              const s = stampJac(itTok, l.tok);
              if (s > best.s) best = { s, l };
            }
            if (best.s >= STAMP_THRESHOLD && best.l) {
              if (oppositePlatform === 'depop') {
                bindingPatch.depopListingId = best.l.id;
                if (best.l.url) bindingPatch.depopUrl = best.l.url;
                bindingPatch.depopQuantity = 1;
              } else {
                bindingPatch.poshmarkListingId = best.l.id;
                if (best.l.url) bindingPatch.poshmarkUrl = best.l.url;
                bindingPatch.poshmarkQuantity = 1;
              }
              claimedCross.add(best.l.id);
              stampedCrossPid = best.l.id;
            }
          }
        }
        if (stampedSamePid || stampedCrossPid) {
          const parts: string[] = [];
          if (platform === 'poshmark' && stampedSamePid) parts.push(`poshmarkListingId=${stampedSamePid}`);
          if (platform === 'depop' && stampedSamePid) parts.push(`depopListingId=${stampedSamePid}`);
          if (oppositePlatform === 'depop' && stampedCrossPid) parts.push(`depopListingId=${stampedCrossPid}`);
          if (oppositePlatform === 'poshmark' && stampedCrossPid) parts.push(`poshmarkListingId=${stampedCrossPid}`);
          console.log(`[reconcile] stamped ${parts.join(' ')} on item ${it.id}`);
        }

        // 1. update the Item doc — decrement AND re-baseline
        try {
          await updateDoc(doc(db, 'Item', it.id), {
            ebayQuantity: g.newQty,
            physicalQuantity: g.newQty,
            ebayQuantityAtBaseline: g.newQty,
            physicalQuantityAtBaseline: g.newQty,
            baselineCalibratedAt: reBaselineIso,
            stockStatus: g.newQty <= 0 ? 'SOLD' : g.newQty <= 2 ? 'LOW_STOCK' : 'IN_STOCK',
            ...(g.newQty <= 0 ? { status: 'SOLD', ebayDelisted: true } : {}),
            ...bindingPatch,
            updatedAt: serverTimestamp(),
          });
          // Reflect newly-stamped bindings on the in-memory item so the
          // results.push() below uses the fresh other-platform listing id/url.
          if (bindingPatch.poshmarkListingId) it.poshmarkListingId = bindingPatch.poshmarkListingId;
          if (bindingPatch.poshmarkUrl) it.poshmarkUrl = bindingPatch.poshmarkUrl;
          if (bindingPatch.depopListingId) it.depopListingId = bindingPatch.depopListingId;
          if (bindingPatch.depopUrl) it.depopUrl = bindingPatch.depopUrl;
        } catch (e: any) {
          ebayError = `Item update failed: ${e?.message || e}`;
        }
        // 2. push to eBay
        if (ebId && !ebayError) {
          try {
            if (g.newQty <= 0) { await ebayService.endItem(ebId); ebayStatus = 'ended'; }
            else { await ebayService.reviseItemQuantity(ebId, g.newQty); ebayStatus = 'revised'; }
          } catch (e: any) {
            const msg = String(e?.message || e);
            if (msg.includes('already been closed') || msg.includes('Auction ended')) ebayStatus = 'ended';
            else { ebayStatus = 'failed'; ebayError = msg; }
          }
        }
        // 3. flip the matched SaleSnapshot rows → reconciled, stamp itemId
        for (const row of g.rows) {
          try {
            // No "reconciled" limbo — an applied sale IS part of the new
            // baseline (eBay was just decremented + the Item re-baselined).
            await setDoc(doc(db, 'SaleSnapshot', row.id), {
              status: 'baseline', reconciledAt: new Date().toISOString(), itemId: it.id,
            }, { merge: true });
          } catch { /* best-effort */ }
        }
        const otherPid = platform === 'poshmark' ? it.depopListingId : it.poshmarkListingId;
        const otherUrl = platform === 'poshmark'
          ? (it.depopUrl || (it.depopListingId ? depopListingUrl(it.depopListingId) : undefined))
          : (it.poshmarkUrl || (it.poshmarkListingId ? poshmarkListingUrl(it.poshmarkListingId) : undefined));
        results.push({
          itemId: it.id, itemName: itemTitleOf(it), imageUrl: itemImage(it),
          currentQty: g.currentQty, newQty: g.newQty, ebayItemId: ebId,
          ebayStatus, ebayError,
          otherPlatformListingId: otherPid ? String(otherPid) : undefined,
          otherPlatformUrl: otherUrl,
        });
      }
      const revised = results.filter(r => r.ebayStatus === 'revised').length;
      const ended = results.filter(r => r.ebayStatus === 'ended').length;
      const failed = results.filter(r => r.ebayStatus === 'failed').length;
      const parts = [`${grps.reduce((n, g) => n + g.saleCount, 0)} sale(s) reconciled`];
      if (revised) parts.push(`${revised} eBay qty updated`);
      if (ended) parts.push(`${ended} eBay listing ended`);
      if (failed) parts.push(`${failed} eBay push failed`);
      toast.success(parts.join(' · '));
      // Auto-flip any explicitly-rejected ("None of these") rows to needs_cancel
      // so they don't keep appearing as pending on the next reconcile. Per-platform
      // agnostic — the selection model is the same on /depop and /poshmark.
      const noneRowIds = rowIds.filter(id => selection[id] === 'none');
      let cancelledFlipped = 0;
      for (const rowId of noneRowIds) {
        try { await markNeedsCancel(rowId); cancelledFlipped++; }
        catch (e) { console.warn('[reconcile] markNeedsCancel failed for', rowId, e); }
      }
      if (cancelledFlipped > 0) toast.info(`Marked ${cancelledFlipped} unmatched sale${cancelledFlipped===1?'':'s'} as cancelled`);
      setApplyRows(results);
      setStep('review');
      await initializeStore(user.id);
      onApplied?.();
    } catch (err: any) {
      toast.error(`Apply failed: ${err?.message || 'unknown'}`);
    } finally {
      setApplying(false);
    }
  };

  const handleEndEbay = async (r: ApplyRow) => {
    if (!r.ebayItemId) return;
    setDelistKey(`ebay:${r.itemId}`);
    try {
      await ebayService.endItem(r.ebayItemId);
      setDoneKeys(prev => new Set(prev).add(`ebay:${r.itemId}`));
      toast.success(`Ended eBay listing for ${r.itemName}`);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('already been closed')) { setDoneKeys(prev => new Set(prev).add(`ebay:${r.itemId}`)); toast.success('eBay listing already closed'); }
      else toast.error(`End eBay failed: ${msg}`);
    } finally { setDelistKey(null); }
  };

  const handleDelistOther = async (r: ApplyRow) => {
    const other = OTHER_NON_EBAY[platform];
    if (!r.otherPlatformListingId) return;
    setDelistKey(`${other}:${r.itemId}`);
    try {
      if (other === 'depop') {
        const fn = httpsCallable(getFunctions(app), 'depopDelistItem', { timeout: 60000 });
        await fn({ productId: r.otherPlatformListingId });
      } else {
        // gologinDelistItem is onRequest — fetch + ID token, body { platform, itemUrl, profileId }
        const auth = getAuth(app);
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const res = await fetch('https://us-central1-closet-da8f2.cloudfunctions.net/gologinDelistItem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ platform: 'poshmark', itemUrl: r.otherPlatformUrl || poshmarkListingUrl(r.otherPlatformListingId), profileId: '' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      setDoneKeys(prev => new Set(prev).add(`${other}:${r.itemId}`));
      toast.success(`Delisted ${r.itemName} from ${PLATFORM_LABEL[other]}`);
    } catch (e: any) {
      toast.error(`Delist from ${PLATFORM_LABEL[other]} failed: ${e?.message || e}`);
    } finally { setDelistKey(null); }
  };

  const otherLabel = PLATFORM_LABEL[OTHER_NON_EBAY[platform]];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f23] border-2 border-gray-600/50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
          <div className="flex items-center gap-3">
            <div className={`px-2 py-1 rounded text-xs font-semibold border ${PLATFORM_ACCENT[platform]}`}>{PLATFORM_LABEL[platform]}</div>
            <div>
              <h2 className="text-lg font-bold text-gray-100">Reconcile pending sales</h2>
              <p className="text-xs text-gray-400">
                {step === 'match' && (loading ? 'Loading pending sales…' : `${pendingRows.length} pending · ${totalSelected} matched`)}
                {step === 'preview' && `${groups.length} item${groups.length === 1 ? '' : 's'} affected · ${oosCount} will go OOS`}
                {step === 'review' && 'Applied — review below'}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-2 text-[10px] text-gray-500">
              <span className={step === 'match' ? 'text-gray-300 font-semibold' : ''}>1 Match</span>
              <ArrowRight className="h-3 w-3" />
              <span className={step === 'preview' ? 'text-gray-300 font-semibold' : ''}>2 Preview</span>
              <ArrowRight className="h-3 w-3" />
              <span className={step === 'review' ? 'text-gray-300 font-semibold' : ''}>3 Review</span>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={applying} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-100 disabled:opacity-50">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin mb-3" /><p className="text-sm">Loading pending {PLATFORM_LABEL[platform]} sales…</p>
            </div>
          )}

          {/* STEP 1 — MATCH */}
          {!loading && step === 'match' && pendingRows.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-12">No pending {PLATFORM_LABEL[platform]} sales to reconcile.</div>
          )}
          {!loading && step === 'match' && pendingRows.length > 0 && (
            <div className="divide-y divide-gray-800/60">
              {pendingRows.map(row => {
                const cands = candsByRow[row.id] || [];
                const sel = selection[row.id];
                const isManual = typeof sel === 'object' && sel !== null && 'manual' in sel;
                const isAuto = cands.length === 1 && cands[0].auto && sel === cands[0].itemId;
                return (
                  <div key={row.id} className="px-2 py-3 hover:bg-gray-900/40">
                    <div className="flex items-center gap-2 mb-2">
                      {row.imageUrl ? <img src={row.imageUrl} alt="" className="h-9 w-9 rounded object-cover flex-shrink-0" loading="lazy" />
                        : <div className="h-9 w-9 rounded bg-gray-800 flex items-center justify-center flex-shrink-0"><Package className="h-4 w-4 text-gray-600" /></div>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-100 truncate" title={row.title}>{row.title || '(no title)'}</div>
                        <div className="flex items-center gap-2 text-[10px] text-gray-500">
                          {typeof row.salePrice === 'number' && <span className="flex items-center text-green-400"><DollarSign className="h-2.5 w-2.5" />{row.salePrice.toFixed(2)}</span>}
                          {isAuto && <span className="px-1 rounded bg-emerald-900/40 text-emerald-300">auto-linked</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" onClick={() => handleReloadRow(row.id)} title="Reload — next 3 candidates" className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200"><RefreshCw className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => { setManualPickerRowId(row.id); setManualSearch(''); }} title="Manual match" className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200"><Edit3 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <div className="space-y-1 pl-11">
                      {cands.map(c => {
                        const isSelected = sel === c.itemId;
                        return (
                          <label key={c.itemId} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${isSelected ? 'bg-gray-700/40 border border-gray-600/50' : 'bg-gray-900/30 border border-gray-800 hover:border-gray-700'}`}>
                            <input type="radio" name={`sel-${row.id}`} checked={isSelected} onChange={() => setSelection(prev => ({ ...prev, [row.id]: c.itemId }))} className="flex-shrink-0" />
                            {c.imageUrl ? <img src={c.imageUrl} alt="" className="h-8 w-8 object-cover rounded flex-shrink-0" loading="lazy" />
                              : <div className="h-8 w-8 bg-gray-800 rounded flex items-center justify-center flex-shrink-0"><Package className="h-3.5 w-3.5 text-gray-600" /></div>}
                            <div className="flex-1 min-w-0"><div className={`text-sm truncate ${isSelected ? 'text-gray-100' : 'text-gray-200'}`}>{c.itemTitle}</div></div>
                            {!c.auto && <span className="text-xs font-mono text-gray-300 flex-shrink-0">{c.score}</span>}
                          </label>
                        );
                      })}
                      {isManual && (() => {
                        const mid = (sel as { manual: string; manualTitle: string }).manual;
                        const it = itemsById.get(mid); const img = it ? itemImage(it) : undefined;
                        return (
                          <label className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-700/40 border border-gray-600/50 cursor-pointer">
                            <input type="radio" name={`sel-${row.id}`} checked readOnly className="flex-shrink-0" />
                            {img ? <img src={img} alt="" className="h-8 w-8 object-cover rounded flex-shrink-0" loading="lazy" /> : <div className="h-8 w-8 bg-gray-800 rounded flex items-center justify-center flex-shrink-0"><Package className="h-3.5 w-3.5 text-gray-600" /></div>}
                            <div className="flex-1 min-w-0"><div className="text-sm text-gray-100 truncate">{(sel as { manualTitle: string }).manualTitle}</div><div className="text-[10px] text-gray-400">manual pick</div></div>
                          </label>
                        );
                      })()}
                      <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${sel === 'none' ? 'bg-gray-700/40 border border-gray-500/40' : 'bg-gray-900/20 border border-gray-800 hover:border-gray-700'}`}>
                        <input type="radio" name={`sel-${row.id}`} checked={sel === 'none'} onChange={() => setSelection(prev => ({ ...prev, [row.id]: 'none' }))} className="flex-shrink-0" />
                        <div className="h-8 w-8 flex items-center justify-center flex-shrink-0"><XIcon className="h-3.5 w-3.5 text-gray-500" /></div>
                        <span className="text-sm text-gray-400 flex-1">None of these — skip this sale (won't decrement stock)</span>
                        {sel === 'none' && (
                          <button
                            type="button"
                            disabled={cancelBusy.has(row.id)}
                            onClick={(e) => { e.preventDefault(); handleMarkCancelled(row.id); }}
                            title="No match → the order was most likely cancelled. Flag this sale as cancelled so it never decrements stock (status flip only, no delete)."
                            className="flex items-center gap-1 px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 text-red-200 text-xs font-semibold disabled:opacity-50 flex-shrink-0"
                          >
                            {cancelBusy.has(row.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <XIcon className="h-3 w-3" />}
                            Mark as cancelled
                          </button>
                        )}
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* STEP 2 — PREVIEW */}
          {step === 'preview' && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 px-1">
                eBay quantities below are from the last <span className="text-gray-300">Check Quantity</span> run. Each matched sale subtracts 1. On submit, the new qty is pushed to eBay <em>and</em> becomes the item's new baseline (`ebayQuantityAtBaseline`).
                {oversoldCount > 0 && <span className="text-red-400"> · {oversoldCount} item(s) oversold (more sales than eBay qty — clamped to 0).</span>}
              </div>
              {groups.length === 0 && <div className="text-center text-gray-500 text-sm py-12">Nothing matched. Go back and pick items.</div>}
              {groups.map(g => {
                const it: any = g.item; const img = itemImage(it);
                return (
                  <div key={it.id} className={`rounded-lg border p-3 ${g.newQty === 0 ? 'border-orange-700/50 bg-orange-900/15' : g.oversold ? 'border-red-700/50 bg-red-900/15' : 'border-gray-700/50 bg-gray-900/40'}`}>
                    <div className="flex items-center gap-3">
                      {img ? <img src={img} alt="" className="h-11 w-11 rounded object-cover flex-shrink-0" /> : <div className="h-11 w-11 rounded bg-gray-800 flex items-center justify-center flex-shrink-0"><Package className="h-5 w-5 text-gray-600" /></div>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-100 truncate" title={it.name}>{itemTitleOf(it)}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{g.saleCount} matched {PLATFORM_LABEL[platform]} sale{g.saleCount === 1 ? '' : 's'}{ebayItemIdOf(it) ? '' : ' · no eBay ItemID — won\'t push to eBay'}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 text-center">
                        <div><div className="text-[9px] text-gray-500 uppercase">eBay now</div><div className="text-lg font-semibold text-gray-200">{g.currentQty}</div></div>
                        <ArrowRight className="h-4 w-4 text-gray-500" />
                        <div>
                          <div className="text-[9px] text-gray-500 uppercase">→ after</div>
                          <div className={`text-lg font-bold ${g.newQty === 0 ? 'text-orange-300' : 'text-emerald-300'}`}>{g.newQty}</div>
                        </div>
                        {g.newQty === 0 && <span className="px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-300 text-[10px] font-semibold">OOS → end listing</span>}
                        {g.oversold && <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 text-[10px] font-semibold">OVERSOLD</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* STEP 3 — REVIEW */}
          {step === 'review' && (
            <div className="space-y-2">
              {applyRows.length === 0 && <div className="text-center text-gray-500 text-sm py-12">Nothing applied.</div>}
              {applyRows.map(r => {
                const isOos = r.newQty === 0;
                const ebayDone = doneKeys.has(`ebay:${r.itemId}`) || r.ebayStatus === 'ended';
                const other = OTHER_NON_EBAY[platform];
                const otherDone = doneKeys.has(`${other}:${r.itemId}`);
                return (
                  <div key={r.itemId} className={`rounded-lg border p-3 ${isOos ? 'border-orange-700/50 bg-orange-900/15' : 'border-gray-700/50 bg-gray-900/40'}`}>
                    <div className="flex items-center gap-3">
                      {r.imageUrl ? <img src={r.imageUrl} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" /> : <div className="h-10 w-10 rounded bg-gray-800 flex items-center justify-center flex-shrink-0"><Package className="h-4 w-4 text-gray-600" /></div>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-100 truncate">{r.itemName}</div>
                        <div className="text-[10px] mt-0.5">
                          <span className="text-gray-400">eBay {r.currentQty} → {r.newQty}</span>{' · '}
                          {r.ebayStatus === 'revised' && <span className="text-emerald-400">qty updated on eBay ✓</span>}
                          {r.ebayStatus === 'ended' && <span className="text-orange-400">eBay listing ended ✓</span>}
                          {r.ebayStatus === 'failed' && <span className="text-red-400">eBay push FAILED — {r.ebayError}</span>}
                          {r.ebayStatus === 'skipped' && <span className="text-gray-500">no eBay ItemID — eBay not touched</span>}
                          <span className="text-gray-500"> · baseline reset to {r.newQty}</span>
                        </div>
                      </div>
                      {isOos && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {r.ebayItemId && !ebayDone && (
                            <button type="button" disabled={delistKey === `ebay:${r.itemId}`} onClick={() => handleEndEbay(r)} className="px-2 py-1 rounded bg-orange-700/30 hover:bg-orange-700/50 border border-orange-600/40 text-orange-100 text-xs disabled:opacity-50">
                              {delistKey === `ebay:${r.itemId}` ? 'Ending…' : 'End eBay listing'}
                            </button>
                          )}
                          {ebayDone && <span className="text-emerald-400 text-xs">eBay ended ✓</span>}
                          {r.otherPlatformListingId && !otherDone && (
                            <button type="button" disabled={delistKey === `${other}:${r.itemId}`} onClick={() => handleDelistOther(r)} className="px-2 py-1 rounded bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/40 text-gray-100 text-xs disabled:opacity-50">
                              {delistKey === `${other}:${r.itemId}` ? `Delisting…` : `Delist from ${otherLabel}`}
                            </button>
                          )}
                          {otherDone && <span className="text-emerald-400 text-xs">{otherLabel} delisted ✓</span>}
                          {r.otherPlatformUrl && <a href={r.otherPlatformUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300"><ExternalLink className="h-3.5 w-3.5" /></a>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {applyRows.some(r => r.newQty === 0) && (
                <div className="text-[11px] text-gray-500 px-1 flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-orange-400" />Items at qty 0 are still active until you end the eBay listing and delist from {otherLabel} — do that to avoid overselling.</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700/50 p-3 flex items-center justify-between gap-2">
          {step === 'match' && (
            <>
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-100">Cancel</button>
              <button type="button" onClick={() => setStep('preview')} disabled={totalSelected === 0} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600/50 rounded-xl text-gray-100 text-sm font-medium disabled:opacity-50">
                Preview stock changes <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button type="button" onClick={() => setStep('match')} disabled={applying} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-100 disabled:opacity-50"><ArrowLeft className="h-4 w-4" /> Back</button>
              <button type="button" onClick={handleSubmit} disabled={applying || groups.length === 0} className="flex items-center gap-2 px-4 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 rounded-xl text-emerald-100 text-sm font-medium disabled:opacity-50">
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {applying ? 'Applying…' : `Submit — apply ${groups.reduce((n, g) => n + g.saleCount, 0)} sale(s)`}
              </button>
            </>
          )}
          {step === 'review' && (
            <>
              <span className="text-xs text-gray-500">{applyRows.length} item(s) reconciled.</span>
              <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600/50 rounded-xl text-gray-100 text-sm font-medium">Done</button>
            </>
          )}
        </div>
      </div>

      {/* Manual picker overlay */}
      {manualPickerRowId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setManualPickerRowId(null)}>
          <div className="bg-[#0f0f23] border-2 border-gray-600/50 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
              <h3 className="text-base font-bold text-gray-100">Manual match — pick any item ({allItemsForManual.length})</h3>
              <button type="button" onClick={() => setManualPickerRowId(null)} className="p-1 hover:bg-gray-800 rounded text-gray-400"><XIcon className="h-4 w-4" /></button>
            </div>
            <div className="p-3 border-b border-gray-700/40">
              <div className="relative"><Search className="h-4 w-4 absolute left-2 top-2.5 text-gray-500" />
                <input autoFocus type="text" value={manualSearch} onChange={e => setManualSearch(e.target.value)} placeholder="Search by title…" className="w-full pl-8 pr-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:border-gray-500" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredItemsForManual.length === 0 && <div className="text-xs text-gray-500 p-4 text-center">No matches — try a different search term.</div>}
              {filteredItemsForManual.length >= 200 && <div className="text-[10px] text-gray-500 px-3 py-1">Showing first 200 — type to narrow.</div>}
              {filteredItemsForManual.map(it => (
                <button key={it.id} type="button" onClick={() => handleManualPick(manualPickerRowId, it.id)} className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 text-sm text-gray-100 flex items-center gap-2">
                  {itemImage(it) ? <img src={itemImage(it)} alt="" className="h-7 w-7 rounded object-cover flex-shrink-0" /> : <div className="h-7 w-7 rounded bg-gray-800 flex items-center justify-center flex-shrink-0"><Package className="h-3.5 w-3.5 text-gray-600" /></div>}
                  <span className="truncate">{itemTitleOf(it)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
