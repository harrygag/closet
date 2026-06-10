/**
 * ToolsPage (/tools) — the stock-tracking hub. Consolidates the widgets that
 * used to live only on the per-platform integration pages, plus a top-level
 * reconciliation summary so you can see at a glance whether the app is matched
 * to real physical stock.
 *
 * Layout:
 *  - Stock-health banner: reconcileStock(items) bucket counts + a detail list
 *    of the actionable issues (oversold / delist-now / qty-mismatch), with a
 *    CSV Stock Check (self-contained modal) and a link to the full Sync Stock
 *    run (which lives on the Inventory page, where its heavy reconcile/calibrate
 *    handlers are wired).
 *  - Platform tabs (All / Poshmark / Depop): mount the existing, unchanged
 *    DelistQueueWidget / ShouldListWidget / NewSalesSinceBaselineWidget /
 *    LastSoldWidget for the selected platform.
 *
 * All stock math flows through the shared reconcileStock() / stockOnHand()
 * helpers — this page introduces no parallel logic.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Upload, ArrowRight, AlertTriangle, PackageX, Scale, Sparkles } from 'lucide-react';
import { useItemStore } from '../store/useItemStore';
import { reconcileStock } from '../services/inventory/reconciliation';
import { DelistQueueWidget } from '../components/inventory/DelistQueueWidget';
import { ShouldListWidget } from '../components/inventory/ShouldListWidget';
import { NewSalesSinceBaselineWidget } from '../components/inventory/NewSalesSinceBaselineWidget';
import { LastSoldWidget } from '../components/inventory/LastSoldWidget';
import { EbayDelistWidget } from '../components/inventory/EbayDelistWidget';
import { StockCheckModal } from '../components/StockCheckModal';
import poshmarkLogo from '../assets/logos/poshmark.svg';
import depopLogo from '../assets/logos/depop.svg';
import ebayLogo from '../assets/logos/ebay.svg';

type View = 'all' | 'poshmark' | 'depop' | 'ebay';

export function ToolsPage() {
  const navigate = useNavigate();
  const { items } = useItemStore();
  const [view, setView] = useState<View>('all');
  const [showStockCheck, setShowStockCheck] = useState(false);

  const recon = useMemo(() => reconcileStock(items as any[]), [items]);
  const s = recon.summary;

  // The actionable issues, most urgent first.
  const issues = useMemo(
    () => [...recon.oversold, ...recon.delistNow, ...recon.qtyMismatch],
    [recon]
  );

  const tiles: Array<{ key: View; label: string; logo?: string }> = [
    { key: 'all', label: 'All' },
    { key: 'ebay', label: 'eBay', logo: ebayLogo },
    { key: 'poshmark', label: 'Poshmark', logo: poshmarkLogo },
    { key: 'depop', label: 'Depop', logo: depopLogo },
  ];

  const STAT_CARDS = [
    { label: 'Oversold', value: s.oversoldCount, icon: AlertTriangle, tone: 'text-red-300 border-red-700/40' },
    { label: 'Delist now', value: s.delistCount, icon: PackageX, tone: 'text-amber-300 border-amber-700/40' },
    { label: 'Qty mismatch', value: s.mismatchCount, icon: Scale, tone: 'text-blue-300 border-blue-700/40' },
    { label: 'Should list', value: s.shouldListCount, icon: Sparkles, tone: 'text-emerald-300 border-emerald-700/40' },
  ];

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gray-800 rounded-lg border border-gray-700">
              <Wrench className="h-6 w-6 text-gray-200" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Tools</h1>
              <p className="text-gray-400 mt-1 text-sm">
                Stock health, delist queue, and what to list — kept in sync with your real physical stock.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowStockCheck(true)}
              className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg bg-black border border-gray-700 text-gray-100 hover:bg-gray-800">
              <Upload className="h-4 w-4" /> Stock Check (CSV)
            </button>
            <button type="button" onClick={() => navigate('/closet')}
              className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-gray-100 hover:bg-gray-800">
              Run full Sync Stock <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stock-health summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {STAT_CARDS.map((c) => (
            <div key={c.label} className={`bg-gray-900 border rounded-xl px-4 py-3 ${c.tone}`}>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide opacity-80">
                <c.icon className="h-3.5 w-3.5" /> {c.label}
              </div>
              <div className="text-2xl font-bold text-white mt-1">{c.value}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500 mb-6">
          {s.allGoodCount} of {s.total} items fully reconciled · {s.issues} need attention
        </div>

        {/* Issue detail list */}
        {issues.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
            <h3 className="text-sm font-bold text-gray-200 mb-3">Needs attention ({issues.length})</h3>
            <ul className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
              {issues.map((it) => (
                <li key={it.item.id} className="flex items-center gap-3 bg-gray-800/40 border border-gray-700/40 rounded-lg px-3 py-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border flex-shrink-0 ${
                    it.severity === 'OVERSOLD' ? 'text-red-300 border-red-700/50'
                    : it.severity === 'DELIST_NOW' ? 'text-amber-300 border-amber-700/50'
                    : 'text-blue-300 border-blue-700/50'
                  }`}>
                    {it.severity.replace('_', ' ')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-100 truncate">{it.message}</div>
                    <div className="text-[11px] text-gray-500 truncate">{it.suggestedAction}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Platform tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {tiles.map((t) => {
            const isActive = view === t.key;
            return (
              <button key={t.key} type="button" onClick={() => setView(t.key)} aria-pressed={isActive}
                className={`relative h-20 rounded-2xl flex items-center justify-center px-6 transition-all duration-150 border-2 ${
                  isActive ? 'bg-gray-800 border-blue-500/60 shadow-lg' : 'bg-gray-900 border-gray-800 hover:border-gray-600 hover:bg-gray-800/60'
                }`}>
                {t.logo ? (
                  <img src={t.logo} alt={t.label} draggable={false} className="pointer-events-none select-none"
                    style={{ maxHeight: 32, maxWidth: '70%', opacity: isActive ? 1 : 0.8 }} />
                ) : (
                  <span className={`text-base font-bold ${isActive ? 'text-white' : 'text-gray-300'}`}>All platforms</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Widgets per view */}
        {view === 'all' ? (
          <div className="space-y-4">
            <EbayDelistWidget />
            <DelistQueueWidget />
            <ShouldListWidget platform="poshmark" />
            <ShouldListWidget platform="depop" />
          </div>
        ) : view === 'ebay' ? (
          <div className="space-y-4">
            <EbayDelistWidget />
          </div>
        ) : (
          <div className="space-y-4">
            <NewSalesSinceBaselineWidget platform={view} count={8} />
            <DelistQueueWidget platform={view} />
            <ShouldListWidget platform={view} />
            <LastSoldWidget platform={view} count={5} />
          </div>
        )}
      </div>

      <StockCheckModal open={showStockCheck} onClose={() => setShowStockCheck(false)} />
    </div>
  );
}

export default ToolsPage;
