import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  AlertTriangle,
  XCircle,
  AlertOctagon,
  ShoppingCart,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Package,
} from 'lucide-react';
import type { ReconciliationResult, ReconciliationItem } from '../../services/inventory/reconciliation';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { useItemStore } from '../../store/useItemStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ebayService } from '../../services/ebayService';
import { toast } from 'sonner';

const db = getFirestore(app);

interface StockReconciliationModalProps {
  open: boolean;
  onClose: () => void;
  result: ReconciliationResult | null;
}

type SectionKey = 'delistNow' | 'oversold' | 'qtyMismatch' | 'shouldList' | 'allGood';

const SECTION_CONFIG: Record<SectionKey, {
  label: string;
  sublabel: string;
  color: string;
  bg: string;
  border: string;
  Icon: any;
}> = {
  delistNow:   { label: 'DELIST NOW',      sublabel: 'Sold out — still listed elsewhere', color: 'text-orange-400', bg: 'bg-orange-900/20', border: 'border-orange-700/40', Icon: AlertOctagon },
  oversold:    { label: 'Oversold',        sublabel: 'Sold more than you had',              color: 'text-red-400',    bg: 'bg-red-900/20',    border: 'border-red-700/40',    Icon: XCircle },
  qtyMismatch: { label: 'Quantity Mismatch', sublabel: 'eBay qty doesn\'t match true stock', color: 'text-yellow-400', bg: 'bg-yellow-900/20', border: 'border-yellow-700/40', Icon: AlertTriangle },
  shouldList:  { label: 'Could Cross-List', sublabel: 'In stock, not on all platforms',     color: 'text-blue-400',   bg: 'bg-blue-900/20',   border: 'border-blue-700/40',   Icon: ShoppingCart },
  allGood:     { label: 'All Good',         sublabel: 'Everything matches',                  color: 'text-green-400',  bg: 'bg-green-900/20',  border: 'border-green-700/40',  Icon: CheckCircle },
};

/**
 * Widget card for a single item — shows per-platform stock vs what it SHOULD be.
 */
function ItemWidgetCard({ ri, onFix, isFixing }: { ri: ReconciliationItem; onFix: (ri: ReconciliationItem) => void; isFixing: boolean }) {
  const item = ri.item;
  const img = item.imageUrl || item.ebayPrimaryImage || item.ebayPhotos?.[0]?.firebaseStorageUrl || item.ebayPhotos?.[0]?.ebayUrl;
  const imgSrc = typeof img === 'string' ? img : undefined;

  // What each platform currently shows vs what it SHOULD be
  const soh = ri.stockOnHand;
  const targetQty = Math.max(0, soh);

  const ebayCurrent = ri.ebayAvailable;
  const poshCurrent = item.poshmarkListingId ? (item.poshmarkQuantity ?? 1) : null;
  const depopCurrent = item.depopListingId ? (item.depopQuantity ?? 1) : null;

  // Where was it sold?
  const soldBreakdown: string[] = [];
  if (ri.poshmarkSales > 0) soldBreakdown.push(`${ri.poshmarkSales} on Poshmark`);
  if (ri.depopSales > 0) soldBreakdown.push(`${ri.depopSales} on Depop`);
  if (ri.inPersonSales > 0) soldBreakdown.push(`${ri.inPersonSales} in-person`);
  if (ri.item.unitSales?.filter(s => s.platform === 'ebay').length) {
    soldBreakdown.push(`${ri.item.unitSales.filter(s => s.platform === 'ebay').length} on eBay`);
  }

  const PlatformCell = ({ label, current, target, bgColor, url }: {
    label: string;
    current: number | null;
    target: number;
    bgColor: string;
    url?: string | null;
  }) => {
    if (current === null) {
      return (
        <div className="flex-1 text-center px-2 py-1.5 rounded bg-gray-800/50 border border-gray-700/50">
          <div className={`text-[10px] font-bold ${bgColor}`}>{label}</div>
          <div className="text-xs text-gray-600 mt-0.5">Not listed</div>
        </div>
      );
    }
    const mismatch = current !== target;
    return (
      <div className={`flex-1 text-center px-2 py-1.5 rounded border ${mismatch ? 'bg-red-900/30 border-red-700/50' : 'bg-gray-800/50 border-gray-700/50'}`}>
        <div className={`text-[10px] font-bold ${bgColor} flex items-center justify-center gap-1`}>
          {label}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
              <ExternalLink className="h-2.5 w-2.5 opacity-60 hover:opacity-100" />
            </a>
          )}
        </div>
        <div className={`text-sm font-semibold mt-0.5 ${mismatch ? 'text-red-300' : 'text-gray-200'}`}>
          {current} {mismatch && <span className="text-red-400 text-[10px]">→ {target}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-3 hover:border-gray-600 transition-colors">
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        {imgSrc ? (
          <img src={imgSrc} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0 bg-gray-800" />
        ) : (
          <div className="w-14 h-14 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
            <Package className="h-5 w-5 text-gray-600" />
          </div>
        )}

        {/* Name + message */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-100 truncate" title={item.name}>
            {item.name}
          </div>
          <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{ri.message}</div>
          {soldBreakdown.length > 0 && (
            <div className="text-[10px] text-gray-500 mt-1">
              Sold: {soldBreakdown.join(' · ')}
            </div>
          )}
        </div>

        {/* SOH badge */}
        <div className={`flex-shrink-0 text-center px-2 py-1 rounded ${soh < 0 ? 'bg-red-900/40 border border-red-700/50' : soh === 0 ? 'bg-orange-900/40 border border-orange-700/50' : 'bg-green-900/40 border border-green-700/50'}`}>
          <div className="text-[9px] text-gray-400 uppercase">Real Stock</div>
          <div className={`text-xl font-bold ${soh < 0 ? 'text-red-300' : soh === 0 ? 'text-orange-300' : 'text-green-300'}`}>
            {soh}
          </div>
        </div>
      </div>

      {/* Per-platform stock row */}
      <div className="flex gap-2 mt-3">
        <PlatformCell
          label="eBay"
          current={ebayCurrent}
          target={targetQty}
          bgColor="text-blue-400"
          url={item.ebayUrl}
        />
        <PlatformCell
          label="Poshmark"
          current={poshCurrent}
          target={targetQty}
          bgColor="text-purple-400"
          url={item.poshmarkUrl}
        />
        <PlatformCell
          label="Depop"
          current={depopCurrent}
          target={targetQty}
          bgColor="text-red-400"
          url={item.depopUrl}
        />
      </div>

      {/* Action button */}
      {ri.suggestedAction && ri.severity !== 'SHOULD_LIST' && ri.severity !== 'ALL_GOOD' && (
        <div className="mt-3 pt-3 border-t border-gray-700/50 flex items-center justify-between gap-2">
          <div className="text-xs text-gray-400 italic">{ri.suggestedAction}</div>
          <Button
            size="sm"
            variant="ghost"
            disabled={isFixing}
            onClick={(e) => { e.stopPropagation(); onFix(ri); }}
            className="flex-shrink-0 text-xs"
          >
            {isFixing ? 'Fixing...' : ri.severity === 'QTY_MISMATCH' ? `Update eBay to ${targetQty}` : 'Fix on eBay'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ReconciliationSection({
  sectionKey,
  items,
  onFixItem,
  fixingIds,
  defaultOpen,
}: {
  sectionKey: SectionKey;
  items: ReconciliationItem[];
  onFixItem: (item: ReconciliationItem) => void;
  fixingIds: Set<string>;
  defaultOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const config = SECTION_CONFIG[sectionKey];
  const { Icon } = config;

  if (items.length === 0) return null;

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${config.color}`} />
          <div className="text-left">
            <div className={`font-bold text-sm ${config.color}`}>{config.label} ({items.length})</div>
            <div className="text-[10px] text-gray-500">{config.sublabel}</div>
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((ri) => (
            <ItemWidgetCard
              key={ri.item.id}
              ri={ri}
              onFix={onFixItem}
              isFixing={fixingIds.has(ri.item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const StockReconciliationModal = ({ open, onClose, result }: StockReconciliationModalProps) => {
  const { initializeStore } = useItemStore();
  const { user } = useAuthStore();
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set());
  const [isBulkFixing, setIsBulkFixing] = useState(false);

  const handleFixItem = async (ri: ReconciliationItem) => {
    setFixingIds(prev => new Set(prev).add(ri.item.id));
    const ebayId = ri.item.ebayListingId || (ri.item as any).ebayItemId;
    try {
      const itemRef = doc(db, 'Item', ri.item.id);
      if (ri.severity === 'QTY_MISMATCH') {
        await updateDoc(itemRef, {
          physicalQuantity: ri.stockOnHand,
          ebayQuantity: ri.stockOnHand,
          stockStatus: ri.stockOnHand <= 0 ? 'SOLD' : ri.stockOnHand <= 2 ? 'LOW_STOCK' : 'IN_STOCK',
          updatedAt: serverTimestamp(),
        });
        if (ebayId) {
          try {
            await ebayService.reviseItemQuantity(ebayId, ri.stockOnHand);
            toast.success(`${ri.item.name}: eBay updated to ${ri.stockOnHand}`);
          } catch (ebayErr) {
            console.error('eBay qty update failed:', ebayErr);
            toast.warning(`${ri.item.name}: local updated but eBay failed`);
          }
        } else {
          toast.success(`Updated ${ri.item.name} to ${ri.stockOnHand}`);
        }
      } else if (ri.severity === 'OVERSOLD' || ri.severity === 'DELIST_NOW') {
        await updateDoc(itemRef, {
          physicalQuantity: 0,
          ebayQuantity: 0,
          stockStatus: 'SOLD',
          status: 'SOLD',
          updatedAt: serverTimestamp(),
        });
        if (ebayId) {
          try {
            await ebayService.endItem(ebayId);
            toast.success(`${ri.item.name}: eBay ended. Delist from Posh/Depop manually.`);
          } catch (ebayErr: any) {
            if (ebayErr?.message?.includes('already been closed')) {
              toast.success(`${ri.item.name}: set to SOLD`);
            } else {
              toast.warning(`${ri.item.name}: local SOLD but eBay end failed`);
            }
          }
        } else {
          toast.success(`Set ${ri.item.name} to SOLD`);
        }
      }
    } catch (err) {
      console.error('Fix error:', err);
      toast.error(`Failed to fix ${ri.item.name}`);
    } finally {
      setFixingIds(prev => { const next = new Set(prev); next.delete(ri.item.id); return next; });
    }
  };

  const handleBulkFix = async () => {
    if (!result || !user) return;
    const toFix = [...result.delistNow, ...result.oversold, ...result.qtyMismatch];
    if (toFix.length === 0) return;

    setIsBulkFixing(true);
    let fixed = 0;
    let ebayUpdated = 0;
    let ebayFailed = 0;

    for (const ri of toFix) {
      try {
        const itemRef = doc(db, 'Item', ri.item.id);
        const newQty = ri.severity === 'QTY_MISMATCH' ? ri.stockOnHand : 0;
        const ebayId = ri.item.ebayListingId || (ri.item as any).ebayItemId;

        await updateDoc(itemRef, {
          physicalQuantity: newQty,
          ebayQuantity: newQty,
          stockStatus: newQty <= 0 ? 'SOLD' : newQty <= 2 ? 'LOW_STOCK' : 'IN_STOCK',
          ...(newQty <= 0 ? { status: 'SOLD' } : {}),
          updatedAt: serverTimestamp(),
        });
        fixed++;

        if (ebayId) {
          try {
            if (newQty <= 0) {
              await ebayService.endItem(ebayId);
            } else {
              await ebayService.reviseItemQuantity(ebayId, newQty);
            }
            ebayUpdated++;
          } catch {
            ebayFailed++;
          }
        }
      } catch { /* continue */ }
    }

    const parts = [`Fixed ${fixed} items`];
    if (ebayUpdated > 0) parts.push(`${ebayUpdated} eBay updated`);
    if (ebayFailed > 0) parts.push(`${ebayFailed} eBay failed`);
    toast.success(parts.join(' · '));
    setIsBulkFixing(false);
    if (user) initializeStore(user.id);
  };

  if (!result) return null;
  const { summary } = result;

  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) onClose(); }} title="Stock Reconciliation" size="full">
      <div className="flex flex-col h-[85vh]">
        {/* Summary bar */}
        <div className="flex-shrink-0 pb-4 border-b border-gray-700">
          <div className="flex items-center gap-4 flex-wrap mb-3">
            <div className="text-sm">
              <span className="text-gray-400">Total:</span>{' '}
              <span className="text-white font-semibold">{summary.total} items</span>
            </div>
            {summary.delistCount > 0 && (
              <div className="px-2 py-1 rounded bg-orange-900/30 border border-orange-700/40">
                <span className="text-orange-400 font-semibold text-xs">⚠ {summary.delistCount} need delisting</span>
              </div>
            )}
            {summary.oversoldCount > 0 && (
              <div className="px-2 py-1 rounded bg-red-900/30 border border-red-700/40">
                <span className="text-red-400 font-semibold text-xs">✕ {summary.oversoldCount} oversold</span>
              </div>
            )}
            {summary.mismatchCount > 0 && (
              <div className="px-2 py-1 rounded bg-yellow-900/30 border border-yellow-700/40">
                <span className="text-yellow-400 font-semibold text-xs">⚠ {summary.mismatchCount} mismatched</span>
              </div>
            )}
            {summary.shouldListCount > 0 && (
              <div className="px-2 py-1 rounded bg-blue-900/30 border border-blue-700/40">
                <span className="text-blue-400 font-semibold text-xs">+ {summary.shouldListCount} could cross-list</span>
              </div>
            )}
            <div className="px-2 py-1 rounded bg-green-900/30 border border-green-700/40">
              <span className="text-green-400 font-semibold text-xs">✓ {summary.allGoodCount} all good</span>
            </div>
          </div>

          {summary.issues > 0 && (
            <Button
              onClick={handleBulkFix}
              disabled={isBulkFixing}
              loading={isBulkFixing}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Fix All Issues on eBay ({summary.issues})
            </Button>
          )}
        </div>

        {/* Sections — DELIST NOW first (most urgent), then cascade down */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          <ReconciliationSection sectionKey="delistNow"    items={result.delistNow}    onFixItem={handleFixItem} fixingIds={fixingIds} defaultOpen={true} />
          <ReconciliationSection sectionKey="oversold"     items={result.oversold}     onFixItem={handleFixItem} fixingIds={fixingIds} defaultOpen={true} />
          <ReconciliationSection sectionKey="qtyMismatch"  items={result.qtyMismatch}  onFixItem={handleFixItem} fixingIds={fixingIds} defaultOpen={true} />
          <ReconciliationSection sectionKey="shouldList"   items={result.shouldList}   onFixItem={handleFixItem} fixingIds={fixingIds} defaultOpen={false} />
          <ReconciliationSection sectionKey="allGood"      items={result.allGood}      onFixItem={handleFixItem} fixingIds={fixingIds} defaultOpen={false} />

          {summary.total === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
              <CheckCircle className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-lg">No eBay items to reconcile</p>
              <p className="text-sm mt-1">Run Sync Stock first to get eBay data</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
