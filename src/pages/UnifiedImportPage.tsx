/**
 * UnifiedImportPage — single /import surface for eBay / Poshmark / Depop.
 *
 * Styled to match the rest of the app: standard dark palette (gray-950 page,
 * gray-900 cards, gray-800 borders), no custom smoky tokens, no blur. The
 * active platform's existing import modal renders inline below the logo strip.
 *
 * Switching cancels the in-flight scrape (the previous panel unmounts,
 * triggering its `mountedRef.current = false` cleanup).
 *
 * Deep-link: /import?platform=depop  (or poshmark / ebay)
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { EbayImportModal } from '../components/ebay/EbayImportModal';
import { DepopImportModal } from '../components/depop/DepopImportModal';
import { PoshmarkImportModal } from '../components/poshmark/PoshmarkImportModal';
import { PlatformConnectBar } from '../components/import/PlatformConnectBar';
import ebayLogo from '../assets/logos/ebay.svg';
import poshmarkLogo from '../assets/logos/poshmark.svg';
import depopLogo from '../assets/logos/depop.svg';

type Platform = 'ebay' | 'poshmark' | 'depop';

const PLATFORM_META: Record<Platform, { label: string; logo: string }> = {
  ebay: { label: 'eBay', logo: ebayLogo },
  poshmark: { label: 'Poshmark', logo: poshmarkLogo },
  depop: { label: 'Depop', logo: depopLogo },
};

const PLATFORMS: Platform[] = ['ebay', 'poshmark', 'depop'];

// Scoped neutralizer: flattens the bright Tailwind utilities + any blur inside
// the inline modal bodies so they match the app's dark theme.
const PANEL_OVERRIDE_CSS = `
  [data-import-panel="true"] [class*="backdrop-blur"] { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
  [data-import-panel="true"] .bg-green-500, [data-import-panel="true"] .bg-green-600, [data-import-panel="true"] .bg-green-700,
  [data-import-panel="true"] .bg-emerald-500, [data-import-panel="true"] .bg-emerald-600,
  [data-import-panel="true"] .bg-purple-500, [data-import-panel="true"] .bg-purple-600, [data-import-panel="true"] .bg-purple-700,
  [data-import-panel="true"] .bg-blue-500, [data-import-panel="true"] .bg-blue-600, [data-import-panel="true"] .bg-blue-700,
  [data-import-panel="true"] .bg-orange-500, [data-import-panel="true"] .bg-orange-600, [data-import-panel="true"] .bg-orange-700,
  [data-import-panel="true"] .bg-yellow-600, [data-import-panel="true"] .bg-yellow-700,
  [data-import-panel="true"] .bg-amber-600, [data-import-panel="true"] .bg-amber-700,
  [data-import-panel="true"] .bg-red-600, [data-import-panel="true"] .bg-red-700,
  [data-import-panel="true"] .bg-rose-500, [data-import-panel="true"] .bg-rose-600,
  [data-import-panel="true"] .hover\\:bg-green-700:hover, [data-import-panel="true"] .hover\\:bg-purple-700:hover,
  [data-import-panel="true"] .hover\\:bg-blue-700:hover, [data-import-panel="true"] .hover\\:bg-orange-700:hover,
  [data-import-panel="true"] .hover\\:bg-yellow-700:hover, [data-import-panel="true"] .hover\\:bg-red-700:hover {
    background-color: #1f2937 !important; color: #f3f4f6 !important;
  }
  [data-import-panel="true"] .bg-green-900, [data-import-panel="true"] .bg-blue-900,
  [data-import-panel="true"] .bg-purple-900, [data-import-panel="true"] .bg-red-900 { background-color: #111827 !important; }
  [data-import-panel="true"] .text-green-200, [data-import-panel="true"] .text-green-300, [data-import-panel="true"] .text-green-400,
  [data-import-panel="true"] .text-emerald-300, [data-import-panel="true"] .text-emerald-400,
  [data-import-panel="true"] .text-purple-300, [data-import-panel="true"] .text-purple-400,
  [data-import-panel="true"] .text-blue-100, [data-import-panel="true"] .text-blue-200, [data-import-panel="true"] .text-blue-300, [data-import-panel="true"] .text-blue-400,
  [data-import-panel="true"] .text-amber-300, [data-import-panel="true"] .text-amber-400,
  [data-import-panel="true"] .text-red-300, [data-import-panel="true"] .text-red-400,
  [data-import-panel="true"] .text-rose-300, [data-import-panel="true"] .text-rose-400 { color: #e5e7eb !important; }
  [data-import-panel="true"] [class*="border-green-"], [data-import-panel="true"] [class*="border-emerald-"],
  [data-import-panel="true"] [class*="border-purple-"], [data-import-panel="true"] [class*="border-blue-"],
  [data-import-panel="true"] [class*="border-orange-"], [data-import-panel="true"] [class*="border-amber-"],
  [data-import-panel="true"] [class*="border-yellow-"], [data-import-panel="true"] [class*="border-red-"],
  [data-import-panel="true"] [class*="border-rose-"] { border-color: #374151 !important; }
`;

export function UnifiedImportPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = useMemo<Platform>(() => {
    const p = (params.get('platform') || '').toLowerCase();
    if (p === 'ebay' || p === 'poshmark' || p === 'depop') return p;
    const stored = (typeof localStorage !== 'undefined'
      ? localStorage.getItem('import:lastPlatform')
      : null) as Platform | null;
    if (stored === 'ebay' || stored === 'poshmark' || stored === 'depop') return stored;
    return 'ebay';
  }, [params]);

  const [active, setActive] = useState<Platform>(initial);
  const [pendingSwitch, setPendingSwitch] = useState<Platform | null>(null);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (next.get('platform') !== active) {
      next.set('platform', active);
      setParams(next, { replace: true });
    }
    try { localStorage.setItem('import:lastPlatform', active); } catch {}
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  function requestSwitch(next: Platform) {
    if (next === active) return;
    setPendingSwitch(next);
  }
  function confirmSwitch() {
    if (pendingSwitch) { setActive(pendingSwitch); setPendingSwitch(null); }
  }
  function cancelSwitch() { setPendingSwitch(null); }
  function handlePanelClose() { navigate(`/${active}`); }

  return (
    <div className="min-h-screen bg-gray-950">
      <style>{PANEL_OVERRIDE_CSS}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Import</h1>
            <p className="text-gray-400 mt-1">
              Pick a site to import listings from. One at a time — switching cancels the in-progress scrape.
            </p>
          </div>
          <Link
            to="/import/csv"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-100 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-lg px-3 py-2 transition-colors"
          >
            <FileText className="h-4 w-4" />
            CSV importer
          </Link>
        </div>

        {/* Platform tiles — roomy, evenly spaced */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          {PLATFORMS.map((p) => {
            const meta = PLATFORM_META[p];
            const isActive = active === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => requestSwitch(p)}
                aria-pressed={isActive}
                aria-label={`Import from ${meta.label}`}
                className={`relative h-36 rounded-2xl flex items-center justify-center px-8 transition-all duration-150 border-2 ${
                  isActive
                    ? 'bg-gray-800 border-blue-500/60 shadow-lg'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-600 hover:bg-gray-800/60'
                }`}
              >
                <img
                  src={meta.logo}
                  alt={meta.label}
                  draggable={false}
                  className="pointer-events-none select-none"
                  style={{ maxHeight: 52, maxWidth: '80%', opacity: isActive ? 1 : 0.8, transition: 'opacity 150ms' }}
                />
                {isActive && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-blue-500/15 border border-blue-500/30 rounded-full px-2 py-0.5">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Per-platform connect / sync header (relocated from the old integration pages) */}
        <PlatformConnectBar key={`bar-${active}`} platform={active} />

        {/* Active panel */}
        <div data-import-panel="true" className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          {active === 'ebay' && <EbayImportModal key="ebay" open inline onClose={handlePanelClose} />}
          {active === 'poshmark' && <PoshmarkImportModal key="poshmark" open inline onClose={handlePanelClose} />}
          {active === 'depop' && <DepopImportModal key="depop" open inline onClose={handlePanelClose} />}
        </div>
      </div>

      {/* Switch-confirm */}
      {pendingSwitch && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4" onClick={cancelSwitch}>
          <div onClick={(e) => e.stopPropagation()} className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white">Switch to {PLATFORM_META[pendingSwitch].label}?</h3>
            <p className="text-sm text-gray-400 mt-2">
              Any in-progress {PLATFORM_META[active].label} scrape or selection will be cancelled.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={cancelSwitch}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 hover:bg-gray-800 border border-gray-700">
                Stay
              </button>
              <button type="button" onClick={confirmSwitch}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white">
                Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UnifiedImportPage;
