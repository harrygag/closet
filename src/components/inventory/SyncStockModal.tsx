import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  CheckCircle,
  Loader2,
  ExternalLink,
  Zap,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { getFirestore, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../lib/firebase/client';

type StepStatus = 'idle' | 'loading' | 'complete' | 'error';

interface StepState {
  status: StepStatus;
  count: number;           // number of items fetched — 0 means no real data
  data: any[];             // the actual raw data (only set when complete)
  error?: string;
}

export interface SyncStockData {
  ebayActive: any[];
  ebaySold: Map<string, number>;
  depopActive: any[];
  depopSold: any[];
  poshmarkActive: any[];
  poshmarkSold: any[];
  ebayQtyMap: Map<string, number>;
  saleWindowDays: number; // 0 = count all sales (lifetime), >0 = only last N days
}

interface SyncStockModalProps {
  open: boolean;
  onClose: () => void;
  /** Default 'reconcile' (existing behavior). 'calibrate' is the temporary one-time baseline-setup mode. */
  mode?: 'reconcile' | 'calibrate';
  onRunReconciliation?: (data: SyncStockData) => Promise<void>;
  onCalibrate?: (data: SyncStockData) => Promise<void>;
}

const SALE_WINDOW_KEY = 'syncStock_saleWindowDays';
const DEFAULT_SALE_WINDOW = 30;

type StepKey = 'ebayActive' | 'ebaySold' | 'depopActive' | 'depopSold' | 'poshmarkActive' | 'poshmarkSold';

const STEP_CONFIG: Record<StepKey, {
  label: string;
  color: string;
  bgColor: string;
  url?: string;
  pollPaths?: string[];
  description: string;
}> = {
  ebayActive:    { label: 'eBay · Active Listings',  color: 'text-blue-400',   bgColor: 'bg-blue-600',   description: 'Fetches all active eBay listings via API' },
  ebaySold:      { label: 'eBay · Sold Quantities',  color: 'text-blue-400',   bgColor: 'bg-blue-600',   description: 'Fetches quantity-sold per listing via API' },
  depopActive:   { label: 'Depop · Active Listings', color: 'text-red-400',    bgColor: 'bg-red-600',
    url: 'https://www.depop.com/sellinghub/selling/active/#autoScroll',
    pollPaths: ['265732668', 'dallassports'],
    description: 'Opens Depop active page — extension scrapes listings' },
  depopSold:     { label: 'Depop · Sold Items',      color: 'text-red-400',    bgColor: 'bg-red-600',
    url: 'https://www.depop.com/sellinghub/sold-items/#autoScroll',
    pollPaths: ['depop_sold_265732668', 'depop_sold_dallassports'],
    description: 'Opens Depop sold page — extension scrapes sold items' },
  poshmarkActive:{ label: 'Poshmark · Active Listings', color: 'text-purple-400', bgColor: 'bg-purple-600',
    url: 'https://poshmark.com/closet/retrothriftc0?availability=available#autoScroll',
    pollPaths: ['poshmark_retrothriftc0'],
    description: 'Opens Poshmark closet — extension scrapes listings' },
  poshmarkSold:  { label: 'Poshmark · Sold Items',      color: 'text-purple-400', bgColor: 'bg-purple-600',
    url: 'https://poshmark.com/order/sales#autoScroll',
    pollPaths: ['poshmark_sold_retrothriftc0'],
    description: 'Opens Poshmark sales page — extension scrapes sold items' },
};

const ALL_STEPS: StepKey[] = ['ebayActive', 'ebaySold', 'depopActive', 'depopSold', 'poshmarkActive', 'poshmarkSold'];

const LOADING_PHRASES = [
  'Contemplating…',
  'Scraping data…',
  'Parsing listings…',
  'Matching items…',
  'Fetching…',
  'Processing…',
  'Analyzing…',
];

const initialStep: StepState = { status: 'idle', count: 0, data: [] };

export const SyncStockModal = ({ open, onClose, mode = 'reconcile', onRunReconciliation, onCalibrate }: SyncStockModalProps) => {
  const [steps, setSteps] = useState<Record<StepKey, StepState>>({
    ebayActive: { ...initialStep },
    ebaySold: { ...initialStep },
    depopActive: { ...initialStep },
    depopSold: { ...initialStep },
    poshmarkActive: { ...initialStep },
    poshmarkSold: { ...initialStep },
  });
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);
  const [isReconciling, setIsReconciling] = useState(false);
  const [ebayQtyMap, setEbayQtyMap] = useState<Map<string, number>>(new Map());
  const [ebaySoldMap, setEbaySoldMap] = useState<Map<string, number>>(new Map());
  const [, setRateLimitRemaining] = useState(0); // ms until user can re-run scrape steps (unused while disabled)
  // Sale window: only count sales in last N days (user restocks, so old sales don't affect current stock)
  const [saleWindowDays, setSaleWindowDays] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(SALE_WINDOW_KEY) || '', 10);
    return isNaN(v) ? DEFAULT_SALE_WINDOW : v;
  });
  useEffect(() => {
    localStorage.setItem(SALE_WINDOW_KEY, String(saleWindowDays));
  }, [saleWindowDays]);

  // Rate limit: 15 minutes between tab-based scrapes to avoid marketplace bans
  const RATE_LIMIT_MS = 15 * 60 * 1000;
  const RATE_LIMIT_KEY = 'syncStock_lastTabScrapeAt';

  const checkRateLimit = (): { allowed: boolean; waitMs: number } => {
    const last = parseInt(localStorage.getItem(RATE_LIMIT_KEY) || '0', 10);
    if (!last) return { allowed: true, waitMs: 0 };
    const elapsed = Date.now() - last;
    if (elapsed >= RATE_LIMIT_MS) return { allowed: true, waitMs: 0 };
    return { allowed: false, waitMs: RATE_LIMIT_MS - elapsed };
  };

  // Live countdown when rate-limited
  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const { waitMs } = checkRateLimit();
      setRateLimitRemaining(waitMs);
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [open]);

  // Cycle loading phrases every 1.2s when anything is loading
  useEffect(() => {
    const anyLoading = Object.values(steps).some(s => s.status === 'loading');
    if (!anyLoading) return;
    const t = setInterval(() => setLoadingPhraseIdx(i => (i + 1) % LOADING_PHRASES.length), 1200);
    return () => clearInterval(t);
  }, [steps]);

  // Reset data when modal opens (fresh data requirement)
  useEffect(() => {
    if (open) {
      setSteps({
        ebayActive: { ...initialStep },
        ebaySold: { ...initialStep },
        depopActive: { ...initialStep },
        depopSold: { ...initialStep },
        poshmarkActive: { ...initialStep },
        poshmarkSold: { ...initialStep },
      });
      setEbayQtyMap(new Map());
      setEbaySoldMap(new Map());
    }
  }, [open]);

  const updateStep = (key: StepKey, patch: Partial<StepState>) => {
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  // === eBay: calls the Cloud Function and populates both active + sold counts ===
  const runEbayStep = async (which: 'active' | 'sold') => {
    const key: StepKey = which === 'active' ? 'ebayActive' : 'ebaySold';
    updateStep(key, { status: 'loading' });

    try {
      const getAllListings = httpsCallable(getFunctions(app), 'ebayGetAllListings', { timeout: 300000 });
      const result = await getAllListings({ fetchAll: true });
      const data = result.data as { success: boolean; listings: Array<{ itemId: string; quantity: number; quantityAvailable?: number; quantitySold?: number }> };

      if (!data?.success || !data?.listings) {
        updateStep(key, { status: 'error', error: 'eBay API returned no data' });
        toast.error('eBay fetch failed');
        return;
      }

      console.log(`[SyncStock] eBay Cloud Function returned ${data.listings.length} total listings`);

      const qtyMap = new Map<string, number>();
      const soldMap = new Map<string, number>();
      let totalSoldUnits = 0;
      let listingsWithSales = 0;
      for (const listing of data.listings) {
        if (listing.itemId) {
          const available = listing.quantityAvailable ?? (listing.quantity - (listing.quantitySold || 0));
          qtyMap.set(listing.itemId, typeof available === 'number' ? available : 0);
          const sold = listing.quantitySold || 0;
          soldMap.set(listing.itemId, sold);
          if (sold > 0) {
            listingsWithSales++;
            totalSoldUnits += sold;
          }
        }
      }
      console.log(`[SyncStock] eBay parsed: ${data.listings.length} listings, ${listingsWithSales} with sales, ${totalSoldUnits} total units sold`);

      setEbayQtyMap(qtyMap);
      setEbaySoldMap(soldMap);

      // ACTIVE = every listing returned (any listing in GetSellerList is currently active)
      // SOLD = total units sold across all listings (sum of quantitySold)
      if (which === 'active') {
        updateStep('ebayActive', { status: 'complete', count: data.listings.length, data: data.listings });
      } else {
        updateStep('ebaySold', { status: 'complete', count: totalSoldUnits, data: data.listings });
      }

      toast.success(`eBay ${which}: ${which === 'active' ? data.listings.length : totalSoldUnits} items`);
    } catch (err: any) {
      console.error(`[SyncStock] eBay ${which} failed:`, err);
      updateStep(key, { status: 'error', error: err?.message || 'Unknown error' });
      toast.error(`eBay ${which} fetch failed`);
    }
  };

  // === Tab-based steps (Depop/Poshmark): open tab + poll Firestore for extension data ===
  const runTabStep = async (key: StepKey) => {
    const config = STEP_CONFIG[key];
    if (!config.url || !config.pollPaths) return;

    // NOTE: Rate limit temporarily disabled for testing. Re-enable for production.
    // const rate = checkRateLimit();
    // if (!rate.allowed) {
    //   const minLeft = Math.ceil(rate.waitMs / 60000);
    //   toast.error(`Please wait ${minLeft} more minute${minLeft === 1 ? '' : 's'} before re-scraping`);
    //   return;
    // }
    // localStorage.setItem(RATE_LIMIT_KEY, String(Date.now()));
    // setRateLimitRemaining(RATE_LIMIT_MS);

    // Clear any existing rate limit so user can re-run
    localStorage.removeItem(RATE_LIMIT_KEY);
    setRateLimitRemaining(0);

    const pollStartTime = Date.now();

    // Clear stale data
    const firestore = getFirestore(app);
    for (const docPath of config.pollPaths) {
      try {
        await deleteDoc(doc(firestore, 'marketplaceData', docPath));
        console.log(`[SyncStock] Cleared stale data at marketplaceData/${docPath}`);
      } catch (e) {
        console.warn(`[SyncStock] Delete failed for ${docPath}:`, e);
      }
    }

    updateStep(key, { status: 'loading', count: 0, data: [] });

    // Open tab via link-click (user gesture bypasses popup blocker)
    const a = document.createElement('a');
    a.href = config.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast.info(`${config.label}: tab opened — KEEP THE TAB VISIBLE (Chrome throttles background tabs)`, { duration: 6000 });

    // Poll — wait for scrapeComplete flag, not just stable count
    const startTime = Date.now();
    const maxWaitMs = 240000; // 4 minutes
    let lastCount = 0;
    let stableChecks = 0;
    const STABLE_CHECKS_NEEDED = 6; // 18s of stability as fallback if scrapeComplete never arrives

    const poll = async () => {
      if (Date.now() - startTime > maxWaitMs) {
        // Fall back to last known count if we saw any fresh data at all
        if (lastCount > 0) {
          updateStep(key, { status: 'complete', count: lastCount });
          toast.warning(`${config.label}: completed at timeout with ${lastCount} items (scrape may be incomplete)`);
        } else {
          updateStep(key, { status: 'error', error: 'Timed out after 4 min — extension may not be running' });
          toast.error(`${config.label}: timed out`);
        }
        return;
      }

      for (const docPath of config.pollPaths!) {
        try {
          const snap = await getDoc(doc(firestore, 'marketplaceData', docPath));
          if (snap.exists()) {
            const docData = snap.data();
            const listings = docData?.listings;
            const scrapeComplete = docData?.scrapeComplete === true;

            // Stale-data guard: only accept data written after poll started
            const syncedAtRaw = docData?.syncedAt || docData?.lastSync;
            let syncedAtMs = 0;
            if (syncedAtRaw?.toMillis) syncedAtMs = syncedAtRaw.toMillis();
            else if (typeof syncedAtRaw === 'number') syncedAtMs = syncedAtRaw;
            else if (typeof syncedAtRaw === 'string') syncedAtMs = new Date(syncedAtRaw).getTime();
            else if (syncedAtRaw?.seconds) syncedAtMs = syncedAtRaw.seconds * 1000;
            const isFresh = syncedAtMs > pollStartTime;

            if (Array.isArray(listings) && listings.length > 0) {
              if (!isFresh) {
                console.log(`[SyncStock] ${config.label}: ignoring stale data (syncedAt=${syncedAtMs}, pollStart=${pollStartTime})`);
                continue;
              }
              console.log(`[SyncStock] ${config.label}: fresh data ${listings.length} items, scrapeComplete=${scrapeComplete}`);

              // Primary exit: extension signaled scrapeComplete
              if (scrapeComplete) {
                updateStep(key, { status: 'complete', count: listings.length, data: listings });
                toast.success(`${config.label}: ${listings.length} items (scrape complete)`);
                return;
              }

              // Secondary exit: stable count over 18s (fallback for when extension is too old to signal)
              if (listings.length === lastCount) {
                stableChecks++;
                if (stableChecks >= STABLE_CHECKS_NEEDED) {
                  updateStep(key, { status: 'complete', count: listings.length, data: listings });
                  toast.success(`${config.label}: ${listings.length} items (stable)`);
                  return;
                }
              } else {
                stableChecks = 0;
                lastCount = listings.length;
                updateStep(key, { count: listings.length });
              }
            }
          }
        } catch {}
      }
      setTimeout(poll, 3000);
    };
    // Longer initial wait — extension debounce is now 20s
    setTimeout(poll, 15000);
  };

  const runStep = (key: StepKey) => {
    if (key === 'ebayActive') return runEbayStep('active');
    if (key === 'ebaySold') return runEbayStep('sold');
    return runTabStep(key);
  };

  const allComplete = ALL_STEPS.every(k => steps[k].status === 'complete');
  const anyLoading = ALL_STEPS.some(k => steps[k].status === 'loading');

  const handleFinish = async () => {
    if (!allComplete) return;
    setIsReconciling(true);
    try {
      const payload: SyncStockData = {
        ebayActive: steps.ebayActive.data,
        ebaySold: ebaySoldMap,
        depopActive: steps.depopActive.data,
        depopSold: steps.depopSold.data,
        poshmarkActive: steps.poshmarkActive.data,
        poshmarkSold: steps.poshmarkSold.data,
        ebayQtyMap,
        saleWindowDays,
      };
      if (mode === 'calibrate') {
        if (onCalibrate) await onCalibrate(payload);
      } else {
        if (onRunReconciliation) await onRunReconciliation(payload);
      }
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={mode === 'calibrate' ? 'Calibrate Baseline — Snapshot All Current Sales' : 'Sync Stock — Fresh Data Pull'}
      size="lg"
    >
      <div className="space-y-4">
        <div className="text-sm text-gray-400 -mt-2">
          Click each source below to fetch fresh data. Check marks only appear when real data arrives.
        </div>

        <div className="p-2 rounded-md bg-blue-900/15 border border-blue-700/30 text-[11px] text-blue-300">
          ⚠ Keep each opened tab visible while it scrapes. Chrome throttles background tabs and auto-scroll will stall.
        </div>

        {/* Sale window control — since you restock, old sales shouldn't count against current stock */}
        <div className="p-3 rounded-md bg-gray-800/40 border border-gray-700/50 flex items-center gap-3">
          <label className="text-xs text-gray-300 flex-1">
            Only count sales from the last
            <input
              type="number"
              min={0}
              max={3650}
              value={saleWindowDays}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setSaleWindowDays(isNaN(v) || v < 0 ? 0 : v);
              }}
              className="mx-2 w-16 px-2 py-0.5 bg-gray-900 border border-gray-600 rounded text-sm text-white text-center"
            />
            days {saleWindowDays === 0 && <span className="text-gray-500">(0 = all-time)</span>}
          </label>
          <span className="text-[10px] text-gray-500">
            You restock, so older sales don't count against today's stock.
          </span>
        </div>

        {/* Step rows */}
        <div className="space-y-2">
          {ALL_STEPS.map((key) => {
            const step = steps[key];
            const config = STEP_CONFIG[key];
            const isLoading = step.status === 'loading';
            const isComplete = step.status === 'complete';
            const isError = step.status === 'error';

            return (
              <div
                key={key}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  isComplete ? 'bg-green-900/15 border-green-700/40' :
                  isError ? 'bg-red-900/15 border-red-700/40' :
                  isLoading ? 'bg-gray-800/60 border-gray-600' :
                  'bg-gray-800/30 border-gray-700/50'
                }`}
              >
                {/* Platform color dot */}
                <div className={`w-2 h-10 rounded-full flex-shrink-0 ${config.bgColor}`} />

                {/* Label + description */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${config.color}`}>{config.label}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {isLoading ? LOADING_PHRASES[loadingPhraseIdx] :
                     isError ? (step.error || 'Failed') :
                     config.description}
                  </div>
                </div>

                {/* Count + status */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isLoading && (
                    <>
                      {step.count > 0 && (
                        <span className="text-xs text-gray-400 tabular-nums">{step.count}…</span>
                      )}
                      <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
                    </>
                  )}
                  {isComplete && (
                    <>
                      <span className="text-base font-bold text-green-300 tabular-nums min-w-[2.5rem] text-right">
                        {step.count}
                      </span>
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    </>
                  )}
                  {isError && (
                    <span className="text-xs text-red-400 font-semibold">Failed</span>
                  )}
                  {step.status === 'idle' && (
                    <span className="text-xs text-gray-600">—</span>
                  )}
                </div>

                {/* Action button */}
                <div className="flex-shrink-0">
                  {isLoading ? (
                    <Button size="sm" variant="ghost" disabled>...</Button>
                  ) : isComplete ? (
                    <Button size="sm" variant="ghost" onClick={() => runStep(key)}>Refresh</Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => runStep(key)}
                      className={config.url ? '' : ''}
                    >
                      {config.url ? (
                        <><ExternalLink className="h-3.5 w-3.5 mr-1" />Start</>
                      ) : (
                        <><Play className="h-3.5 w-3.5 mr-1" />Start</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress summary */}
        <div className="text-xs text-gray-400 text-center">
          {ALL_STEPS.filter(k => steps[k].status === 'complete').length} / {ALL_STEPS.length} sources complete
        </div>

        {/* Final action button — label/handler swap based on mode */}
        <div className="pt-2 border-t border-gray-700">
          <Button
            onClick={handleFinish}
            disabled={!allComplete || isReconciling || anyLoading}
            loading={isReconciling}
            className={`w-full ${allComplete ? (mode === 'calibrate'
              ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500'
              : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500') : ''}`}
          >
            <Zap className="h-4 w-4 mr-2" />
            {allComplete
              ? (mode === 'calibrate'
                  ? 'Lock In Baseline (snapshot all 3 platforms)'
                  : 'Run Reconciliation (eBay Stock − Sales from Other Platforms)')
              : `Waiting for all 6 sources (${ALL_STEPS.filter(k => steps[k].status === 'complete').length}/6)`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
