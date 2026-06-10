/**
 * UnifiedSalesPage — single /sales surface combining:
 *   - The unified chronological sales feed (default "All sales" view; every
 *     platform in one ordered list with platform-marked badges per row).
 *   - The three per-platform Sold workflows (EbaySoldModal / PoshmarkSoldModal
 *     / DepopSoldModal), reached via the same logo strip.
 *
 * Styled to match the rest of the app: standard dark palette (gray-950 page,
 * gray-900 cards, gray-800 borders). No blur, no custom tokens.
 *
 * Deep-link: /sales?platform=ebay | poshmark | depop  (no param = All sales).
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SalesPage } from './SalesPage';
import { EbaySoldModal } from '../components/ebay/EbaySoldModal';
import { PoshmarkSoldModal } from '../components/poshmark/PoshmarkSoldModal';
import { DepopSoldModal } from '../components/depop/DepopSoldModal';
import ebayLogo from '../assets/logos/ebay.svg';
import poshmarkLogo from '../assets/logos/poshmark.svg';
import depopLogo from '../assets/logos/depop.svg';

type Platform = 'ebay' | 'poshmark' | 'depop';
type View = 'all' | Platform;

const PLATFORM_META: Record<Platform, { label: string; logo: string }> = {
  ebay: { label: 'eBay', logo: ebayLogo },
  poshmark: { label: 'Poshmark', logo: poshmarkLogo },
  depop: { label: 'Depop', logo: depopLogo },
};

const PANEL_OVERRIDE_CSS = `
  [data-sold-panel="true"] [class*="backdrop-blur"] { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
  [data-sold-panel="true"] .bg-green-500, [data-sold-panel="true"] .bg-green-600, [data-sold-panel="true"] .bg-green-700,
  [data-sold-panel="true"] .bg-emerald-500, [data-sold-panel="true"] .bg-emerald-600,
  [data-sold-panel="true"] .bg-purple-500, [data-sold-panel="true"] .bg-purple-600, [data-sold-panel="true"] .bg-purple-700,
  [data-sold-panel="true"] .bg-blue-500, [data-sold-panel="true"] .bg-blue-600, [data-sold-panel="true"] .bg-blue-700,
  [data-sold-panel="true"] .bg-orange-500, [data-sold-panel="true"] .bg-orange-600, [data-sold-panel="true"] .bg-orange-700,
  [data-sold-panel="true"] .bg-yellow-600, [data-sold-panel="true"] .bg-yellow-700,
  [data-sold-panel="true"] .bg-amber-600, [data-sold-panel="true"] .bg-amber-700,
  [data-sold-panel="true"] .bg-red-600, [data-sold-panel="true"] .bg-red-700,
  [data-sold-panel="true"] .bg-rose-500, [data-sold-panel="true"] .bg-rose-600,
  [data-sold-panel="true"] .hover\\:bg-green-700:hover, [data-sold-panel="true"] .hover\\:bg-purple-700:hover,
  [data-sold-panel="true"] .hover\\:bg-blue-700:hover, [data-sold-panel="true"] .hover\\:bg-orange-700:hover,
  [data-sold-panel="true"] .hover\\:bg-yellow-700:hover, [data-sold-panel="true"] .hover\\:bg-red-700:hover {
    background-color: #1f2937 !important; color: #f3f4f6 !important;
  }
  [data-sold-panel="true"] .bg-green-900, [data-sold-panel="true"] .bg-blue-900,
  [data-sold-panel="true"] .bg-purple-900, [data-sold-panel="true"] .bg-red-900 { background-color: #111827 !important; }
  [data-sold-panel="true"] .text-green-200, [data-sold-panel="true"] .text-green-300, [data-sold-panel="true"] .text-green-400,
  [data-sold-panel="true"] .text-emerald-300, [data-sold-panel="true"] .text-emerald-400,
  [data-sold-panel="true"] .text-purple-300, [data-sold-panel="true"] .text-purple-400,
  [data-sold-panel="true"] .text-blue-100, [data-sold-panel="true"] .text-blue-200, [data-sold-panel="true"] .text-blue-300, [data-sold-panel="true"] .text-blue-400,
  [data-sold-panel="true"] .text-amber-300, [data-sold-panel="true"] .text-amber-400,
  [data-sold-panel="true"] .text-red-300, [data-sold-panel="true"] .text-red-400,
  [data-sold-panel="true"] .text-rose-300, [data-sold-panel="true"] .text-rose-400 { color: #e5e7eb !important; }
  [data-sold-panel="true"] [class*="border-green-"], [data-sold-panel="true"] [class*="border-emerald-"],
  [data-sold-panel="true"] [class*="border-purple-"], [data-sold-panel="true"] [class*="border-blue-"],
  [data-sold-panel="true"] [class*="border-orange-"], [data-sold-panel="true"] [class*="border-amber-"],
  [data-sold-panel="true"] [class*="border-yellow-"], [data-sold-panel="true"] [class*="border-red-"],
  [data-sold-panel="true"] [class*="border-rose-"] { border-color: #374151 !important; }
`;

export function UnifiedSalesPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const initial = useMemo<View>(() => {
    const p = (params.get('platform') || '').toLowerCase();
    if (p === 'ebay' || p === 'poshmark' || p === 'depop') return p;
    return 'all';
  }, [params]);

  const [view, setView] = useState<View>(initial);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (view === 'all') {
      if (next.has('platform')) { next.delete('platform'); setParams(next, { replace: true }); }
    } else if (next.get('platform') !== view) {
      next.set('platform', view);
      setParams(next, { replace: true });
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePanelClose() {
    setView('all');
    navigate('/sales', { replace: true });
  }

  const tiles: Array<{ key: View; label: string; logo?: string }> = [
    { key: 'all', label: 'All sales' },
    { key: 'ebay', label: 'eBay', logo: PLATFORM_META.ebay.logo },
    { key: 'poshmark', label: 'Poshmark', logo: PLATFORM_META.poshmark.logo },
    { key: 'depop', label: 'Depop', logo: PLATFORM_META.depop.logo },
  ];

  return (
    <div className="min-h-screen bg-gray-950">
      <style>{PANEL_OVERRIDE_CSS}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Sales</h1>
          <p className="text-gray-400 mt-1">
            All sales across eBay, Poshmark, Depop &amp; in-person in one ordered feed. Click a platform to open its sold-items workflow.
          </p>
        </div>

        {/* Tiles — All sales + 3 platforms, roomy + evenly spaced */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-8">
          {tiles.map((t) => {
            const isActive = view === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setView(t.key)}
                aria-pressed={isActive}
                aria-label={t.key === 'all' ? 'All sales' : `Sold on ${t.label}`}
                className={`relative h-32 rounded-2xl flex items-center justify-center px-6 transition-all duration-150 border-2 ${
                  isActive
                    ? 'bg-gray-800 border-blue-500/60 shadow-lg'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-600 hover:bg-gray-800/60'
                }`}
              >
                {t.logo ? (
                  <img
                    src={t.logo}
                    alt={t.label}
                    draggable={false}
                    className="pointer-events-none select-none"
                    style={{ maxHeight: 48, maxWidth: '80%', opacity: isActive ? 1 : 0.8, transition: 'opacity 150ms' }}
                  />
                ) : (
                  <span className={`text-lg font-bold tracking-tight ${isActive ? 'text-white' : 'text-gray-300'}`}>
                    All sales
                  </span>
                )}
                {isActive && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-blue-500/15 border border-blue-500/30 rounded-full px-2 py-0.5">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        {view === 'all' ? (
          <SalesPage headless />
        ) : (
          <div data-sold-panel="true" className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            {view === 'ebay' && <EbaySoldModal key="ebay-sold" open inline onClose={handlePanelClose} />}
            {view === 'poshmark' && <PoshmarkSoldModal key="poshmark-sold" open inline onClose={handlePanelClose} />}
            {view === 'depop' && <DepopSoldModal key="depop-sold" open inline onClose={handlePanelClose} />}
          </div>
        )}
      </div>
    </div>
  );
}

export default UnifiedSalesPage;
