import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/client';
import { useAuthStore } from '../../store/useAuthStore';
import { AlertCircle, CheckCircle, Clock, DollarSign, ArrowRightLeft } from 'lucide-react';
import type { SaleSnapshotEntry, SaleSnapshotPlatform } from '../../types/saleSnapshot';
import { SaleReconcileModal } from './SaleReconcileModal';

interface NewSalesSinceBaselineWidgetProps {
  platform: SaleSnapshotPlatform;
  count?: number;
}

const PLATFORM_LABEL: Record<SaleSnapshotPlatform, string> = {
  ebay: 'eBay',
  poshmark: 'Poshmark',
  depop: 'Depop',
  facebook: 'Facebook',
  whatnot: 'Whatnot',
};

/**
 * Map a raw Poshmark order_status string into one of 4 display buckets +
 * Tailwind pill colors. Additive display only — independent of the
 * SaleSnapshot `status` (baseline/pending/needs_cancel) reconcile field.
 */
function poshOrderBucket(raw?: string): { label: string; cls: string } | null {
  if (!raw) return { label: 'Sold', cls: 'bg-gray-700 text-gray-300' };
  const s = raw.trim();
  if (/cancel|refund|return|case/i.test(s)) return { label: 'Cancelled', cls: 'bg-red-900/50 text-red-300' };
  if (/complete|delivered|resolved/i.test(s)) return { label: 'Complete', cls: 'bg-emerald-900/50 text-emerald-300' };
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
  if (/in[\s_-]?transit|paid/.test(s)) return { label: 'In Transit', cls: 'bg-blue-900/50 text-blue-300' };
  if (/sold|pending/.test(s)) return { label: 'Sold', cls: 'bg-gray-700 text-gray-300' };
  return null;
}

function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const NewSalesSinceBaselineWidget = ({ platform, count = 8 }: NewSalesSinceBaselineWidgetProps) => {
  const { user } = useAuthStore();
  const [pending, setPending] = useState<SaleSnapshotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconcileOpen, setReconcileOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    // Query userId only to avoid composite-index requirement; filter platform + status client-side.
    const q = query(collection(db, 'SaleSnapshot'), where('userId', '==', user.id));
    const unsub = onSnapshot(
      q,
      snap => {
        const rows = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as SaleSnapshotEntry))
          .filter(r => r.platform === platform && r.status === 'pending')
          .sort((a, b) => {
            // Poshmark: order by scrape_index (0 = top = newest, matches the
            // real Poshmark page) when BOTH rows have a finite scrapeIndex —
            // the ObjectId-derived soldAt is unreliable for Poshmark. Other
            // platforms (and Poshmark rows missing scrapeIndex) keep the
            // existing soldAt-desc behavior.
            if (
              platform === 'poshmark' &&
              typeof a.scrapeIndex === 'number' && Number.isFinite(a.scrapeIndex) &&
              typeof b.scrapeIndex === 'number' && Number.isFinite(b.scrapeIndex)
            ) {
              if (a.scrapeIndex !== b.scrapeIndex) return a.scrapeIndex - b.scrapeIndex;
            }
            return (b.soldAt || '').localeCompare(a.soldAt || '');
          });
        setPending(rows);
        setLoading(false);
      },
      err => {
        console.warn('[NewSalesSinceBaselineWidget] subscription error', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user, platform]);

  const visible = pending.slice(0, count);
  const total = pending.length;

  return (
    <div className={`rounded-xl p-4 border ${total > 0 ? 'bg-amber-900/20 border-amber-500/40' : 'bg-emerald-900/15 border-emerald-500/30'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {total > 0 ? (
            <AlertCircle className="h-4 w-4 text-amber-400" />
          ) : (
            <CheckCircle className="h-4 w-4 text-emerald-400" />
          )}
          <h3 className={`text-sm font-semibold ${total > 0 ? 'text-amber-200' : 'text-emerald-200'}`}>
            {total > 0
              ? `${total} new ${PLATFORM_LABEL[platform]} sale${total === 1 ? '' : 's'} since calibration`
              : `No new ${PLATFORM_LABEL[platform]} sales since calibration`}
          </h3>
        </div>
        {total > 0 && (
          <span className="text-[10px] text-amber-300/70">needs stock decrement</span>
        )}
      </div>

      {/* Match & reconcile — match each pending sale to its eBay item, decrement eBay stock,
          and re-baseline the affected items so the new state becomes the baseline. */}
      {!loading && total > 0 && (platform === 'depop' || platform === 'poshmark') && (
        <button
          type="button"
          onClick={() => setReconcileOpen(true)}
          className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600/25 hover:bg-amber-600/40 border border-amber-500/50 text-amber-50 text-xs font-semibold"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Match &amp; reconcile {total} sale{total === 1 ? '' : 's'} → update eBay stock + re-baseline
        </button>
      )}

      {loading && <div className="text-xs text-gray-500 py-2">Loading…</div>}

      {!loading && total === 0 && (
        <div className="text-xs text-emerald-300/70 py-1">
          Imports are aligned with the baseline. Any future {PLATFORM_LABEL[platform]} sale that lands here is the signal to decrement eBay stock.
        </div>
      )}

      {!loading && total > 0 && (
        <ul className="space-y-2">
          {visible.map(e => (
            <li key={e.id} className="flex items-start justify-between gap-2 text-xs">
              <div className="flex-1 min-w-0">
                <div className="text-gray-100 truncate">{e.title || '(no title)'}</div>
                <div className="flex items-center gap-2 mt-0.5 text-amber-300/70">
                  <Clock className="h-3 w-3" />
                  <span>{formatRelative(e.soldAt)}</span>
                  <span className="px-1 rounded bg-amber-900/40 text-[9px] uppercase tracking-wider text-amber-200">pending</span>
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
                <div className="flex items-center gap-0.5 text-amber-200 font-semibold flex-shrink-0">
                  <DollarSign className="h-3 w-3" />
                  <span>{e.salePrice.toFixed(2)}</span>
                </div>
              )}
            </li>
          ))}
          {total > visible.length && (
            <li className="text-[11px] text-amber-300/60 pt-1">+ {total - visible.length} more pending…</li>
          )}
        </ul>
      )}

      {(platform === 'depop' || platform === 'poshmark') && (
        <SaleReconcileModal
          open={reconcileOpen}
          platform={platform}
          onClose={() => setReconcileOpen(false)}
        />
      )}
    </div>
  );
};
