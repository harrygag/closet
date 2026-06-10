import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  X,
  Download,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Package,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useItemStore } from '../../store/useItemStore';
import { useAuthStore } from '../../store/useAuthStore';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import type { Item } from '../../types/item';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StockCheckWidgetProps {
  className?: string;
}

type ActiveTab = 'Depop' | 'Poshmark';

interface MarketplaceItem {
  sku: string;
  title: string;
  quantity: number;
  price: number;
  status: string;
  listingId?: string;
}

interface ReconciliationResult {
  soldOnMarketplace: Array<{ local: Item; marketplace: MarketplaceItem }>;
  quantityMismatch: Array<{ local: Item; marketplace: MarketplaceItem }>;
  notListed: Item[];
  matched: Array<{ local: Item; marketplace: MarketplaceItem }>;
}

// ---------------------------------------------------------------------------
// Pure helpers — replicated from StockCheckModal (not imported)
// ---------------------------------------------------------------------------

function parseCSV(content: string): MarketplaceItem[] {
  const lines = content.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const marketplaceItems: MarketplaceItem[] = [];

  const skuIndex = headers.findIndex((h) => h.includes('sku') || h.includes('custom label'));
  const titleIndex = headers.findIndex(
    (h) => h.includes('title') || h.includes('name') || h.includes('item')
  );
  const quantityIndex = headers.findIndex(
    (h) => h.includes('quantity') || h.includes('qty') || h.includes('available')
  );
  const priceIndex = headers.findIndex((h) => h.includes('price') || h.includes('cost'));
  const statusIndex = headers.findIndex((h) => h.includes('status') || h.includes('state'));
  const listingIdIndex = headers.findIndex(
    (h) =>
      h.includes('item id') || h.includes('listing id') || h.includes('item number')
  );

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    if (values.length < headers.length) continue;

    const item: MarketplaceItem = {
      sku: skuIndex >= 0 ? values[skuIndex] : '',
      title: titleIndex >= 0 ? values[titleIndex] : '',
      quantity: quantityIndex >= 0 ? parseInt(values[quantityIndex]) || 0 : 1,
      price:
        priceIndex >= 0
          ? parseFloat(values[priceIndex].replace(/[^0-9.]/g, '')) || 0
          : 0,
      status: statusIndex >= 0 ? values[statusIndex].toLowerCase() : 'active',
      listingId: listingIdIndex >= 0 ? values[listingIdIndex] : undefined,
    };

    if (item.sku || item.title) {
      marketplaceItems.push(item);
    }
  }

  return marketplaceItems;
}

function reconcileInventory(
  marketplaceItems: MarketplaceItem[],
  localItems: Item[]
): ReconciliationResult {
  const result: ReconciliationResult = {
    soldOnMarketplace: [],
    quantityMismatch: [],
    notListed: [],
    matched: [],
  };

  const marketplaceMap = new Map<string, MarketplaceItem>();
  marketplaceItems.forEach((mi) => {
    const key = mi.sku || mi.title.toLowerCase();
    marketplaceMap.set(key, mi);
  });

  const localItemGroups = new Map<string, Item[]>();

  // First pass: match local items to marketplace entries
  for (const localItem of localItems) {
    const searchKey =
      localItem.ebaySku || localItem.barcode || localItem.name.toLowerCase();
    let marketplaceItem = marketplaceMap.get(searchKey);

    // Fuzzy title fallback
    if (!marketplaceItem) {
      for (const [, mi] of marketplaceMap.entries()) {
        if (
          mi.title.toLowerCase().includes(localItem.name.toLowerCase()) ||
          localItem.name.toLowerCase().includes(mi.title.toLowerCase())
        ) {
          marketplaceItem = mi;
          break;
        }
      }
    }

    if (marketplaceItem) {
      const groupKey = marketplaceItem.sku || marketplaceItem.title.toLowerCase();
      if (!localItemGroups.has(groupKey)) {
        localItemGroups.set(groupKey, []);
      }
      localItemGroups.get(groupKey)!.push(localItem);
    } else {
      // In inventory but not found in CSV
      if (localItem.status === 'Active') {
        result.notListed.push(localItem);
      }
    }
  }

  // Second pass: reconcile grouped items with marketplace quantities
  for (const [groupKey, groupedLocalItems] of localItemGroups.entries()) {
    const marketplaceItem = marketplaceMap.get(groupKey);
    if (!marketplaceItem) continue;

    const activeLocalItems = groupedLocalItems.filter((i) => i.status === 'Active');
    const localQuantity = activeLocalItems.length;
    const marketplaceQuantity = marketplaceItem.quantity;

    if (marketplaceQuantity === 0 && localQuantity > 0) {
      // Sold on marketplace but still active locally
      activeLocalItems.forEach((item) => {
        result.soldOnMarketplace.push({ local: item, marketplace: marketplaceItem });
      });
    } else if (marketplaceQuantity > 0) {
      if (localQuantity !== marketplaceQuantity) {
        result.quantityMismatch.push({
          local: {
            ...groupedLocalItems[0],
            name: `${groupedLocalItems[0].name} (${localQuantity} local vs ${marketplaceQuantity} marketplace)`,
          },
          marketplace: marketplaceItem,
        });
      } else {
        result.matched.push({ local: groupedLocalItems[0], marketplace: marketplaceItem });
      }
    }
  }

  return result;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StockCheckWidget: React.FC<StockCheckWidgetProps> = ({ className }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('Depop');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanSession, setScanSession] = useState<Record<string, number>>({});
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // Collapsed state per category — Sold and Mismatch open by default
  const [soldOpen, setSoldOpen] = useState(true);
  const [mismatchOpen, setMismatchOpen] = useState(true);
  const [notListedOpen, setNotListedOpen] = useState(false);
  const [matchedOpen, setMatchedOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { items } = useItemStore();
  const { user } = useAuthStore();

  // Load scan session on mount
  useEffect(() => {
    if (!user?.id) {
      setSessionLoaded(true);
      return;
    }
    const db = getFirestore(app);
    getDoc(doc(db, 'scanSessions', user.id))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as {
            entries?: Record<string, { id: string; name: string; size: string; count: number }>;
          };
          if (data.entries && Object.keys(data.entries).length > 0) {
            const counts: Record<string, number> = {};
            for (const [itemId, entry] of Object.entries(data.entries)) {
              counts[itemId] = entry.count;
            }
            setScanSession(counts);
          } else {
            setScanSession({});
          }
        } else {
          setScanSession({});
        }
        setSessionLoaded(true);
      })
      .catch(() => {
        setScanSession({});
        setSessionLoaded(true);
      });
  }, [user?.id]);

  // Jersey filter: active, tagged Jersey, condition not used
  const hasScanSession = Object.keys(scanSession).length > 0;
  const jerseyItems = items.filter(
    (item) =>
      item.tags.includes('Jersey') &&
      item.status !== 'SOLD' &&
      (item.ebayCondition === undefined ||
        !item.ebayCondition.toLowerCase().includes('used')) &&
      (!hasScanSession || item.id in scanSession)
  );

  // When tab changes, clear results and file
  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    setFile(null);
    setResult(null);
  }, []);

  const processFile = useCallback(
    async (f: File) => {
      if (!f.name.endsWith('.csv')) {
        toast.error('Please upload a CSV file');
        return;
      }
      setFile(f);
      setIsProcessing(true);
      try {
        const content = await readFileAsText(f);
        const parsed = parseCSV(content);
        if (parsed.length === 0) {
          toast.error(`No items found in ${activeTab} CSV`);
          setIsProcessing(false);
          return;
        }
        const reconciled = reconcileInventory(parsed, jerseyItems);
        setResult(reconciled);
        toast.success(`${activeTab} CSV parsed — ${parsed.length} marketplace items`);
      } catch (err) {
        console.error('StockCheckWidget parse error:', err);
        toast.error('Failed to process CSV');
      } finally {
        setIsProcessing(false);
      }
    },
    [activeTab, jerseyItems]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) processFile(dropped);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) processFile(selected);
      // Reset input so the same file can be re-uploaded after reset
      e.target.value = '';
    },
    [processFile]
  );

  const handleReset = useCallback(() => {
    setFile(null);
    setResult(null);
    setIsDragging(false);
  }, []);

  // Export mismatches as CSV
  const handleExport = useCallback(() => {
    if (!result) return;
    const mismatchItems = [
      ...result.soldOnMarketplace.map(({ local }) => ({
        Platform: activeTab,
        Category: 'Sold on Marketplace',
        'Item Name': local.name,
        Size: local.size,
        SKU: local.ebaySku || local.barcode || '-',
        Issue: `Marketplace qty 0 — still active locally`,
      })),
      ...result.quantityMismatch.map(({ local, marketplace }) => ({
        Platform: activeTab,
        Category: 'Quantity Mismatch',
        'Item Name': local.name,
        Size: local.size,
        SKU: local.ebaySku || local.barcode || '-',
        Issue: `Local vs marketplace quantity differs (marketplace qty: ${marketplace.quantity})`,
      })),
      ...result.notListed.map((item) => ({
        Platform: activeTab,
        Category: 'Not Listed',
        'Item Name': item.name,
        Size: item.size,
        SKU: item.ebaySku || item.barcode || '-',
        Issue: 'In inventory but not found in CSV',
      })),
    ];

    if (mismatchItems.length === 0) {
      toast.error('No mismatches to export');
      return;
    }

    const headers = ['Platform', 'Category', 'Item Name', 'Size', 'SKU', 'Issue'];
    const rows = mismatchItems.map((row) =>
      headers.map((h) => `"${row[h as keyof typeof row] ?? ''}"`).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-check-${activeTab.toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export ready');
  }, [result, activeTab]);

  // ---------------------------------------------------------------------------
  // Derived counts
  // ---------------------------------------------------------------------------

  const soldCount = result?.soldOnMarketplace.length ?? 0;
  const mismatchCount = result?.quantityMismatch.length ?? 0;
  const notListedCount = result?.notListed.length ?? 0;
  const matchedCount = result?.matched.length ?? 0;

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const tabColor = activeTab === 'Depop' ? '#FF2D55' : '#D63229';

  const glassCard =
    'bg-white/[0.02] backdrop-blur-[40px] rounded-3xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] p-5';

  const renderRow = (
    key: string,
    name: string,
    size: string,
    sku: string,
    badgeLabel: string,
    badgeClass: string
  ) => (
    <div key={key} className="flex items-start justify-between gap-2 py-2 border-b border-white/5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white truncate">{name}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {size && <span className="mr-2">Size: {size}</span>}
          <span>SKU: {sku}</span>
        </p>
      </div>
      <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
        {badgeLabel}
      </span>
    </div>
  );

  const renderSection = (
    label: string,
    count: number,
    isOpen: boolean,
    onToggle: () => void,
    pillClass: string,
    children: React.ReactNode
  ) => (
    <div className="border border-white/10 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-xs font-semibold text-white">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pillClass}`}>
            {count}
          </span>
          <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
        </div>
      </button>
      {isOpen && count > 0 && (
        <div className="px-4 pb-3">{children}</div>
      )}
      {isOpen && count === 0 && (
        <p className="px-4 pb-3 text-[11px] text-gray-600">No items in this category.</p>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className={`${glassCard} ${className ?? ''}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-semibold text-white">Stock Check</span>
          {sessionLoaded && (
            <span className="text-[11px] text-gray-600 ml-1">
              {hasScanSession
                ? `${Object.keys(scanSession).length} scanned`
                : `${jerseyItems.length} jerseys`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <>
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors"
                aria-label="Export mismatches"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-white transition-colors"
                aria-label="Reset"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reset
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-4">
        {(['Depop', 'Poshmark'] as ActiveTab[]).map((tab) => {
          const isActive = activeTab === tab;
          const color = tab === 'Depop' ? '#FF2D55' : '#D63229';
          return (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              style={isActive ? { borderBottomColor: color } : undefined}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? 'text-white border-b-2'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Upload zone */}
      {!file && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-white/30 bg-white/[0.04]'
              : 'border-white/10 hover:border-white/20'
          }`}
        >
          <Upload
            className="h-6 w-6 mx-auto mb-2"
            style={{ color: isDragging ? tabColor : '#6b7280' }}
          />
          <p className="text-xs text-gray-400 mb-1">
            {isDragging ? `Drop ${activeTab} CSV here` : `Drag & drop or click to upload`}
          </p>
          <p className="text-[11px] text-gray-600">{activeTab} CSV export</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}

      {/* File loaded — show name + clear */}
      {file && !isProcessing && (
        <div className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: tabColor }} />
            <span className="text-xs text-gray-300 truncate">{file.name}</span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-gray-600 hover:text-white transition-colors ml-2 shrink-0"
            aria-label="Clear file"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-2 py-4 justify-center">
          <RefreshCw className="h-4 w-4 text-gray-400 animate-spin" />
          <span className="text-xs text-gray-400">Parsing CSV…</span>
        </div>
      )}

      {/* Results */}
      {result && !isProcessing && (
        <div className="mt-4 space-y-3">
          {/* Summary pills */}
          <div className="flex flex-wrap gap-2 mb-2">
            <span className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
              <XCircle className="h-3 w-3" />
              {soldCount} Sold
            </span>
            <span className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
              <AlertTriangle className="h-3 w-3" />
              {mismatchCount} Mismatch
            </span>
            <span className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
              <Package className="h-3 w-3" />
              {notListedCount} Not Listed
            </span>
            <span className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
              <CheckCircle className="h-3 w-3" />
              {matchedCount} Matched
            </span>
          </div>

          {/* Sold on Marketplace */}
          {renderSection(
            'Sold on Marketplace',
            soldCount,
            soldOpen,
            () => setSoldOpen((v) => !v),
            'bg-red-500/20 text-red-400',
            result.soldOnMarketplace.map(({ local }) =>
              renderRow(
                local.id,
                local.name,
                local.size,
                local.ebaySku || local.barcode || '-',
                'Qty 0',
                'bg-red-500/20 text-red-400'
              )
            )
          )}

          {/* Quantity Mismatch */}
          {renderSection(
            'Quantity Mismatch',
            mismatchCount,
            mismatchOpen,
            () => setMismatchOpen((v) => !v),
            'bg-yellow-500/20 text-yellow-400',
            result.quantityMismatch.map(({ local, marketplace }) =>
              renderRow(
                local.id,
                local.name,
                local.size,
                local.ebaySku || local.barcode || '-',
                `Mktpl: ${marketplace.quantity}`,
                'bg-yellow-500/20 text-yellow-400'
              )
            )
          )}

          {/* Not Listed */}
          {renderSection(
            'Not Listed',
            notListedCount,
            notListedOpen,
            () => setNotListedOpen((v) => !v),
            'bg-blue-500/20 text-blue-400',
            <>
              {result.notListed.slice(0, 20).map((item) =>
                renderRow(
                  item.id,
                  item.name,
                  item.size,
                  item.ebaySku || item.barcode || '-',
                  'Not Listed',
                  'bg-blue-500/20 text-blue-400'
                )
              )}
              {notListedCount > 20 && (
                <p className="text-[11px] text-gray-600 pt-2 text-center">
                  …and {notListedCount - 20} more
                </p>
              )}
            </>
          )}

          {/* Matched */}
          {renderSection(
            'Matched',
            matchedCount,
            matchedOpen,
            () => setMatchedOpen((v) => !v),
            'bg-green-500/20 text-green-400',
            result.matched.map(({ local }) =>
              renderRow(
                local.id,
                local.name,
                local.size,
                local.ebaySku || local.barcode || '-',
                'Matched',
                'bg-green-500/20 text-green-400'
              )
            )
          )}
        </div>
      )}
    </div>
  );
};
