import React, { useState, useCallback } from 'react';
import {
  X,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Info,
  RefreshCw,
  Download,
  Zap,
  Layers,
  Mail,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../lib/firebase/client';
import { useItemStore } from '../../store/useItemStore';
import type { Item } from '../../types/item';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckQuantityModalProps {
  open: boolean;
  onClose: () => void;
  onCriticalCountChange?: (count: number) => void;
}

type Severity = 'CRITICAL' | 'WARNING' | 'INFO';

interface MismatchAlert {
  id: string;
  severity: Severity;
  itemName: string;
  sku: string;
  platform: 'eBay' | 'Poshmark';
  issue: string;
  action: string;
  localItem?: Item;
  ebayListingId?: string;
}

interface PlatformCSVStatus {
  platform: 'eBay' | 'Poshmark';
  success: boolean;
  filename?: string;
  date?: string;
  error?: string;
  data?: CSVRow[];
}

interface CSVRow {
  sku: string;
  title: string;
  quantity: number;
  price: number;
  status: string;
  listingId?: string;
}

type Step = 'fetch' | 'analysis' | 'actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectMismatches(
  localItems: Item[],
  ebayRows: CSVRow[] | null,
  poshmarkRows: CSVRow[] | null
): MismatchAlert[] {
  const alerts: MismatchAlert[] = [];
  let idCounter = 0;

  const matchItem = (
    rows: CSVRow[],
    platform: 'eBay' | 'Poshmark'
  ) => {
    const rowMap = new Map<string, CSVRow>();
    for (const row of rows) {
      const key = row.sku?.toLowerCase() || row.title?.toLowerCase();
      if (key) rowMap.set(key, row);
    }

    const matchedSkus = new Set<string>();

    for (const item of localItems) {
      const searchKeys = [
        item.ebaySku?.toLowerCase(),
        item.barcode?.toLowerCase(),
        item.name?.toLowerCase(),
      ].filter(Boolean) as string[];

      let matched: CSVRow | undefined;
      for (const key of searchKeys) {
        matched = rowMap.get(key);
        if (matched) break;
        // fuzzy title match
        if (!matched) {
          for (const [mapKey, row] of rowMap.entries()) {
            if (
              mapKey.includes(key) ||
              key.includes(mapKey)
            ) {
              matched = row;
              break;
            }
          }
        }
        if (matched) break;
      }

      if (!matched) {
        if (item.status === 'Active') {
          alerts.push({
            id: `alert-${idCounter++}`,
            severity: 'INFO',
            itemName: item.name,
            sku: item.ebaySku || item.barcode || '-',
            platform,
            issue: `Not listed on ${platform}`,
            action: 'Consider listing or ignore',
            localItem: item,
          });
        }
        continue;
      }

      const matchKey = matched.sku?.toLowerCase() || matched.title?.toLowerCase();
      if (matchKey) matchedSkus.add(matchKey);

      // Sold on platform but still active locally
      if (
        (matched.status === 'sold' || matched.status === 'completed' || matched.quantity === 0) &&
        item.status === 'Active'
      ) {
        alerts.push({
          id: `alert-${idCounter++}`,
          severity: 'CRITICAL',
          itemName: item.name,
          sku: item.ebaySku || item.barcode || '-',
          platform,
          issue: `Sold on ${platform} but still listed as Active locally`,
          action: `Delist from other platforms & mark as SOLD`,
          localItem: item,
          ebayListingId: item.ebayListingId || item.ebayItemId,
        });
        continue;
      }

      // Oversold: marketplace shows sold quantity higher than local
      const localQty = item.ebayQuantity ?? 1;
      if (matched.quantity !== undefined && localQty > 0 && matched.quantity > localQty) {
        alerts.push({
          id: `alert-${idCounter++}`,
          severity: 'CRITICAL',
          itemName: item.name,
          sku: item.ebaySku || item.barcode || '-',
          platform,
          issue: `Oversold: ${platform} shows ${matched.quantity} listed but only ${localQty} in stock`,
          action: `Reduce ${platform} quantity to ${localQty}`,
          localItem: item,
          ebayListingId: item.ebayListingId || item.ebayItemId,
        });
        continue;
      }

      // Quantity mismatch
      if (matched.quantity !== undefined && matched.quantity !== localQty) {
        alerts.push({
          id: `alert-${idCounter++}`,
          severity: 'WARNING',
          itemName: item.name,
          sku: item.ebaySku || item.barcode || '-',
          platform,
          issue: `Quantity mismatch: local=${localQty}, ${platform}=${matched.quantity}`,
          action: `Update ${platform} quantity to ${localQty}`,
          localItem: item,
          ebayListingId: item.ebayListingId || item.ebayItemId,
        });
      }
    }
  };

  if (ebayRows) matchItem(ebayRows, 'eBay');
  if (poshmarkRows) matchItem(poshmarkRows, 'Poshmark');

  // Sort: CRITICAL first, then WARNING, then INFO
  const order: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return alerts;
}

function exportAlertsCsv(alerts: MismatchAlert[]) {
  const headers = ['Severity', 'Platform', 'Item Name', 'SKU', 'Issue', 'Action'];
  const rows = alerts.map((a) =>
    headers
      .map((h) => {
        const val =
          h === 'Severity' ? a.severity :
          h === 'Platform' ? a.platform :
          h === 'Item Name' ? a.itemName :
          h === 'SKU' ? a.sku :
          h === 'Issue' ? a.issue :
          a.action;
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quantity-check-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Report exported');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CheckQuantityModal: React.FC<CheckQuantityModalProps> = ({
  open,
  onClose,
  onCriticalCountChange,
}) => {
  const [step, setStep] = useState<Step>('fetch');
  const [isFetching, setIsFetching] = useState(false);
  const [ebayStatus, setEbayStatus] = useState<PlatformCSVStatus | null>(null);
  const [poshmarkStatus, setPoshmarkStatus] = useState<PlatformCSVStatus | null>(null);
  const [alerts, setAlerts] = useState<MismatchAlert[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<Severity, boolean>>({
    CRITICAL: true,
    WARNING: true,
    INFO: false,
  });
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set());

  const { items } = useItemStore();

  const receivedCount = [ebayStatus?.success, poshmarkStatus?.success].filter(Boolean).length;

  // -------------------------------------------------------------------------
  // Step 1: Fetch CSVs from Gmail via Cloud Function
  // -------------------------------------------------------------------------

  const handleFetchCSVs = useCallback(async () => {
    setIsFetching(true);
    setEbayStatus(null);
    setPoshmarkStatus(null);

    try {
      const functions = getFunctions(app);
      const fetchFn = httpsCallable<
        Record<string, never>,
        {
          ebay?: { success: boolean; filename?: string; date?: string; error?: string; data?: CSVRow[] };
          poshmark?: { success: boolean; filename?: string; date?: string; error?: string; data?: CSVRow[] };
        }
      >(functions, 'gmailFetchInventoryCSVs');

      const result = await fetchFn({});
      const data = result.data;

      const ebay: PlatformCSVStatus = data.ebay
        ? {
            platform: 'eBay',
            success: data.ebay.success,
            filename: data.ebay.filename,
            date: data.ebay.date,
            error: data.ebay.error,
            data: data.ebay.data,
          }
        : { platform: 'eBay', success: false, error: 'No eBay data returned' };

      const poshmark: PlatformCSVStatus = data.poshmark
        ? {
            platform: 'Poshmark',
            success: data.poshmark.success,
            filename: data.poshmark.filename,
            date: data.poshmark.date,
            error: data.poshmark.error,
            data: data.poshmark.data,
          }
        : { platform: 'Poshmark', success: false, error: 'No Poshmark data returned' };

      setEbayStatus(ebay);
      setPoshmarkStatus(poshmark);

      const total = [ebay.success, poshmark.success].filter(Boolean).length;
      if (total > 0) {
        toast.success(`${total}/2 inventory reports received`);
      } else {
        toast.error('No inventory reports found — check Gmail connection');
      }
    } catch (err: any) {
      console.error('gmailFetchInventoryCSVs error:', err);
      toast.error(err.message || 'Failed to fetch inventory CSVs');
      setEbayStatus({ platform: 'eBay', success: false, error: err.message || 'Cloud Function error' });
      setPoshmarkStatus({ platform: 'Poshmark', success: false, error: err.message || 'Cloud Function error' });
    } finally {
      setIsFetching(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Step 2: Analyze
  // -------------------------------------------------------------------------

  const handleAnalyze = useCallback(() => {
    setIsAnalyzing(true);

    // Run in a microtask to allow the UI to update with the loading state
    setTimeout(() => {
      try {
        const ebayRows = ebayStatus?.success ? (ebayStatus.data ?? null) : null;
        const poshRows = poshmarkStatus?.success ? (poshmarkStatus.data ?? null) : null;

        const result = detectMismatches(items, ebayRows, poshRows);
        setAlerts(result);

        const criticalCount = result.filter((a) => a.severity === 'CRITICAL').length;
        onCriticalCountChange?.(criticalCount);

        setStep('analysis');
        toast.success(`Analysis complete — ${result.length} alerts`);
      } catch (err: any) {
        console.error('Mismatch detection error:', err);
        toast.error('Analysis failed');
      } finally {
        setIsAnalyzing(false);
      }
    }, 50);
  }, [ebayStatus, poshmarkStatus, items, onCriticalCountChange]);

  // -------------------------------------------------------------------------
  // Step 3: Actions
  // -------------------------------------------------------------------------

  const handleFixSingle = useCallback(
    async (alert: MismatchAlert) => {
      setFixingIds((prev) => new Set(prev).add(alert.id));
      try {
        if (alert.severity === 'CRITICAL' && alert.ebayListingId) {
          const functions = getFunctions(app);
          const delistFn = httpsCallable(functions, 'delistItem');
          await delistFn({ listingId: alert.ebayListingId, platform: alert.platform });
          toast.success(`Delisted ${alert.itemName} from ${alert.platform}`);
        } else if (alert.severity === 'WARNING' && alert.ebayListingId) {
          const functions = getFunctions(app);
          const updateQtyFn = httpsCallable(functions, 'updateListingQuantity');
          const localQty = alert.localItem?.ebayQuantity ?? 1;
          await updateQtyFn({
            listingId: alert.ebayListingId,
            quantity: localQty,
            platform: alert.platform,
          });
          toast.success(`Updated quantity for ${alert.itemName}`);
        } else {
          toast.info('No automated fix available for this alert');
        }
        // Remove from alerts
        setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      } catch (err: any) {
        console.error('Fix error:', err);
        toast.error(`Fix failed: ${err.message || 'Unknown error'}`);
      } finally {
        setFixingIds((prev) => {
          const next = new Set(prev);
          next.delete(alert.id);
          return next;
        });
      }
    },
    []
  );

  const handleFixAllCritical = useCallback(async () => {
    const criticals = alerts.filter((a) => a.severity === 'CRITICAL');
    if (criticals.length === 0) {
      toast.info('No critical alerts to fix');
      return;
    }
    toast.info(`Fixing ${criticals.length} critical alerts...`);
    for (const alert of criticals) {
      await handleFixSingle(alert);
    }
    toast.success('All critical alerts processed');
  }, [alerts, handleFixSingle]);

  const handleUpdateAllQuantities = useCallback(async () => {
    const warnings = alerts.filter((a) => a.severity === 'WARNING');
    if (warnings.length === 0) {
      toast.info('No quantity warnings to fix');
      return;
    }
    toast.info(`Updating ${warnings.length} quantities...`);
    for (const alert of warnings) {
      await handleFixSingle(alert);
    }
    toast.success('All quantities updated');
  }, [alerts, handleFixSingle]);

  const toggleSection = useCallback((severity: Severity) => {
    setExpandedSections((prev) => ({ ...prev, [severity]: !prev[severity] }));
  }, []);

  // Reset when closing
  const handleClose = useCallback(() => {
    setStep('fetch');
    setEbayStatus(null);
    setPoshmarkStatus(null);
    setAlerts([]);
    setIsFetching(false);
    setIsAnalyzing(false);
    onClose();
  }, [onClose]);

  if (!open) return null;

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  const criticalAlerts = alerts.filter((a) => a.severity === 'CRITICAL');
  const warningAlerts = alerts.filter((a) => a.severity === 'WARNING');
  const infoAlerts = alerts.filter((a) => a.severity === 'INFO');

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const severityConfig: Record<
    Severity,
    { icon: React.ReactNode; bg: string; border: string; text: string; badge: string }
  > = {
    CRITICAL: {
      icon: <XCircle className="h-4 w-4 text-red-400" />,
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    },
    WARNING: {
      icon: <AlertTriangle className="h-4 w-4 text-yellow-400" />,
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      text: 'text-yellow-400',
      badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    },
    INFO: {
      icon: <Info className="h-4 w-4 text-blue-400" />,
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      text: 'text-blue-400',
      badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    },
  };

  const renderPlatformStatus = (status: PlatformCSVStatus | null, platform: string) => {
    if (!status) {
      return (
        <div className="flex items-center gap-3 py-3 px-4 bg-white/[0.02] rounded-xl border border-white/5">
          <div className="h-3 w-3 rounded-full bg-gray-600" />
          <span className="text-sm text-gray-500">{platform} — waiting</span>
        </div>
      );
    }
    if (status.success) {
      return (
        <div className="flex items-center gap-3 py-3 px-4 bg-green-500/5 rounded-xl border border-green-500/20">
          <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="text-sm text-green-300 font-medium">{platform}</span>
            <p className="text-xs text-gray-500 truncate">
              {status.filename}{status.date ? ` — ${status.date}` : ''}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3 py-3 px-4 bg-red-500/5 rounded-xl border border-red-500/20">
        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-sm text-red-300 font-medium">{platform}</span>
          <p className="text-xs text-red-400/70 truncate">{status.error || 'Failed'}</p>
        </div>
      </div>
    );
  };

  const renderAlertRow = (alert: MismatchAlert) => {
    const config = severityConfig[alert.severity];
    const isFixing = fixingIds.has(alert.id);
    return (
      <div
        key={alert.id}
        className={`flex items-start gap-3 py-3 px-4 rounded-xl ${config.bg} border ${config.border} mb-2 last:mb-0`}
      >
        <div className="shrink-0 mt-0.5">{config.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-white truncate">{alert.itemName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${config.badge}`}>
              {alert.platform}
            </span>
          </div>
          <p className="text-xs text-gray-400">SKU: {alert.sku}</p>
          <p className="text-xs text-gray-300 mt-1">{alert.issue}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{alert.action}</p>
        </div>
        {(alert.severity === 'CRITICAL' || alert.severity === 'WARNING') && (
          <button
            type="button"
            disabled={isFixing}
            onClick={() => handleFixSingle(alert)}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
              alert.severity === 'CRITICAL'
                ? 'bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30'
                : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/30'
            }`}
          >
            {isFixing ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Fix'}
          </button>
        )}
      </div>
    );
  };

  const renderSection = (severity: Severity, label: string, sectionAlerts: MismatchAlert[]) => {
    const config = severityConfig[severity];
    const isOpen = expandedSections[severity];
    return (
      <div className="border border-white/10 rounded-2xl overflow-hidden mb-3">
        <button
          type="button"
          onClick={() => toggleSection(severity)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
        >
          <div className="flex items-center gap-2">
            {config.icon}
            <span className="text-sm font-semibold text-white">{label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${config.badge}`}>
              {sectionAlerts.length}
            </span>
            {isOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-gray-500" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
            )}
          </div>
        </button>
        {isOpen && sectionAlerts.length > 0 && (
          <div className="px-4 pb-3">
            {sectionAlerts.map(renderAlertRow)}
          </div>
        )}
        {isOpen && sectionAlerts.length === 0 && (
          <p className="px-4 pb-3 text-xs text-gray-600">No alerts in this category.</p>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // JSX
  // -------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-2xl border border-white/10 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Check Quantity</h2>
            {step === 'analysis' && alerts.length > 0 && (
              <span className="text-xs text-gray-400 ml-2">
                {criticalAlerts.length} critical &middot; {warningAlerts.length} warnings &middot; {infoAlerts.length} info
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.05]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ---- Step 1: Fetch CSVs ---- */}
          {step === 'fetch' && (
            <div className="space-y-5">
              <div className="text-center mb-6">
                <Mail className="h-8 w-8 text-gray-500 mx-auto mb-3" />
                <p className="text-sm text-gray-300 mb-1">
                  Fetch inventory reports from Gmail
                </p>
                <p className="text-xs text-gray-500">
                  Retrieves the latest eBay and Poshmark CSVs from your email
                </p>
              </div>

              {/* Platform statuses */}
              <div className="space-y-2">
                {renderPlatformStatus(ebayStatus, 'eBay')}
                {renderPlatformStatus(poshmarkStatus, 'Poshmark')}
              </div>

              {/* Status header */}
              {(ebayStatus || poshmarkStatus) && (
                <div className="text-center">
                  <span
                    className={`inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border ${
                      receivedCount === 2
                        ? 'bg-green-500/10 border-green-500/20 text-green-400'
                        : receivedCount === 1
                        ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}
                  >
                    {receivedCount === 2 && <CheckCircle className="h-4 w-4" />}
                    {receivedCount === 1 && <AlertTriangle className="h-4 w-4" />}
                    {receivedCount === 0 && <XCircle className="h-4 w-4" />}
                    {receivedCount}/2 received
                    {receivedCount === 0 && ' — check Gmail connection'}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleFetchCSVs}
                  disabled={isFetching}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50"
                >
                  {isFetching ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {isFetching ? 'Fetching inventory reports from Gmail...' : 'Fetch CSVs'}
                </button>

                {receivedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600/30 hover:bg-green-600/50 border border-green-500/40 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ---- Step 2: Analysis Results ---- */}
          {step === 'analysis' && (
            <div className="space-y-4">
              {/* Summary badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                  <XCircle className="h-3 w-3" />
                  {criticalAlerts.length} critical
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                  <AlertTriangle className="h-3 w-3" />
                  {warningAlerts.length} warnings
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                  <Info className="h-3 w-3" />
                  {infoAlerts.length} info
                </span>
              </div>

              {/* Alert sections */}
              {renderSection('CRITICAL', 'Critical', criticalAlerts)}
              {renderSection('WARNING', 'Warnings', warningAlerts)}
              {renderSection('INFO', 'Informational', infoAlerts)}

              {alerts.length === 0 && (
                <div className="text-center py-10">
                  <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-300">All quantities match. No issues found.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {step === 'analysis' && alerts.length > 0 && (
          <div className="shrink-0 px-6 py-4 border-t border-white/10 flex flex-wrap gap-2">
            {criticalAlerts.length > 0 && (
              <button
                type="button"
                onClick={handleFixAllCritical}
                className="flex items-center gap-2 px-4 py-2 bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 rounded-xl text-sm font-medium text-red-200 transition-all"
              >
                <Zap className="h-4 w-4" />
                Fix All Critical ({criticalAlerts.length})
              </button>
            )}
            {warningAlerts.length > 0 && (
              <button
                type="button"
                onClick={handleUpdateAllQuantities}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-500/40 rounded-xl text-sm font-medium text-yellow-200 transition-all"
              >
                <Layers className="h-4 w-4" />
                Update All Quantities ({warningAlerts.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => exportAlertsCsv(alerts)}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 rounded-xl text-sm font-medium text-gray-300 transition-all"
            >
              <Download className="h-4 w-4" />
              Export Report
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 rounded-xl text-sm font-medium text-gray-400 transition-all"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
