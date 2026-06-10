/**
 * DelistQueueWidget — every Item whose eBay listing is ended / OOS / SOLD but is still
 * bound to a Poshmark or Depop listing. These are the "you sold this on eBay (or it's
 * out of stock) and you forgot to delist it from the other site, so it's at risk of
 * overselling" items.
 *
 * Per-row actions:
 *   • Delist from Depop  → `depopDelistItem` (onCall) + clear `depopListingId/Url/Quantity`
 *   • Delist from Poshmark → `gologinDelistItem` (onRequest + ID token) + clear `poshmark*`
 *   • Mark handled  → just clear the platform bindings (no CF call); for items the user
 *                     already delisted manually
 *   • External link → open the platform listing
 *
 * After any of those, the Item naturally drops out of this widget because the filter
 * requires at least one non-eBay binding to be present.
 *
 * Live: the widget reads from `useItemStore`; after a delist we call `initializeStore`
 * to refresh (the store is a one-shot fetch, not a subscription).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getFirestore, updateDoc, deleteField, serverTimestamp, collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { stockOnHand } from '../../services/inventory/stockOnHand';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { app } from '../../lib/firebase/client';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { AlertOctagon, ExternalLink, Package, X as XIcon, Loader2, CheckCircle2, Copy, Ban, Undo2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getSnapshot, markNeedsCancel, markUncounted, restockItem } from '../../services/inventory/saleSnapshot';
import { normalizeListing } from '../../services/inventory/listingNormalizer';
import { findTopEbayMatchesForListing } from '../../services/inventory/listingMatcher';
import { checkDepopListing as extCheckDepop, deleteDepopListing as extDeleteDepop, extensionConnected } from '../../lib/extension/depopActions';
import {
  checkPoshmarkListing as extCheckPosh,
  deletePoshmarkListing as extDeletePosh,
  setPoshmarkListingQuantityZero,
} from '../../lib/extension/poshmarkActions';
import { checkFacebookListing as extCheckFb, deleteFacebookListing as extDeleteFb } from '../../lib/extension/facebookActions';
import { checkWhatnotListing as extCheckWn, deleteWhatnotListing as extDeleteWn } from '../../lib/extension/whatnotActions';
import { MARKETPLACE_ICONS, MARKETPLACE_COLORS } from '../../utils/marketplace';

/**
 * Platform brand mark. Shows the marketplace icon in its brand color in a small
 * chip. `busy` draws an animated ring around it (signals "working on this site").
 * If `onClick` is given it's a button (used as the Poshmark delist control); if
 * `href` it opens the listing; otherwise it's a static indicator.
 */
function PlatformLogo({
  platform, busy = false, onClick, href, title,
}: {
  platform: 'poshmark' | 'depop' | 'ebay' | 'facebook' | 'whatnot';
  busy?: boolean;
  onClick?: () => void;
  href?: string;
  title?: string;
}) {
  const Icon = MARKETPLACE_ICONS[platform];
  const color = MARKETPLACE_COLORS[platform];
  const chip = (
    <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 border border-gray-700/60">
      {busy && (
        <span
          className="absolute inset-[-3px] rounded-full border-2 animate-spin"
          style={{ borderColor: color, borderTopColor: 'transparent' }}
        />
      )}
      <span style={{ color }} className="inline-flex"><Icon className="h-3.5 w-3.5" /></span>
    </span>
  );
  if (onClick) {
    return (
      <button type="button" title={title} onClick={onClick} disabled={busy}
        className="hover:opacity-80 transition-opacity disabled:cursor-default">
        {chip}
      </button>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={title}
        className="hover:opacity-80 transition-opacity">
        {chip}
      </a>
    );
  }
  return <span title={title}>{chip}</span>;
}
import type { SaleSnapshotEntry } from '../../types/saleSnapshot';
import type { Item } from '../../types/item';

const db = getFirestore(app);

function itemImage(it: any): string | undefined {
  return it?.imageUrl || it?.ebayPrimaryImage
    || it?.ebayPhotos?.[0]?.firebaseStorageUrl || it?.ebayPhotos?.[0]?.ebayUrl
    || (Array.isArray(it?.imageUrls) && it.imageUrls[0]) || undefined;
}
function itemTitleOf(it: any): string {
  return it?.title || it?.ebayFullTitle || it?.name || it?.id || '(no title)';
}
function poshmarkListingUrl(id: string): string { return `https://poshmark.com/listing/${id}`; }
function depopListingUrl(id: string): string { return `https://www.depop.com/products/${id}`; }
const PLATFORM_LABEL = { depop: 'Depop', poshmark: 'Poshmark', facebook: 'Facebook', whatnot: 'Whatnot' } as const;

function toMs(v: any): number | null {
  if (!v) return null;
  const t = typeof v === 'string' ? Date.parse(v)
    : (v?.toDate ? v.toDate().getTime() : (v?.seconds ? v.seconds * 1000 : (v?._seconds ? v._seconds * 1000 : NaN)));
  return isNaN(t as number) ? null : (t as number);
}

/** Real eBay sale timestamps (ms, ascending) for an item — from the
 *  ebayBackfillSoldHistory-populated `unitSales` (platform 'ebay'). */
function ebaySaleMsAsc(it: any): number[] {
  const us: any[] = Array.isArray(it?.unitSales) ? it.unitSales : [];
  return us.filter(u => u && (u.platform === 'ebay' || u.platform === 'eBay'))
    .map(u => toMs(u.soldAt ?? u.soldDate))
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
}

/** How many units the listing started with (best available; corrupted-to-0
 *  baselines floor at 1 so a single-unit jersey is treated correctly). */
function effectiveCapacity(it: any): number {
  return Math.max(1, Number(it?.ebayQuantityAtBaseline) || 0, Number(it?.ebayQuantity) || 0);
}

/** When the eBay listing was removed/ended (a removed listing can't fulfil
 *  anything sold after it), or null if still listed. */
function ebayRemovedMs(it: any): number | null {
  if (it?.ebayDelisted !== true && it?.status !== 'SOLD') return null;
  return toMs(it?.ebayDelistedAt) ?? toMs(it?.soldDate) ?? toMs(it?.baselineCalibratedAt) ?? toMs(it?.updatedAt);
}

/**
 * FULL consumption model (the user's exact rule). A non-eBay sale at `soldMs`
 * is an oversell iff, by that moment, the item's unit was already consumed by
 * ANY of: an eBay sale, the eBay listing being removed, OR a sale on the OTHER
 * non-eBay platform. `otherSalesMs` = that other platform's sale timestamps for
 * this item. Consumption events are pooled, sorted; the unit is "out" once
 * cumulative events reach capacity, or at the eBay-removed time, whichever is
 * first. Sold strictly after that → oversell (can't be fulfilled → cancel).
 */
function isOversell(it: any, soldMs: number | null, otherSalesMs: number[]): boolean {
  if (soldMs === null) return false;
  const events = [...ebaySaleMsAsc(it), ...otherSalesMs.filter(n => typeof n === 'number')].sort((a, b) => a - b);
  const cap = effectiveCapacity(it);
  let zeroAt: number | null = events.length >= cap ? events[cap - 1] : null;
  const removed = ebayRemovedMs(it);
  if (removed !== null) zeroAt = zeroAt === null ? removed : Math.min(zeroAt, removed);
  return zeroAt !== null && soldMs > zeroAt;
}

// --- Oversold (sold on eBay + Depop) → cancel + replacement-or-refund ---------
// Replacement matching is heuristic (no structured player/team/color columns —
// they're parsed from titles). "stitched/authentic/embroidered/fanatics" are
// stop-words: never used to match and never injected into buyer messages
// (Fanatics-replica legal rule).
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'in', 'on', 'of', 'to', 'with', 'new',
  'nwt', 'size', 'mens', 'men', 'womens', 'women', 'jersey', 'product', 'this', 'that', 'is', 'are',
  'fan', 'apparel', 'item', 'designed', 'made', 'perfect', 'fans', 'looking', 'featuring', 'features',
  'team', 'logo', 'short', 'sleeve', 'machine', 'washable', 'fanatics', 'stitched', 'authentic', 'embroidered']);
function titleTokens(s: string): Set<string> {
  return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0; for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
function inStock(it: any): boolean {
  if (it?.status === 'SOLD' || it?.ebayDelisted === true) return false;
  const q = it?.ebayQuantity ?? it?.physicalQuantity;
  return typeof q === 'number' ? q > 0 : true;
}
type ReplReason = 'same-player-diff-color' | 'same-team-color';
interface Replacement { item: any; reason: ReplReason; }
/** Prefer same player + different colorway; else same color + strong title (≈ same team). In-stock only. */
function findReplacement(oversold: any, pool: any[]): Replacement | null {
  const oN = normalizeListing(oversold as Item, 'ebay');
  const oTok = titleTokens(itemTitleOf(oversold));
  let samePlayer: { it: any; score: number } | null = null;
  let teamColor: { it: any; score: number } | null = null;
  for (const it of pool) {
    if (it.id === oversold.id || !inStock(it)) continue;
    const n = normalizeListing(it as Item, 'ebay');
    if (oN.player && n.player && oN.player === n.player
      && !(oN.color && n.color && oN.color === n.color)) {
      const s = jaccard(oTok, titleTokens(itemTitleOf(it)));
      if (!samePlayer || s > samePlayer.score) samePlayer = { it, score: s };
      continue;
    }
    if (oN.color && n.color && oN.color === n.color) {
      const s = jaccard(oTok, titleTokens(itemTitleOf(it)));
      if (s >= 0.30 && (!teamColor || s > teamColor.score)) teamColor = { it, score: s };
    }
  }
  if (samePlayer) return { item: samePlayer.it, reason: 'same-player-diff-color' };
  if (teamColor) return { item: teamColor.it, reason: 'same-team-color' };
  return null;
}
function buildBuyerMessage(soldTitle: string, replacement: Replacement | null): string {
  const L: string[] = [
    'Hi! Thank you so much for your order.',
    '',
    `Unfortunately "${soldTitle}" just sold on another platform at the same time, so I'm not able to ship that exact one — I'm really sorry for the mix-up.`,
    '',
  ];
  if (replacement) {
    const why = replacement.reason === 'same-player-diff-color'
      ? 'the same player in a different colorway'
      : 'the same team in a matching color';
    L.push(`I'd love to make it right. I have a very similar item in stock — ${why}:`);
    L.push(`  • ${itemTitleOf(replacement.item)}`);
    L.push('');
    L.push('I can ship that as a replacement at no extra cost, OR give you a full refund — whichever you prefer. Just let me know!');
  } else {
    L.push("I don't have a close replacement available right now, so I'll go ahead and issue a full refund. Sorry again for the inconvenience.");
  }
  L.push('', 'Thanks for understanding!');
  return L.join('\n');
}

interface DelistQueueWidgetProps {
  /** Filter the queue to a single platform. Omit to show items on either Posh or Depop. */
  platform?: 'depop' | 'poshmark' | 'facebook' | 'whatnot';
}

export const DelistQueueWidget = ({ platform }: DelistQueueWidgetProps = {}) => {
  const { user } = useAuthStore();
  const { items, initializeStore } = useItemStore();
  const [busy, setBusy] = useState<Record<string, string>>({}); // key: itemId:platform
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Extension-driven run over selected rows. mode 'check' = liveness only;
  // 'checkdelist' = check then auto-delete if still up. One row at a time.
  const [runMode, setRunMode] = useState<null | 'check' | 'checkdelist'>(null);
  const [walkQueue, setWalkQueue] = useState<string[]>([]);
  const [walkIdx, setWalkIdx] = useState<number>(-1); // -1 = not running
  const [walkPaused, setWalkPaused] = useState(false);
  const [rowState, setRowState] = useState<Record<string, 'checking' | 'deleting' | 'live' | 'gone' | 'error'>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const lastProcIdx = useRef<number>(-1);
  const inFlight = useRef(false);
  const pausedRef = useRef(false);

  // Depop SaleSnapshot rows (pending = a new Depop sale; needs_cancel = already
  // flagged as oversold). Loaded by userId only — the (userId,platform,status)
  // compound query needs a composite index that doesn't exist and throws
  // silently, so we filter client-side (same workaround as SaleReconcileModal).
  // saleRows = ALL rows for THIS platform (any status — we evaluate the
  // consumption model live, so even baseline-absorbed sales can resurface as
  // genuine oversells). allRows = every SaleSnapshot row (used to pull the
  // OTHER non-eBay platform's sale times for the consumption model).
  const [saleRows, setSaleRows] = useState<SaleSnapshotEntry[]>([]);
  const [allRows, setAllRows] = useState<SaleSnapshotEntry[]>([]);
  // Poshmark order_ids Poshmark itself marks refunded/cancelled. A refunded
  // Poshmark sale is already-handled: it is NOT an oversell to flag and NOT a
  // real consumption event (the unit wasn't actually shipped). Brand-new
  // (non-refunded) sales still flow through our oversell system — per user.
  const [refundedPoshOrderIds, setRefundedPoshOrderIds] = useState<Set<string>>(new Set());
  const [msgFor, setMsgFor] = useState<string | null>(null); // itemId whose buyer-message panel is open
  const [flipBusy, setFlipBusy] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // cancelled-orders history panel

  // Orphan listings (platform listings imported with no eBay match — see
  // services/{depop,poshmark}/import.ts). Live-subscribed so a fresh import
  // surfaces them here without refresh. SKU = listingId (the cross-platform
  // marker we already carry); when an orphan is later matched to an Item it
  // inherits Item.sku via the binding step. Same code path works for any
  // platform — add a new platform to the union + extension actions, no widget
  // rewrite needed.
  const [orphans, setOrphans] = useState<Array<{ docId: string; listingId: string; title: string; sku: string; url?: string; imageUrl?: string }>>([]);
  const [orphanBusy, setOrphanBusy] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id || !platform) { setOrphans([]); return; }
    const q = query(
      collection(getFirestore(app), 'OrphanListing'),
      where('userId', '==', user.id),
      where('platform', '==', platform),
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows: Array<{ docId: string; listingId: string; title: string; sku: string; url?: string; imageUrl?: string }> = [];
      snap.forEach((d) => {
        const data: any = d.data();
        if (data?.delistedAt) return; // hide already-handled
        const lid = String(data.listingId || '');
        if (!lid) return;
        rows.push({
          docId: d.id,
          listingId: lid,
          title: String(data.title || ''),
          sku: String(data.sku || lid),
          url: data.url,
          imageUrl: data.imageUrl,
        });
      });
      setOrphans(rows);
    }, (err) => {
      console.warn('[DelistQueueWidget] orphan subscription error:', err);
    });
    return () => unsub();
  }, [user?.id, platform]);

  async function handleOrphanDelist(orphan: { docId: string; listingId: string; title: string }) {
    const key = orphan.docId;
    setOrphanBusy(p => ({ ...p, [key]: 'Delisting…' }));
    try {
      // Per-platform delist action — extension macros that work on a raw
      // listing-id without needing an Item doc.
      let result: { success?: boolean; error?: string } | null | undefined = null;
      if (platform === 'depop') {
        result = await extDeleteDepop(orphan.listingId);
      } else if (platform === 'poshmark') {
        // For Poshmark, delete is blocked on multistock-with-sold; qty-zero
        // handles every case (already-0, live, gone/404 → removed).
        result = await setPoshmarkListingQuantityZero(orphan.listingId);
      }
      if (!result || result.success !== true) {
        const err = (result && result.error) || 'delist failed';
        toast.error(`Failed to delist "${orphan.title || orphan.listingId}": ${err}`);
        return;
      }
      // Audit trail: mark delistedAt; the doc stays so a future re-import won't
      // resurface this listing in the queue.
      await updateDoc(doc(getFirestore(app), 'OrphanListing', orphan.docId), {
        delistedAt: new Date().toISOString(),
      });
      toast.success(`Delisted "${(orphan.title || orphan.listingId).slice(0, 40)}" from ${platform === 'depop' ? 'Depop' : 'Poshmark'}`);
    } catch (e: any) {
      toast.error(`Delist failed: ${e?.message || String(e)}`);
    } finally {
      setOrphanBusy(p => { const n = { ...p }; delete n[key]; return n; });
    }
  }

  async function loadSaleRows() {
    if (!user || !platform) { setSaleRows([]); setAllRows([]); return; }
    try {
      const all = await getSnapshot(user.id);
      setAllRows(all);
      setSaleRows(all.filter(r => r.platform === platform));
      // Collect refunded order/listing ids from ALL scraped sold docs (Depop +
      // Poshmark). A refunded/cancelled order is already handled → excluded
      // from consumption + needs-cancel for whichever platform.
      try {
        const mp = await getDocs(collection(getFirestore(app), 'marketplaceData'));
        const refunded = new Set<string>();
        mp.forEach(d => {
          const ls: any[] = (d.data() as any)?.listings || [];
          for (const l of ls) {
            if (!l || l.is_refunded !== true) continue;
            for (const k of [l.order_id, l.id, l.listing_id, l._purchaseId, l.purchaseId]) {
              if (k) refunded.add(String(k));
            }
          }
        });
        setRefundedPoshOrderIds(refunded);
      } catch { /* best-effort */ }
    } catch { /* best-effort; oversold flagging just won't show */ }
  }
  useEffect(() => { loadSaleRows(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user, platform]);

  // Auto-pull real eBay sale dates (ebayBackfillSoldHistory writes them into
  // Item.unitSales) so oversold detection uses WHEN eBay actually sold, not our
  // reconcile timestamp. Runs at most once / 6h (guarded), silent/best-effort,
  // then refreshes the item store so oversoldAuto recomputes with real dates.
  const backfillRanRef = useRef(false);
  useEffect(() => {
    if (!user || backfillRanRef.current) return;
    const KEY = 'ebaySoldBackfillAt';
    const last = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - last < 6 * 3600 * 1000) return; // throttle
    backfillRanRef.current = true;
    (async () => {
      try {
        localStorage.setItem(KEY, String(Date.now()));
        const fn = httpsCallable(getFunctions(app), 'ebayBackfillSoldHistory', { timeout: 300000 });
        await fn({});
        await initializeStore(user.id); // reload items now carrying eBay unitSales
      } catch { /* best-effort — model falls back to the coarse heuristic */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const queue = useMemo(() => {
    return items.filter((it: any) => {
      // Real stock-on-hand: eBay available MINUS matched non-eBay sales — an
      // item with ebayQuantity > 0 but enough matched Posh/Depop sales to zero
      // it out IS effectively OOS and must enter the delist queue. Shared
      // helper keeps this consistent with reconciliation.ts.
      const soh = stockOnHand(it);
      const ebayInactive = it.ebayDelisted === true || it.ebayQuantity === 0 || it.status === 'SOLD' || soh <= 0;
      if (!ebayInactive) return false;
      if (platform === 'depop') return !!it.depopListingId;
      if (platform === 'poshmark') return !!it.poshmarkListingId;
      if (platform === 'facebook') return !!it.facebookListingId;
      if (platform === 'whatnot') return !!it.whatnotListingId;
      return !!(it.poshmarkListingId || it.depopListingId || it.facebookListingId || it.whatnotListingId);
    });
  }, [items, platform]);

  // checkableIds drives the extension Check / Check&delist run. Both platforms
  // have an extension macro now (Depop /manage/ delete, Poshmark /edit-listing
  // → Delete Listing → Yes). A row is checkable when it carries that platform's
  // listing id.
  const checkableIds = useMemo(() => {
    if (platform === 'poshmark') return queue.filter((it: any) => !!it.poshmarkListingId).map((it: any) => it.id);
    if (platform === 'facebook') return queue.filter((it: any) => !!it.facebookListingId).map((it: any) => it.id);
    if (platform === 'whatnot') return queue.filter((it: any) => !!it.whatnotListingId).map((it: any) => it.id);
    return queue.filter((it: any) => !!it.depopListingId).map((it: any) => it.id);
  }, [queue, platform]);

  // eBay-anchored items with title projected into `name` — the matcher reads
  // `name` (mirrors SaleReconcileModal exactly).
  const ebayItems = useMemo(
    () => items.filter((it: any) => !!(it.ebayListingId || it.ebayItemId))
      .map((it: any) => ({ ...it, name: it.name || it.title || it.ebayFullTitle || '' })),
    [items],
  );
  const itemsByIdMap = useMemo(() => {
    const m = new Map<string, any>(); for (const it of ebayItems as any[]) m.set(it.id, it); return m;
  }, [ebayItems]);

  // Attribute a sale row to an eBay item: stamped itemId first, else best
  // title match. Cached per (itemId|title) so we don't re-run the matcher.
  const matchCache = useRef<Map<string, any>>(new Map());
  useEffect(() => { matchCache.current = new Map(); }, [ebayItems]);
  const matchRowItem = (row: { itemId?: string; title?: string }): any => {
    if (row.itemId && itemsByIdMap.has(row.itemId)) return itemsByIdMap.get(row.itemId);
    const key = `t:${row.title || ''}`;
    if (matchCache.current.has(key)) return matchCache.current.get(key);
    const top = findTopEbayMatchesForListing(row.title || '', '', ebayItems as Item[], 1);
    const it = top[0] && top[0].confidence >= 0.45 ? top[0].ebayItem : null;
    matchCache.current.set(key, it);
    return it;
  };

  // A SaleSnapshot row (Depop OR Poshmark) whose order the platform marks
  // refunded/cancelled. Poshmark saleKey = `order:{id}`; Depop saleKey =
  // `{purchaseId}:{listingId}` or `{purchaseId}-{idx}`. Match any id token in
  // the saleKey, or the listingId, against the refunded id set. Refunded = the
  // unit was NOT really consumed and there's nothing to cancel.
  const isRefundedRow = (r: any): boolean => {
    if (refundedPoshOrderIds.size === 0) return false;
    const key = typeof r.saleKey === 'string' ? r.saleKey : '';
    const tokens = key.replace(/^order:/, '').split(/[:|\-]/).filter(Boolean);
    for (const t of tokens) if (refundedPoshOrderIds.has(t)) return true;
    return !!r.listingId && refundedPoshOrderIds.has(String(r.listingId));
  };

  // OTHER non-eBay platform's sale times per eBay item — a consumption source.
  // Skip refunded sales: a refunded order didn't really ship → no unit consumed.
  const OTHER_PLAT = platform === 'depop' ? 'poshmark' : 'depop';
  const otherSalesByItem = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of allRows) {
      if (r.platform !== OTHER_PLAT) continue;
      if (isRefundedRow(r)) continue;
      // Restocked rows are explicitly excluded from consumption — the user
      // told us this physical unit is back in stock, so this sale must not
      // count against the item's capacity in the oversold model.
      if ((r as any).restockedAt) continue;
      const it = matchRowItem(r as any);
      if (!it) continue;
      const t = r.soldAt ? Date.parse(r.soldAt) : NaN;
      if (isNaN(t)) continue;
      const arr = m.get(it.id) || []; arr.push(t); m.set(it.id, arr);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, ebayItems, OTHER_PLAT, refundedPoshOrderIds]);

  // FULL consumption model over ALL this-platform rows (ANY status — so
  // genuine oversells that were absorbed into baseline still resurface). A row
  // is shown iff it sold AFTER its item's unit was consumed by an eBay sale,
  // the eBay listing being removed, or a sale on the OTHER platform.
  const oversoldAuto = useMemo(() => {
    if (ebayItems.length === 0) return [] as Array<{ row: SaleSnapshotEntry; item: any; conf: number }>;
    const out: Array<{ row: SaleSnapshotEntry; item: any; conf: number }> = [];
    for (const row of saleRows) {
      // Cancelled sales now count as consumption (user rule: cancelled = OOS
      // unless explicitly restocked). The platform-refunded skip used to live
      // here; it's removed so an oversell flagged on a cancelled order still
      // surfaces and stays flagged. Restock action excludes a row via
      // `restockedAt` (see otherSalesByItem builder).
      const it = matchRowItem(row as any);
      if (!it) continue;
      const soldMs = row.soldAt ? Date.parse(row.soldAt) : null;
      if (!isOversell(it, soldMs, otherSalesByItem.get(it.id) || [])) continue;
      out.push({ row, item: it, conf: 1 });
    }
    // Poshmark: order by scrape_index (0 = top = newest, matches the real
    // Poshmark page) when BOTH rows have a finite scrapeIndex — the
    // ObjectId-derived soldAt is unreliable for Poshmark. Other platforms (and
    // Poshmark rows missing scrapeIndex) keep the existing soldAt-desc order.
    out.sort((a, b) => {
      if (
        platform === 'poshmark' &&
        typeof a.row.scrapeIndex === 'number' && Number.isFinite(a.row.scrapeIndex) &&
        typeof b.row.scrapeIndex === 'number' && Number.isFinite(b.row.scrapeIndex)
      ) {
        if (a.row.scrapeIndex !== b.row.scrapeIndex) return a.row.scrapeIndex - b.row.scrapeIndex;
      }
      return Date.parse(b.row.soldAt || '') - Date.parse(a.row.soldAt || '');
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleRows, ebayItems, otherSalesByItem]);

  // Cancelled-orders history for THIS platform: every row flagged needs_cancel
  // (a persisted record of what was flagged to cancel), newest first.
  const cancelHistory = useMemo(
    () => saleRows
      .filter(r => r.status === 'needs_cancel')
      // Poshmark: order by scrape_index (0 = top = newest, matches the real
      // Poshmark page) when BOTH rows have a finite scrapeIndex — the
      // ObjectId-derived soldAt is unreliable for Poshmark. Other platforms
      // (and Poshmark rows missing scrapeIndex) keep existing soldAt-desc.
      .sort((a, b) => {
        if (
          platform === 'poshmark' &&
          typeof a.scrapeIndex === 'number' && Number.isFinite(a.scrapeIndex) &&
          typeof b.scrapeIndex === 'number' && Number.isFinite(b.scrapeIndex)
        ) {
          if (a.scrapeIndex !== b.scrapeIndex) return a.scrapeIndex - b.scrapeIndex;
        }
        return Date.parse(b.soldAt || '') - Date.parse(a.soldAt || '');
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saleRows],
  );

  // Auto-flip any detected oversell (incl. ones wrongly absorbed into baseline)
  // → needs_cancel ONCE, reversible via Undo. An oversell is NOT a fulfilled
  // sale, so it must not sit in baseline counted as one. Skips rows already
  // needs_cancel. Persists the flag so it survives reloads.
  const autoFlippedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const toFlip = oversoldAuto.filter(o =>
      o.row.status !== 'needs_cancel' && !autoFlippedRef.current.has(o.row.id));
    if (toFlip.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const o of toFlip) {
        autoFlippedRef.current.add(o.row.id);
        try { await markNeedsCancel(o.row.id, o.item.id); } catch { autoFlippedRef.current.delete(o.row.id); }
      }
      if (cancelled) return;
      await loadSaleRows();
      toast.success(`${toFlip.length} oversold ${platform === 'poshmark' ? 'Poshmark' : 'Depop'} order${toFlip.length === 1 ? '' : 's'} flagged to cancel — buyer messages ready below.`);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oversoldAuto]);

  useEffect(() => { pausedRef.current = walkPaused; }, [walkPaused]);

  // Extension-driven processor. MUST be before the early return (rules of
  // hooks). One row at a time: ask the extension whether the Depop listing is
  // still live (real logged-in session — server can't, it's 403'd). If gone,
  // clear the binding (the ONLY path that removes a row). If still up and the
  // run is 'checkdelist', drive the extension's /manage/ delete macro and clear
  // on success. Never removes a row unless we CONFIRMED it's gone.
  useEffect(() => {
    if (!runMode || walkIdx < 0) { lastProcIdx.current = -1; return; }
    if (walkIdx >= walkQueue.length) {
      const done = walkQueue.length;
      setRunMode(null); setWalkIdx(-1); setWalkQueue([]); setWalkPaused(false);
      if (user) initializeStore(user.id); // drop the rows whose binding got cleared
      toast.success(`Done — ${done} row${done === 1 ? '' : 's'} processed.`);
      return;
    }
    if (walkPaused) return;
    if (inFlight.current) return;
    if (lastProcIdx.current === walkIdx) return;
    lastProcIdx.current = walkIdx;

    const itemId = walkQueue[walkIdx];
    const it = queue.find((q: any) => q.id === itemId);
    const plat: 'poshmark' | 'depop' | 'facebook' | 'whatnot' = platform === 'poshmark' ? 'poshmark' : platform === 'facebook' ? 'facebook' : platform === 'whatnot' ? 'whatnot' : 'depop';
    const listingKey = it
      ? plat === 'poshmark' ? it.poshmarkListingId
      : plat === 'facebook' ? it.facebookListingId
      : plat === 'whatnot' ? it.whatnotListingId
      : it.depopListingId
      : null;
    if (!it || !listingKey) { setWalkIdx(i => (i < 0 ? i : i + 1)); return; }
    const extId = String(listingKey);
    const clearPlat: 'poshmark' | 'depop' | 'facebook' | 'whatnot' = plat;
    const extCheck = plat === 'poshmark' ? extCheckPosh : plat === 'facebook' ? extCheckFb : plat === 'whatnot' ? extCheckWn : extCheckDepop;
    const extDelete = plat === 'poshmark' ? extDeletePosh : plat === 'facebook' ? extDeleteFb : plat === 'whatnot' ? extDeleteWn : extDeleteDepop;

    let cancelled = false;
    inFlight.current = true;
    setRowState(p => ({ ...p, [itemId]: 'checking' }));
    setRowError(p => { const n = { ...p }; delete n[itemId]; return n; });
    const fail = (stage: string, msg?: string) => {
      const m = msg ? `${stage}: ${msg}` : stage;
      setRowState(p => ({ ...p, [itemId]: 'error' }));
      setRowError(p => ({ ...p, [itemId]: m }));
    };
    let stage = 'check';
    (async () => {
      try {
        if (plat === 'poshmark' && runMode !== 'check') {
          // Poshmark delist = set quantity to 0 in ONE foreground tab. The
          // qty-zero macro handles every case: already-0 → done, live → set 0 +
          // relist, deleted/404 → removed. Delete is always blocked for the
          // multistock-with-sold SKUs in this queue, so we skip the redundant
          // check + delete tabs (no more 3-tab churn).
          stage = 'qty-zero';
          setRowState(p => ({ ...p, [itemId]: 'deleting' }));
          const qzRes = await setPoshmarkListingQuantityZero(extId);
          if (cancelled) return;
          if (qzRes.success) {
            setRowState(p => ({ ...p, [itemId]: 'gone' }));
            await clearBindings(it.id, [clearPlat]);
          } else {
            fail('qty-zero', (qzRes as any).error || 'failed');
          }
          return;
        }
        const checkRes: any = await extCheck(extId);
        if (cancelled) return;
        if (checkRes && checkRes.error) { fail('check', String(checkRes.error)); return; }
        const exists = !!(checkRes && checkRes.exists);
        if (!exists) {
          setRowState(p => ({ ...p, [itemId]: 'gone' }));
          await clearBindings(it.id, [clearPlat]);
        } else if (runMode === 'check') {
          setRowState(p => ({ ...p, [itemId]: 'live' }));
        } else {
          stage = 'delete';
          setRowState(p => ({ ...p, [itemId]: 'deleting' }));
          const delRes = await extDelete(extId);
          if (cancelled) return;
          if (delRes.success) {
            setRowState(p => ({ ...p, [itemId]: 'gone' }));
            await clearBindings(it.id, [clearPlat]);
          } else if (plat === 'poshmark') {
            // On Poshmark, ANY non-success delete falls back to setting quantity
            // to 0 — delete is blocked for multistock-with-sold SKUs, and the
            // qty-zero macro itself handles every case correctly: already-0 →
            // done, live → set 0 + relist, gone/404 → removed. (Don't gate on the
            // blockedByMultistock flag — if it's ever unset we'd dead-end here.)
            stage = 'qty-zero';
            toast.info('Poshmark blocks delete on sold-multistock listings — setting quantity to 0 instead');
            setRowState(p => ({ ...p, [itemId]: 'deleting' }));
            try {
              const qzRes = await setPoshmarkListingQuantityZero(extId);
              if (cancelled) return;
              if (qzRes.success) {
                setRowState(p => ({ ...p, [itemId]: 'gone' }));
                await clearBindings(it.id, [clearPlat]);
              } else {
                fail('qty-zero', (qzRes as any).error || 'failed');
              }
            } catch (e: any) {
              if (!cancelled) fail('qty-zero', e?.message || String(e));
            }
          } else {
            fail('delete', (delRes as any).error || 'failed');
          }
        }
      } catch (e: any) {
        if (!cancelled) fail(stage, e?.message || String(e));
      } finally {
        if (!cancelled) {
          inFlight.current = false;
          if (!pausedRef.current) setTimeout(() => setWalkIdx(i => (i < 0 ? i : i + 1)), 600);
        }
      }
    })();
    return () => { cancelled = true; inFlight.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runMode, walkIdx, walkPaused, walkQueue]);

  const oversoldVisible = oversoldAuto.length > 0;
  if (queue.length === 0 && !oversoldVisible && cancelHistory.length === 0 && orphans.length === 0) return null; // nothing to show

  const setBusyKey = (k: string, label: string) => setBusy(prev => ({ ...prev, [k]: label }));
  const clearBusyKey = (k: string) => setBusy(prev => { const n = { ...prev }; delete n[k]; return n; });

  async function clearBindings(itemId: string, platforms: Array<'poshmark' | 'depop' | 'facebook' | 'whatnot'>) {
    const patch: Record<string, any> = { updatedAt: serverTimestamp() };
    for (const p of platforms) {
      if (p === 'poshmark') {
        patch.poshmarkListingId = deleteField();
        patch.poshmarkUrl = deleteField();
        patch.poshmarkQuantity = deleteField();
        patch.poshmarkDelistedAt = new Date().toISOString();
      } else if (p === 'facebook') {
        patch.facebookListingId = deleteField();
        patch.facebookUrl = deleteField();
        patch.facebookQuantity = deleteField();
        patch.facebookDelistedAt = new Date().toISOString();
      } else if (p === 'whatnot') {
        patch.whatnotListingId = deleteField();
        patch.whatnotUrl = deleteField();
        patch.whatnotQuantity = deleteField();
        patch.whatnotDelistedAt = new Date().toISOString();
      } else {
        patch.depopListingId = deleteField();
        patch.depopUrl = deleteField();
        patch.depopQuantity = deleteField();
        patch.depopDelistedAt = new Date().toISOString();
      }
    }
    await updateDoc(doc(db, 'Item', itemId), patch);
  }

  async function handleDelist(it: any, platform: 'poshmark' | 'depop' | 'facebook' | 'whatnot') {
    const k = `${it.id}:${platform}`;
    setBusyKey(k, 'Delisting…');
    try {
      if (platform === 'depop') {
        const productId = String(it.depopListingId);
        if (!productId) throw new Error('No depopListingId on item');
        const fn = httpsCallable(getFunctions(app), 'depopDelistItem', { timeout: 60000 });
        await fn({ productId });
      } else if (platform === 'facebook') {
        // Extension macro not built yet — throws a clear error surfaced via toast.
        const id = String(it.facebookListingId);
        if (!id) throw new Error('No facebookListingId on item');
        await extDeleteFb(id);
      } else if (platform === 'whatnot') {
        const id = String(it.whatnotListingId);
        if (!id) throw new Error('No whatnotListingId on item');
        await extDeleteWn(id);
      } else {
        const itemUrl = it.poshmarkUrl || poshmarkListingUrl(String(it.poshmarkListingId));
        const auth = getAuth(app);
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const res = await fetch('https://us-central1-closet-da8f2.cloudfunctions.net/gologinDelistItem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ platform: 'poshmark', itemUrl, profileId: '' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      await clearBindings(it.id, [platform]);
      toast.success(`Delisted "${itemTitleOf(it).slice(0, 40)}" from ${platform === 'depop' ? 'Depop' : platform === 'facebook' ? 'Facebook' : platform === 'whatnot' ? 'Whatnot' : 'Poshmark'}`);
      if (user) await initializeStore(user.id);
    } catch (e: any) {
      toast.error(`Delist from ${platform} failed: ${e?.message || e}`);
    } finally {
      clearBusyKey(k);
    }
  }

  // Multi-select + sequential "check Depop listing" helpers. (checkableIds is hoisted
  // above the early return to keep the hooks ordering stable.)
  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allSelected = checkableIds.length > 0 && checkableIds.every(id => selected.has(id));
  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(checkableIds));
  };

  // Start an extension-driven run over the selected (Depop-bound) rows.
  // 'check' = liveness only; 'checkdelist' = check then auto-delete if up.
  function startRun(mode: 'check' | 'checkdelist') {
    if (!extensionConnected()) {
      toast.error('Extension not connected. In chrome://extensions reload the extension (v2.19+), then hard-refresh this page and retry.');
      return;
    }
    const ids = queue.filter((it: any) => selected.has(it.id)
      && (platform === 'poshmark' ? !!it.poshmarkListingId : !!it.depopListingId)).map((it: any) => it.id);
    if (ids.length === 0) return;
    lastProcIdx.current = -1;
    inFlight.current = false;
    setRowState(prev => { const n = { ...prev }; for (const id of ids) delete n[id]; return n; });
    setRowError(prev => { const n = { ...prev }; for (const id of ids) delete n[id]; return n; });
    setWalkQueue(ids);
    setWalkPaused(false);
    setRunMode(mode);
    setWalkIdx(0);
  }
  function advanceWalk() { setWalkIdx(i => (i < 0 ? i : i + 1)); }
  function cancelWalk() { setRunMode(null); setWalkIdx(-1); setWalkQueue([]); setWalkPaused(false); }

  async function handleMarkHandled(it: any) {
    const k = `${it.id}:handled`;
    setBusyKey(k, 'Marking…');
    try {
      const platforms: Array<'poshmark' | 'depop' | 'facebook' | 'whatnot'> = [];
      if (it.poshmarkListingId) platforms.push('poshmark');
      if (it.depopListingId) platforms.push('depop');
      if (it.facebookListingId) platforms.push('facebook');
      if (it.whatnotListingId) platforms.push('whatnot');
      await clearBindings(it.id, platforms);
      toast.success(`Marked "${itemTitleOf(it).slice(0, 40)}" as handled`);
      if (user) await initializeStore(user.id);
    } catch (e: any) {
      toast.error(`Mark handled failed: ${e?.message || e}`);
    } finally {
      clearBusyKey(k);
    }
  }

  const setFlip = (id: string, on: boolean) => setFlipBusy(prev => {
    const n = new Set(prev); on ? n.add(id) : n.delete(id); return n;
  });

  // Undo an auto-flagged oversell — put the Depop sale row back to `pending`.
  async function handleUndoNeedsCancel(it: any, cancelRows: SaleSnapshotEntry[]) {
    setFlip(it.id, true);
    try {
      for (const r of cancelRows) await markUncounted(r.id); // → back to 'pending'
      await loadSaleRows();
      if (msgFor === it.id) setMsgFor(null);
      toast.success('Reverted — back to a pending Depop sale');
    } catch (e: any) {
      toast.error(`Undo failed: ${e?.message || e}`);
    } finally {
      setFlip(it.id, false);
    }
  }

  // Restock — user explicitly marks the cancelled item back IN_STOCK. Writes
  // the SaleSnapshot `restockedAt` annotation (status preserved for audit) and
  // re-baselines the Item back to `quantity`. Refreshes the store so the item
  // drops out of the delist queue and oversold detection.
  async function handleRestock(row: SaleSnapshotEntry, itemId: string) {
    setFlip(row.id, true);
    try {
      await restockItem(row.id, itemId, 1);
      if (user) await initializeStore(user.id);
      await loadSaleRows();
      toast.success('Restocked');
    } catch (e: any) {
      toast.error(`Restock failed: ${e?.message || e}`);
    } finally {
      setFlip(row.id, false);
    }
  }
  async function copyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed — select the text and copy manually.');
    }
  }

  return (
    <div className="bg-gray-900/60 border border-gray-700/50 rounded-2xl p-4 mb-6 shadow-lg">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertOctagon className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-bold text-gray-100">
            {platform === 'depop' ? 'Pending Depop delistings' : platform === 'poshmark' ? 'Pending Poshmark delistings' : 'Pending delistings'}
            {' — '}{queue.length} item{queue.length === 1 ? '' : 's'}
          </h3>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setShowHistory(v => !v)}
            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border disabled:opacity-40 ${showHistory ? 'text-gray-100 border-gray-500/60 bg-gray-800' : 'text-gray-400 hover:text-gray-100 border-gray-700/60 hover:border-gray-500/60'}`}
            title="Show the history of orders flagged to cancel on this platform"
          >
            <Ban className="h-3 w-3" />
            {showHistory ? 'Hide history' : `Cancelled history (${cancelHistory.length})`}
          </button>
          {checkableIds.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={!!runMode}
              className="text-[11px] text-gray-400 hover:text-gray-100 px-2 py-1 rounded border border-gray-700/60 hover:border-gray-500/60 disabled:opacity-40"
            >
              {allSelected ? 'Clear' : `Select all (${checkableIds.length})`}
            </button>
          )}
          {checkableIds.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => startRun('check')}
                disabled={!!runMode || selected.size === 0}
                title={`For each selected row, the extension checks (in your logged-in ${platform === 'poshmark' ? 'Poshmark' : 'Depop'} session) whether the listing is still live. Gone → removed from this list. Still up → flagged. Nothing is removed unless confirmed gone.`}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 border border-gray-600/60 text-gray-100 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Check selected ({selected.size})
              </button>
              <button
                type="button"
                onClick={() => startRun('checkdelist')}
                disabled={!!runMode || selected.size === 0}
                title={platform === 'poshmark'
                  ? 'For each selected row: check if still on Poshmark; if so, auto-delete it via the edit-listing → Delete Listing flow; then remove from this list. Already-gone ones are just removed.'
                  : 'For each selected row: check if still on Depop; if so, auto-delete it via the Depop manage page; then remove from this list. Already-gone ones are just removed.'}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 text-red-200 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <XIcon className="h-3.5 w-3.5" />
                Check &amp; delist selected ({selected.size})
              </button>
            </>
          )}
        </div>
      </div>
      <div className="text-[10px] text-gray-500 mb-2">
        eBay ended/OOS/SOLD but still listed → delist to prevent oversell.
        {platform === 'poshmark'
          ? ' The extension drives your logged-in Poshmark session (server-side is blocked) via the edit-listing → Delete Listing → Yes flow. A row is removed ONLY when we confirm the listing is gone (or after a successful delete).'
          : ' The extension drives your logged-in Depop session (server-side is blocked). A row is removed ONLY when we confirm the listing is gone (or after a successful delete).'}
      </div>

      {/* Cancelled-orders history */}
      {showHistory && (
        <div className="mb-3 rounded-lg border border-gray-700/50 bg-gray-900/40 p-3">
          <div className="text-xs font-bold text-gray-100 flex items-center gap-1.5 mb-2">
            <Ban className="h-4 w-4 text-gray-400" />
            Cancelled history — {platform ? PLATFORM_LABEL[platform] : ''} ({cancelHistory.length})
            <span className="font-normal text-gray-500">· orders flagged to cancel</span>
          </div>
          {cancelHistory.length === 0 ? (
            <div className="text-[11px] text-gray-500">No cancelled orders yet.</div>
          ) : (
            <ul className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {cancelHistory.map(row => {
                const it = matchRowItem(row as any);
                const repl = it ? findReplacement(it, items) : null;
                const msg = buildBuyerMessage(row.title || (it ? itemTitleOf(it) : '(no title)'), repl);
                const open = msgFor === `h:${row.id}`;
                return (
                  <li key={row.id} className="rounded-lg bg-gray-800/40 border border-gray-700/40 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-100 truncate" title={row.title}>{row.title || '(no title)'}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {row.soldAt ? new Date(row.soldAt).toLocaleDateString() : 'no date'}
                          {it ? <> · matched: <span className="text-gray-400">{itemTitleOf(it).slice(0, 36)}</span></> : ' · no inventory match'}
                          {(row as any).needsCancelAt ? ' · flagged' : ''}
                        </div>
                      </div>
                      <button type="button" onClick={() => { setMsgFor(open ? null : `h:${row.id}`); setCopied(false); }}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 text-gray-100 text-xs flex-shrink-0">
                        <Copy className="h-3 w-3" />{open ? 'Hide' : 'Msg'}
                      </button>
                      <button type="button" disabled={flipBusy.has(row.id)}
                        onClick={() => handleUndoNeedsCancel({ id: row.id }, [row])}
                        title="Undo — put this sale back to pending"
                        className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-100 disabled:opacity-50 flex-shrink-0">
                        {flipBusy.has(row.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" disabled={flipBusy.has(row.id) || !it}
                        onClick={() => { if (it) handleRestock(row, it.id); }}
                        title={it ? 'Restock — mark item back in stock' : 'No matched item to restock'}
                        className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-100 disabled:opacity-50 flex-shrink-0">
                        {flipBusy.has(row.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    {open && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-gray-500">Buyer message ({repl ? 'replacement' : 'refund'})</span>
                          <button type="button" onClick={() => copyMessage(msg)}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 text-gray-100 text-xs font-semibold">
                            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <textarea readOnly value={msg} rows={repl ? 10 : 8} onFocus={e => e.currentTarget.select()}
                          className="w-full text-xs text-gray-100 bg-gray-950/60 border border-gray-700/60 rounded p-2 font-mono resize-y focus:outline-none focus:border-gray-500/60" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Run status bar — visible while an extension run is in progress */}
      {runMode && walkIdx >= 0 && walkQueue.length > 0 && (() => {
        const cur = queue.find((it: any) => it.id === walkQueue[walkIdx]);
        const st = cur ? rowState[cur.id] : undefined;
        const verb = runMode === 'checkdelist' ? 'Check & delist' : 'Check';
        const stLbl = st === 'deleting' ? 'deleting…' : st === 'checking' ? 'checking…' : st === 'gone' ? 'gone ✓' : st === 'live' ? 'still up' : st === 'error' ? 'error' : 'working…';
        return (
          <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700/50 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-200 font-semibold flex-shrink-0">
                {walkPaused ? 'Paused' : verb} · {walkIdx + 1} of {walkQueue.length}:
              </span>
              <span className="text-gray-100 truncate" title={cur ? itemTitleOf(cur) : ''}>{cur ? itemTitleOf(cur) : '(item gone from list)'}</span>
              <span className="text-gray-500 flex-shrink-0">· {stLbl}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setWalkPaused(p => !p)}
                className="px-2 py-1 rounded bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/40 text-gray-100 text-xs font-semibold"
              >
                {walkPaused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" onClick={advanceWalk} title="Skip this one, go to next" className="px-2 py-1 rounded bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/40 text-gray-100 text-xs font-semibold">
                Next →
              </button>
              <button type="button" onClick={cancelWalk} className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-100" title="Stop the run">
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* AUTO oversold section — sold on eBay + Depop → cancel the Depop order */}
      {oversoldVisible && (
        <div className="mb-3 rounded-lg border border-gray-700/50 bg-gray-900/40 p-3">
          <div className="text-xs font-bold text-gray-100 flex items-center gap-1.5 mb-2">
            <Ban className="h-4 w-4 text-red-400" />
            Oversold — cancel these {platform ? PLATFORM_LABEL[platform] : ''} orders ({oversoldAuto.length})
            <span className="font-normal text-gray-500">· sold on eBay too; auto-detected</span>
          </div>
          <ul className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {oversoldAuto.map(({ row, item, conf }) => {
              const repl = findReplacement(item, items);
              const msg = buildBuyerMessage(row.title || itemTitleOf(item), repl);
              const open = msgFor === row.id;
              const img = itemImage(item) || row.imageUrl;
              return (
                <li key={row.id} className="rounded-lg bg-gray-800/40 border border-gray-700/40 px-3 py-2">
                  <div className="flex items-center gap-3">
                    {img ? <img src={img} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" loading="lazy" />
                      : <div className="h-10 w-10 rounded bg-gray-800 flex items-center justify-center flex-shrink-0"><Package className="h-4 w-4 text-gray-600" /></div>}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-100 truncate" title={row.title}>{row.title || '(no title)'}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 font-bold">NEEDS CANCEL ON {(platform ? PLATFORM_LABEL[platform] : 'PLATFORM').toUpperCase()}</span>
                        <span>matched eBay: <span className="text-gray-300">{itemTitleOf(item).slice(0, 40)}</span> ({Math.round(conf * 100)}%)</span>
                        <span className="text-gray-500">· {repl ? (repl.reason === 'same-player-diff-color' ? 'replacement: same player, diff color' : 'replacement: same team & color') : 'no replacement — refund msg'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button type="button" onClick={() => { setMsgFor(open ? null : row.id); setCopied(false); }}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 text-gray-100 text-xs">
                        <Copy className="h-3 w-3" />{open ? 'Hide msg' : 'Buyer msg'}
                      </button>
                      <button type="button" disabled={flipBusy.has(row.id)}
                        onClick={() => handleUndoNeedsCancel({ id: row.id }, [row])}
                        title="Undo — put this Depop sale back to pending"
                        className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-100 disabled:opacity-50">
                        {flipBusy.has(row.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  {open && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500">Paste into the Depop chat, then cancel/refund the order in Depop.</span>
                        <button type="button" onClick={() => copyMessage(msg)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 text-gray-100 text-xs font-semibold">
                          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy message'}
                        </button>
                      </div>
                      <textarea readOnly value={msg} rows={repl ? 10 : 8} onFocus={e => e.currentTarget.select()}
                        className="w-full text-xs text-gray-100 bg-gray-950/60 border border-gray-700/60 rounded p-2 font-mono resize-y focus:outline-none focus:border-gray-500/60" />
                      {repl && (
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                          {itemImage(repl.item) && <img src={itemImage(repl.item)} alt="" className="h-6 w-6 rounded object-cover" />}
                          <span className="truncate">Replacement: <span className="text-gray-200">{itemTitleOf(repl.item)}</span></span>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Orphan listings — imported with no eBay match. SKU = listingId (the
          cross-platform identifier we already carry). One-click delist via the
          extension; click Mark handled to clear without delisting. */}
      {orphans.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-700/40 bg-amber-950/20 p-3">
          <div className="text-xs font-bold text-amber-200 flex items-center gap-1.5 mb-2">
            <Package className="h-4 w-4 text-amber-400" />
            Orphan {platform === 'depop' ? 'Depop' : 'Poshmark'} listings — no eBay match ({orphans.length})
            <span className="font-normal text-amber-300/60">· import had no inventory anchor → safe to delist</span>
          </div>
          <ul className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {orphans.map((o) => {
              const busy = orphanBusy[o.docId];
              return (
                <li key={o.docId} className="flex items-center gap-3 bg-amber-900/15 border border-amber-700/30 rounded-lg px-3 py-2">
                  {o.imageUrl && (
                    <img src={o.imageUrl} alt="" className="h-9 w-9 rounded object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-amber-100 truncate" title={o.title}>{o.title || '(no title)'}</div>
                    <div className="text-[10px] text-amber-300/70 mt-0.5 truncate">
                      SKU <span className="font-mono">{o.sku}</span>
                      {o.url && (<>
                        {' · '}
                        <a href={o.url} target="_blank" rel="noreferrer" className="hover:text-amber-100 underline-offset-2 hover:underline">open listing</a>
                      </>)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOrphanDelist(o)}
                    disabled={!!busy}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 text-red-200 text-[11px] font-semibold disabled:opacity-50"
                    title={`Delist this ${platform === 'depop' ? 'Depop' : 'Poshmark'} listing via the extension`}
                  >
                    {busy
                      ? <><Loader2 className="h-3 w-3 animate-spin" />{busy}</>
                      : <><XIcon className="h-3 w-3" />Delist</>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {queue.map((it: any) => {
          const img = itemImage(it);
          const hasPosh = !!it.poshmarkListingId;
          const hasDepop = !!it.depopListingId;
          const hasFb = !!it.facebookListingId;
          const hasWn = !!it.whatnotListingId;
          const depopUrl = it.depopUrl || (hasDepop ? depopListingUrl(String(it.depopListingId)) : '');
          const fbUrl = it.facebookUrl || (hasFb ? `https://www.facebook.com/marketplace/item/${it.facebookListingId}/` : '');
          const wnUrl = it.whatnotUrl || (hasWn ? `https://www.whatnot.com/listing/${it.whatnotListingId}` : '');
          const poshKey = `${it.id}:poshmark`;
          const fbKey = `${it.id}:facebook`;
          const wnKey = `${it.id}:whatnot`;
          const handledKey = `${it.id}:handled`;
          const checkable = platform === 'poshmark' ? !!it.poshmarkListingId
            : platform === 'facebook' ? !!it.facebookListingId
            : platform === 'whatnot' ? !!it.whatnotListingId
            : !!it.depopListingId;
          const isCurrent = !!runMode && walkIdx >= 0 && walkQueue[walkIdx] === it.id;
          const rs = rowState[it.id];
          return (
            <li key={it.id} className={`flex items-center gap-3 bg-gray-800/40 hover:bg-gray-800/70 border border-gray-700/40 rounded-lg px-3 py-2 transition-colors ${isCurrent ? 'ring-2 ring-gray-500/60' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(it.id)}
                disabled={!checkable || !!runMode}
                onChange={() => toggleSelect(it.id)}
                title={checkable ? 'Include in the next Check / Check & delist run' : `Only ${platform === 'poshmark' ? 'Poshmark' : platform === 'facebook' ? 'Facebook' : platform === 'whatnot' ? 'Whatnot' : 'Depop'}-bound rows can be checked`}
                className="flex-shrink-0 h-4 w-4 accent-gray-400 disabled:opacity-30"
              />
              {img ? (
                <img src={img} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" loading="lazy" />
              ) : (
                <div className="h-10 w-10 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <Package className="h-4 w-4 text-gray-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-100 truncate" title={itemTitleOf(it)}>{itemTitleOf(it)}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>eBay: {it.status === 'SOLD' ? 'SOLD' : it.ebayDelisted ? 'ended' : it.ebayQuantity === 0 ? 'qty 0' : '?'}</span>
                  {rs === 'checking' && <span className="px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-200 font-semibold inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />checking…</span>}
                  {rs === 'deleting' && <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 font-semibold inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />deleting…</span>}
                  {rs === 'live' && <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 font-bold">still on {platform ? PLATFORM_LABEL[platform] : 'platform'} — delist it</span>}
                  {rs === 'gone' && <span className="px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 font-bold">gone ✓ removing…</span>}
                  {rs === 'error' && (
                    <span
                      className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 font-bold max-w-[60ch] truncate inline-block align-middle"
                      title={rowError[it.id] || 'failed'}
                    >
                      failed{rowError[it.id] ? `: ${rowError[it.id]}` : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {hasPosh && (
                  <PlatformLogo
                    platform="poshmark"
                    busy={!!busy[poshKey]}
                    onClick={runMode ? undefined : () => handleDelist(it, 'poshmark')}
                    title={busy[poshKey] ? 'Delisting from Poshmark…' : 'Delist from Poshmark'}
                  />
                )}
                {hasFb && (
                  <PlatformLogo
                    platform="facebook"
                    busy={!!busy[fbKey] || (platform === 'facebook' && (rs === 'checking' || rs === 'deleting'))}
                    onClick={runMode || platform === 'facebook' ? undefined : () => handleDelist(it, 'facebook')}
                    href={platform === 'facebook' ? (fbUrl || undefined) : undefined}
                    title={platform === 'facebook'
                      ? 'On Facebook — open listing (use Check / Check & delist above to remove)'
                      : (busy[fbKey] ? 'Delisting from Facebook…' : 'Delist from Facebook')}
                  />
                )}
                {hasDepop && (
                  <PlatformLogo
                    platform="depop"
                    busy={rs === 'checking' || rs === 'deleting'}
                    href={depopUrl || undefined}
                    title="On Depop — open listing (use Check / Check & delist above to remove)"
                  />
                )}
                {hasWn && (
                  <PlatformLogo
                    platform="whatnot"
                    busy={!!busy[wnKey] || (platform === 'whatnot' && (rs === 'checking' || rs === 'deleting'))}
                    onClick={runMode || platform === 'whatnot' ? undefined : () => handleDelist(it, 'whatnot')}
                    href={platform === 'whatnot' ? (wnUrl || undefined) : undefined}
                    title={platform === 'whatnot'
                      ? 'On Whatnot — open listing (use Check / Check & delist above to remove)'
                      : (busy[wnKey] ? 'Delisting from Whatnot…' : 'Delist from Whatnot')}
                  />
                )}
                <button
                  type="button"
                  disabled={!!busy[handledKey] || !!runMode}
                  onClick={() => handleMarkHandled(it)}
                  title="Mark handled — already delisted manually; clears the platform binding and removes it from this list"
                  className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-800 text-gray-400 hover:text-emerald-300 text-xs disabled:opacity-50"
                >
                  {busy[handledKey] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Handled
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
