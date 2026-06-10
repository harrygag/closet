import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/client';
import { useAuthStore } from '../../store/useAuthStore';
import { ShoppingBag, DollarSign, Clock, RefreshCw, Package, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { SaleSnapshotEntry, SaleSnapshotPlatform } from '../../types/saleSnapshot';
import { syncRecentSoldItems } from '../../services/inventory/syncSoldItems';
import { deleteNonBaselineRows } from '../../services/inventory/saleSnapshot';

interface LastSoldWidgetProps {
  platform: SaleSnapshotPlatform;
  /** @deprecated kept for backwards compat — widget now scrolls all entries. */
  count?: number;
}

const PLATFORM_LABEL: Record<SaleSnapshotPlatform, string> = {
  ebay: 'eBay',
  poshmark: 'Poshmark',
  depop: 'Depop',
  facebook: 'Facebook',
  whatnot: 'Whatnot',
};

const PLATFORM_COLOR: Record<SaleSnapshotPlatform, string> = {
  ebay: 'text-blue-400',
  poshmark: 'text-purple-400',
  depop: 'text-red-400',
  facebook: 'text-sky-400',
  whatnot: 'text-yellow-400',
};

const STATUS_TINT: Record<string, string> = {
  baseline: 'bg-gray-800 text-gray-400',
  pending: 'bg-amber-900/50 text-amber-300',
  reconciled: 'bg-emerald-900/40 text-emerald-300',
};

/**
 * Map a raw Poshmark order_status string into one of 4 display buckets +
 * Tailwind pill colors. Additive display only — has NOTHING to do with the
 * SaleSnapshot `status` (baseline/pending/needs_cancel) field, which the
 * reconcile workflow owns and which is rendered separately.
 */
function poshOrderBucket(raw?: string): { label: string; cls: string } | null {
  if (!raw) return { label: 'Sold', cls: 'bg-gray-700 text-gray-300' };
  const s = raw.trim();
  if (/cancel|refund|return|case/i.test(s)) return { label: 'Cancelled', cls: 'bg-red-900/50 text-red-300' };
  if (/complete|delivered|resolved/i.test(s)) return { label: 'Complete', cls: 'bg-emerald-900/50 text-emerald-300' };
  // "needs shipping" → still Sold (not yet in transit); everything else
  // shipping/transit related → In Transit.
  if (/needs?\s*shipping/i.test(s)) return { label: 'Sold', cls: 'bg-gray-700 text-gray-300' };
  if (/transit|shipped|ship/i.test(s)) return { label: 'In Transit', cls: 'bg-blue-900/50 text-blue-300' };
  return { label: 'Sold', cls: 'bg-gray-700 text-gray-300' };
}

/**
 * Map a raw Depop order_status string into one of 4 display buckets +
 * Tailwind pill colors. Mirrors poshOrderBucket — additive display only,
 * unrelated to the SaleSnapshot reconcile `status` field.
 */
function depopOrderBucket(raw?: string): { label: string; cls: string } | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/refund|cancel|dispute|return/.test(s)) return { label: 'Cancelled', cls: 'bg-red-900/50 text-red-300' };
  if (/complete|received|delivered|shipped/.test(s)) return { label: 'Complete', cls: 'bg-emerald-900/50 text-emerald-300' };
  // "in transit" / "in_transit" / "paid" (paid but not shipped is in-flight)
  if (/in[\s_-]?transit|paid/.test(s)) return { label: 'In Transit', cls: 'bg-blue-900/50 text-blue-300' };
  if (/sold|pending/.test(s)) return { label: 'Sold', cls: 'bg-gray-700 text-gray-300' };
  return null;
}

function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffMs = Date.now() - t;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const LastSoldWidget = ({ platform }: LastSoldWidgetProps) => {
  const { user } = useAuthStore();
  const [entries, setEntries] = useState<SaleSnapshotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    // Query only by userId — filter + sort client-side. SaleSnapshot is bounded
    // (baseline + pending + reconciled per platform) so pulling all per-user docs
    // is cheap and avoids a composite index.
    const q = query(
      collection(db, 'SaleSnapshot'),
      where('userId', '==', user.id),
    );
    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as SaleSnapshotEntry))
        .filter(r => r.platform === platform)
        .sort((a, b) => {
          // Poshmark: order by scrape_index (0 = top = newest, matches the real
          // Poshmark page) when BOTH rows have a finite scrapeIndex. The
          // ObjectId-derived soldAt is unreliable for Poshmark, so prefer
          // scrape position. Other platforms (and Poshmark rows missing
          // scrapeIndex) keep the existing soldAt/firstSeenAt-desc behavior.
          if (
            platform === 'poshmark' &&
            typeof a.scrapeIndex === 'number' && Number.isFinite(a.scrapeIndex) &&
            typeof b.scrapeIndex === 'number' && Number.isFinite(b.scrapeIndex)
          ) {
            if (a.scrapeIndex !== b.scrapeIndex) return a.scrapeIndex - b.scrapeIndex;
            return b.id.localeCompare(a.id);
          }
          // Sort by soldAt desc (newest first). Fall back to firstSeenAt when
          // soldAt is missing (CSV-imported baseline rows often lack soldAt) so
          // rows still land in a consistent, recent-first order rather than
          // arbitrary Firestore document-id order.
          const aKey = a.soldAt || a.firstSeenAt || '';
          const bKey = b.soldAt || b.firstSeenAt || '';
          const c = bKey.localeCompare(aKey);
          if (c !== 0) return c;
          // Tie-break on id for stable ordering.
          return b.id.localeCompare(a.id);
        });
      setEntries(rows);
      setLoading(false);
    }, err => {
      console.warn('[LastSoldWidget] subscription error', err);
      setLoading(false);
    });
    return () => unsub();
  }, [user, platform]);

  // Running totals — useful for tracking stock attribution at a glance.
  const totals = useMemo(() => {
    let revenue = 0;
    let pending = 0;
    let baseline = 0;
    let reconciled = 0;
    for (const e of entries) {
      if (typeof e.salePrice === 'number') revenue += e.salePrice;
      if (e.status === 'pending') pending++;
      else if (e.status === 'baseline') baseline++;
      else if (e.status === 'reconciled') reconciled++;
    }
    return { revenue, pending, baseline, reconciled };
  }, [entries]);

  // Refresh: opens the platform's sold-items page so the extension scrapes fresh
  // data, then waits for the extension to signal scrapeComplete=true on the
  // marketplaceData doc (event-driven, not a fixed timer) before calling
  // syncRecentSoldItems. The extension writes scrapeComplete + syncedAt on its
  // final SCRAPE_COMPLETE flush — once we see that flag advance past clickTime,
  // we know the doc holds the full sold-items list. 120s max fallback in case
  // the scrape never signals (page didn't lazy-load, user blocked the tab, etc.).
  const handleRefresh = async () => {
    if (!user || refreshing || platform === 'ebay' || platform === 'facebook') return;
    setRefreshing(true);
    const clickTime = Date.now();
    try {
      // Doc IDs the extension may write to. Order mirrors the resolver chain in
      // syncRecentSoldItems — sold-specific docs first.
      const candidateDocIds = platform === 'poshmark'
        ? ['poshmark_sold_retrothriftc0', 'poshmark_sold_retrothriftco']
        : ['depop_sold_dallassports', 'depop_sold_265732668'];

      // Clear the stale scrape buffer BEFORE re-scraping. resolveDepopSyncData /
      // resolvePoshmarkSyncData return the FIRST candidate doc that has listings,
      // so a previous run's listings lingering here make syncRecentSoldItems read
      // OLD data — every saleKey already exists → "no new sales", even right after
      // you made a sale. DepopSoldModal already wipes the doc before capture for
      // this exact reason. Displayed rows come from SaleSnapshot (not these docs),
      // so clearing the transient scrape buffer is safe.
      await Promise.all(
        candidateDocIds.map((id) => deleteDoc(doc(db, 'marketplaceData', id)).catch(() => {})),
      );

      if (platform === 'depop') {
        window.open('https://www.depop.com/sellinghub/sold-items/#autoScroll', '_blank');
      } else if (platform === 'poshmark') {
        window.open('https://poshmark.com/order/sales/#autoScroll', '_blank');
      }
      setTimeout(() => window.focus(), 500);
      await new Promise<void>((resolve) => {
        let done = false;
        const unsubs: Array<() => void> = [];
        const finish = (reason: string) => {
          if (done) return;
          done = true;
          for (const u of unsubs) u();
          clearTimeout(maxTimer);
          console.log(`[LastSoldWidget] ⏱️ wait complete (${reason})`);
        };
        const maxTimer = setTimeout(() => {
          console.warn('[LastSoldWidget] ⚠️ 120s fallback — proceeding without scrapeComplete signal');
          finish('120s-fallback');
          resolve();
        }, 120000);
        for (const docId of candidateDocIds) {
          const ref = doc(db, 'marketplaceData', docId);
          const unsub = onSnapshot(ref, (snap) => {
            if (done || !snap.exists()) return;
            const data = snap.data() as any;
            const ts = data.syncedAt;
            const syncedAtMs = ts?.toDate?.()?.getTime?.()
              ?? (typeof ts === 'string' ? new Date(ts).getTime() : 0);
            if (data.scrapeComplete === true && syncedAtMs >= clickTime) {
              console.log(`[LastSoldWidget] ✅ scrapeComplete on ${docId} @ ${new Date(syncedAtMs).toISOString()}`);
              finish(`scrapeComplete:${docId}`);
              resolve();
            }
          }, (err) => {
            console.warn(`[LastSoldWidget] snapshot error on ${docId}:`, err);
          });
          unsubs.push(unsub);
        }
      });
      // Tiny grace period so the syncWebhook CF write commits before we read.
      await new Promise(r => setTimeout(r, 1500));
      const result = await syncRecentSoldItems(user.id, platform);
      if (result.inserted > 0) {
        toast.success(
          `+${result.inserted} new ${PLATFORM_LABEL[platform]} sale${result.inserted === 1 ? '' : 's'} · ${result.skipped} already in baseline`,
        );
      } else if (result.skipped > 0) {
        toast.info(`No new ${PLATFORM_LABEL[platform]} sales (${result.skipped} already in baseline)`);
      } else {
        toast.info(`No ${PLATFORM_LABEL[platform]} sold items found in marketplaceData`);
      }
    } catch (err) {
      console.error('[LastSoldWidget] refresh failed:', err);
      toast.error('Refresh failed — check console');
    } finally {
      setRefreshing(false);
    }
  };

  // Revert: delete every non-baseline row for this platform. Baseline rows stay
  // because they have status='baseline' and the helper explicitly filters them
  // out. Used when refresh produced duplicates that need to be rolled back.
  const [reverting, setReverting] = useState(false);
  const handleRevert = async () => {
    if (!user || reverting) return;
    const nonBaselineCount = totals.pending + totals.reconciled;
    if (nonBaselineCount === 0) {
      toast.info(`No pending/reconciled ${PLATFORM_LABEL[platform]} rows to revert.`);
      return;
    }
    const ok = window.confirm(
      `Revert ${PLATFORM_LABEL[platform]} back to baseline?\n\n` +
      `  ✓ KEEP: ${totals.baseline} baseline rows (your original baseline — untouched)\n` +
      `  ✗ DELETE: ${totals.pending} pending + ${totals.reconciled} reconciled rows (the duplicates Refresh created)\n\n` +
      `After: only the ${totals.baseline} baseline rows remain. Irreversible.`,
    );
    if (!ok) return;
    setReverting(true);
    try {
      const deleted = await deleteNonBaselineRows(user.id, platform);
      toast.success(`Reverted ${deleted} ${PLATFORM_LABEL[platform]} row${deleted === 1 ? '' : 's'} → baseline restored`);
    } catch (err: any) {
      console.error('[LastSoldWidget] revert failed:', err);
      toast.error(`Revert failed: ${err?.message || 'unknown'}`);
    } finally {
      setReverting(false);
    }
  };

  return (
    <div className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className={`h-4 w-4 ${PLATFORM_COLOR[platform]}`} />
          <h3 className="text-sm font-semibold text-gray-100">
            {PLATFORM_LABEL[platform]} Sales
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <span className="text-[10px] text-gray-500">{entries.length} total</span>
          )}
          {/* Revert — delete all non-baseline rows for this platform. Shown when
              there's at least 1 pending or reconciled row to clean up. */}
          {(totals.pending > 0 || totals.reconciled > 0) && (
            <button
              type="button"
              onClick={handleRevert}
              disabled={reverting}
              title={`Revert all pending/reconciled ${PLATFORM_LABEL[platform]} rows back to baseline-only`}
              className="p-1 rounded hover:bg-gray-800 text-amber-400 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${reverting ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || platform === 'ebay' || platform === 'facebook'}
            title={
              platform === 'ebay'
                ? 'eBay sales come from the eBay API sync'
                : platform === 'facebook'
                  ? 'Facebook sold scrape not built yet'
                  : `Open ${PLATFORM_LABEL[platform]} sold-items so the extension re-scrapes`
            }
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Totals strip — gives quick stock-attribution context at a glance */}
      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3 text-[10px]">
          <div className="bg-gray-800/40 rounded px-2 py-1">
            <div className="text-gray-500 uppercase tracking-wider">Revenue</div>
            <div className="text-green-400 font-semibold text-xs">${totals.revenue.toFixed(2)}</div>
          </div>
          <div className="bg-gray-800/40 rounded px-2 py-1">
            <div className="text-gray-500 uppercase tracking-wider">Baseline</div>
            <div className="text-gray-300 font-semibold text-xs">{totals.baseline}</div>
          </div>
          <div className="bg-gray-800/40 rounded px-2 py-1">
            <div className="text-gray-500 uppercase tracking-wider">Pending</div>
            <div className="text-amber-300 font-semibold text-xs">{totals.pending}</div>
          </div>
          <div className="bg-gray-800/40 rounded px-2 py-1">
            <div className="text-gray-500 uppercase tracking-wider">Reconciled</div>
            <div className="text-emerald-300 font-semibold text-xs">{totals.reconciled}</div>
          </div>
        </div>
      )}

      {loading && <div className="text-xs text-gray-500 py-3">Loading…</div>}
      {!loading && entries.length === 0 && (
        <div className="text-xs text-gray-500 py-3">No sales captured yet.</div>
      )}

      {/* Scrollable list — every sale, in place */}
      {!loading && entries.length > 0 && (
        <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {entries.map(e => (
            <li
              key={e.id}
              className="flex items-start gap-2 text-xs bg-gray-900/40 hover:bg-gray-900/70 rounded px-2 py-1.5 transition-colors"
            >
              {e.imageUrl ? (
                <img
                  src={e.imageUrl}
                  alt=""
                  className="h-10 w-10 rounded object-cover flex-shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="h-10 w-10 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <Package className="h-4 w-4 text-gray-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-gray-100 break-words" title={e.title || ''}>
                  {e.title || '(no title)'}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-gray-500">
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  <span>{formatRelative(e.soldAt)}</span>
                  <span className={`px-1 rounded text-[9px] uppercase tracking-wider ${STATUS_TINT[e.status] || 'bg-gray-800 text-gray-400'}`}>
                    {e.status}
                  </span>
                  {((platform === 'poshmark' && e.poshOrderStatus) || (platform === 'depop' && e.depopOrderStatus)) && (() => {
                    const raw = platform === 'poshmark' ? e.poshOrderStatus : e.depopOrderStatus;
                    const b = platform === 'poshmark' ? poshOrderBucket(raw) : depopOrderBucket(raw);
                    return b ? (
                      <span
                        title={raw}
                        className={`px-1 rounded text-[9px] uppercase tracking-wider ${b.cls}`}
                      >
                        {b.label}
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
              {typeof e.salePrice === 'number' && (
                <div className="flex items-center gap-0.5 text-green-400 font-semibold flex-shrink-0 self-center">
                  <DollarSign className="h-3 w-3" />
                  <span>{e.salePrice.toFixed(2)}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
