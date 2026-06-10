import React, { useState, useCallback, useEffect } from 'react';
import { Upload, X, CheckCircle, AlertTriangle, XCircle, Download, Package } from 'lucide-react';
import { Button } from './ui/Button';
import { toast } from 'sonner';
import { useItemStore } from '../store/useItemStore';
import { useAuthStore } from '../store/useAuthStore';
import { getFirestore, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import type { Item } from '../types/item';
import { recordSale } from '../services/saleService';

interface StockCheckModalProps {
  open: boolean;
  onClose: () => void;
}

interface MarketplaceItem {
  sku: string;
  title: string;
  quantity: number;
  price: number;
  status: string;
  listingId?: string;
}

interface ReconciliationResult {
  // Items sold on marketplace but still Active locally
  soldOnMarketplace: Array<{ local: Item; marketplace: MarketplaceItem }>;

  // Items in marketplace but missing from physical inventory
  missingPhysically: Array<{ marketplace: MarketplaceItem; local?: Item }>;

  // Items in inventory but not on marketplace
  notListed: Item[];

  // Items with quantity mismatches
  quantityMismatch: Array<{ local: Item; marketplace: MarketplaceItem }>;

  // Everything matches
  matched: Array<{ local: Item; marketplace: MarketplaceItem }>;
}

type Platform = 'eBay' | 'Poshmark' | 'Depop';

interface PlatformResult {
  platform: Platform;
  result: ReconciliationResult;
  itemCount: number;
}

export const StockCheckModal: React.FC<StockCheckModalProps> = ({ open, onClose }) => {
  const [isDragging, setIsDragging] = useState<Platform | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [scanSession, setScanSession] = useState<Record<string, number>>({});
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const [ebayFile, setEbayFile] = useState<File | null>(null);
  const [poshmarkFile, setPoshmarkFile] = useState<File | null>(null);
  const [depopFile, setDepopFile] = useState<File | null>(null);


  const [platformResults, setPlatformResults] = useState<PlatformResult[]>([]);
  const [flaggedItems, setFlaggedItems] = useState<Set<string>>(new Set());

  const { items } = useItemStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (!open || !user?.id) return;

    const db = getFirestore(app);
    getDoc(doc(db, 'scanSessions', user.id))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as { entries?: Record<string, { id: string; name: string; size: string; count: number }> };
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
  }, [open, user?.id]);

  // Jersey filter: only new jerseys (not SOLD, tagged Jersey, condition not 'used')
  // Also filter to scanned items when a scan session is active.
  const hasScanSession = Object.keys(scanSession).length > 0;
  const jerseyItems = items.filter(
    (item) =>
      item.tags.includes('Jersey') &&
      item.status !== 'SOLD' &&
      (item.ebayCondition === undefined ||
        !item.ebayCondition.toLowerCase().includes('used')) &&
      (!hasScanSession || item.id in scanSession)
  );

  const parseCSV = (content: string): MarketplaceItem[] => {
    const lines = content.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const marketplaceItems: MarketplaceItem[] = [];

    // Find column indices (support various CSV formats)
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
  };

  // Accepts an optional filtered local items array; falls back to store items
  const reconcileInventory = (
    marketplaceItems: MarketplaceItem[],
    localItems: Item[] = items
  ): ReconciliationResult => {
    const result: ReconciliationResult = {
      soldOnMarketplace: [],
      missingPhysically: [],
      notListed: [],
      quantityMismatch: [],
      matched: [],
    };

    const marketplaceMap = new Map<string, MarketplaceItem>();
    marketplaceItems.forEach((mi) => {
      const searchKey = mi.sku || mi.title.toLowerCase();
      marketplaceMap.set(searchKey, mi);
    });

    // Group local items by marketplace listing (for multi-quantity support)
    const localItemGroups = new Map<string, Item[]>();
    const processedLocalItems = new Set<string>();

    // First pass: match and group local items by marketplace listing
    for (const localItem of localItems) {
      const searchKey =
        localItem.ebaySku || localItem.barcode || localItem.name.toLowerCase();
      let marketplaceItem = marketplaceMap.get(searchKey);

      // Try fuzzy match if no exact match
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
        processedLocalItems.add(localItem.id);
      } else {
        // Item in local inventory but not on marketplace
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

      // Check if sold on marketplace (marketplace qty = 0) but still active locally
      if (marketplaceQuantity === 0 && localQuantity > 0) {
        activeLocalItems.forEach((item) => {
          result.soldOnMarketplace.push({ local: item, marketplace: marketplaceItem });
        });
      }
      // Check if missing from physical inventory (not scanned recently)
      else if (marketplaceQuantity > 0) {
        const scannedItems = groupedLocalItems.filter((i) => i.lastScannedDate);
        const unscannedItems = groupedLocalItems.filter((i) => !i.lastScannedDate);

        // If we have unscanned items, mark them as potentially missing
        if (unscannedItems.length > 0) {
          unscannedItems.forEach((item) => {
            result.missingPhysically.push({ marketplace: marketplaceItem, local: item });
          });
        }

        // Check quantity mismatch
        if (localQuantity !== marketplaceQuantity) {
          // Report mismatch on first item of the group
          result.quantityMismatch.push({
            local: {
              ...groupedLocalItems[0],
              name: `${groupedLocalItems[0].name} (${localQuantity} local vs ${marketplaceQuantity} marketplace)`,
            },
            marketplace: marketplaceItem,
          });
        } else if (scannedItems.length === localQuantity) {
          // Everything matches and all scanned
          result.matched.push({ local: groupedLocalItems[0], marketplace: marketplaceItem });
        }
      }
    }

    // Check marketplace items not in local inventory
    for (const [groupKey, marketplaceItem] of marketplaceMap.entries()) {
      if (!localItemGroups.has(groupKey) && marketplaceItem.quantity > 0) {
        result.missingPhysically.push({ marketplace: marketplaceItem });
      }
    }

    return result;
  };

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });

  const handleAnalyze = useCallback(async () => {
    if (!ebayFile && !poshmarkFile && !depopFile) return;

    setIsProcessing(true);
    try {
      const results: PlatformResult[] = [];

      const platforms: Array<{ platform: Platform; file: File | null }> = [
        { platform: 'eBay', file: ebayFile },
        { platform: 'Poshmark', file: poshmarkFile },
        { platform: 'Depop', file: depopFile },
      ];

      for (const { platform, file } of platforms) {
        if (!file) continue;
        const content = await readFileAsText(file);
        const parsed = parseCSV(content);
        if (parsed.length === 0) {
          toast.error(`No items found in ${platform} CSV`);
          continue;
        }
        const result = reconcileInventory(parsed, jerseyItems);
        results.push({ platform, result, itemCount: parsed.length });
      }

      if (results.length === 0) {
        toast.error('No valid data found in any uploaded CSV');
        setIsProcessing(false);
        return;
      }

      setPlatformResults(results);
      toast.success(
        `Analysis complete across ${results.length} platform${results.length > 1 ? 's' : ''}`
      );
      setStep(2);
    } catch (error) {
      console.error('Error during analysis:', error);
      toast.error('Failed to process CSV files');
    } finally {
      setIsProcessing(false);
    }
  }, [ebayFile, poshmarkFile, depopFile, jerseyItems]);

  const handlePlatformFile = useCallback(
    (platform: Platform, file: File | null) => {
      // null means clear the slot
      if (file === null) {
        if (platform === 'eBay') { setEbayFile(null); }
        else if (platform === 'Poshmark') { setPoshmarkFile(null); }
        else { setDepopFile(null); }
        return;
      }
      if (!file.name.endsWith('.csv')) {
        toast.error('Please upload a CSV file');
        return;
      }
      if (platform === 'eBay') {
        setEbayFile(file);
      } else if (platform === 'Poshmark') {
        setPoshmarkFile(file);
      } else {
        setDepopFile(file);
      }
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, platform: Platform) => {
      e.preventDefault();
      setIsDragging(null);
      const file = e.dataTransfer.files[0];
      handlePlatformFile(platform, file ?? null);
    },
    [handlePlatformFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, platform: Platform) => {
      const file = e.target.files?.[0] ?? null;
      handlePlatformFile(platform, file);
    },
    [handlePlatformFile]
  );

  const toggleFlag = useCallback((key: string) => {
    setFlaggedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const getFlagKey = (item: Item | MarketplaceItem): string => {
    if ('ebaySku' in item) {
      return (item as Item).ebaySku || (item as Item).barcode || item.name;
    }
    return (item as MarketplaceItem).sku || (item as MarketplaceItem).title;
  };

  const allSoldItems = platformResults.flatMap((pr) =>
    pr.result.soldOnMarketplace.map(({ local }) => ({ local, platform: pr.platform }))
  );

  const handleMarkAsSold = async (itemsToUpdate: Array<{ local: Item; platform?: string }>) => {
    const db = getFirestore(app);
    let successCount = 0;

    for (const { local, platform } of itemsToUpdate) {
      try {
        await updateDoc(doc(db, 'Item', local.id), {
          status: 'SOLD',
          updatedAt: serverTimestamp(),
        });

        // Record sale so it shows up on Sales page
        if (user) {
          const marketplaceMap: Record<string, 'ebay' | 'poshmark' | 'depop'> = {
            'eBay': 'ebay', 'Poshmark': 'poshmark', 'Depop': 'depop',
          };
          await recordSale({
            userId: user.id,
            itemId: local.id,
            itemName: local.name,
            itemImageUrl: local.imageUrl,
            salePrice: (local as any).manualPriceCents || local.sellingPrice || 0,
            costPrice: local.costPrice || 0,
            marketplace: marketplaceMap[platform || ''] || 'ebay',
            saleSource: 'stock_check',
            notes: 'Detected via stock check reconciliation',
          });
        }

        successCount++;
      } catch (error) {
        console.error(`Failed to update ${local.name}:`, error);
      }
    }

    toast.success(`Marked ${successCount} items as SOLD`);
    setTimeout(() => window.location.reload(), 2000);
  };

  // Build rows from all platforms with a Platform column prepended
  type AuditRow = {
    platform: string;
    category: string;
    itemName: string;
    sku: string;
    localStatus: string;
    marketplaceStatus: string;
    issue: string;
    flagKey: string;
  };

  const buildAuditRows = (): AuditRow[] => {
    const rows: AuditRow[] = [];

    for (const { platform, result } of platformResults) {
      result.soldOnMarketplace.forEach(({ local, marketplace }) => {
        rows.push({
          platform,
          category: 'Sold on Marketplace',
          itemName: local.name,
          sku: local.ebaySku || local.barcode || '-',
          localStatus: local.status,
          marketplaceStatus: `Qty: ${marketplace.quantity}`,
          issue: 'Update local status to SOLD',
          flagKey: getFlagKey(local),
        });
      });

      result.missingPhysically.forEach(({ marketplace, local }) => {
        rows.push({
          platform,
          category: 'Missing Physically',
          itemName: local?.name || marketplace.title,
          sku: marketplace.sku || '-',
          localStatus: local?.status || 'Not in system',
          marketplaceStatus: `Listed (Qty: ${marketplace.quantity})`,
          issue: 'Item listed but not scanned/found',
          flagKey: getFlagKey(marketplace),
        });
      });

      result.notListed.forEach((item) => {
        rows.push({
          platform,
          category: 'Not Listed',
          itemName: item.name,
          sku: item.ebaySku || item.barcode || '-',
          localStatus: item.status,
          marketplaceStatus: 'Not on marketplace',
          issue: 'Consider listing this item',
          flagKey: getFlagKey(item),
        });
      });

      result.quantityMismatch.forEach(({ local, marketplace }) => {
        rows.push({
          platform,
          category: 'Quantity Mismatch',
          itemName: local.name,
          sku: local.ebaySku || local.barcode || '-',
          localStatus: local.status,
          marketplaceStatus: `Marketplace Qty: ${marketplace.quantity}`,
          issue: 'Quantity discrepancy',
          flagKey: getFlagKey(local),
        });
      });
    }

    return rows;
  };

  const exportRows = (rows: AuditRow[], filename: string) => {
    const headers = [
      'Platform',
      'Category',
      'Item Name',
      'SKU',
      'Local Status',
      'Marketplace Status',
      'Issue',
    ];
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        [
          row.platform,
          row.category,
          row.itemName,
          row.sku,
          row.localStatus,
          row.marketplaceStatus,
          row.issue,
        ]
          .map((field) => `"${field}"`)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export ready');
  };

  const handleExportAudit = () => {
    const rows = buildAuditRows();
    if (rows.length === 0) {
      toast.error('No mismatch rows to export');
      return;
    }
    exportRows(rows, `jersey-audit-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handleExportFlagged = () => {
    const rows = buildAuditRows().filter((r) => flaggedItems.has(r.flagKey));
    if (rows.length === 0) {
      toast.error('No flagged rows to export');
      return;
    }
    exportRows(
      rows,
      `jersey-audit-flagged-${new Date().toISOString().split('T')[0]}.csv`
    );
  };

  const resetToStep1 = () => {
    setStep(1);
    setEbayFile(null);
    setPoshmarkFile(null);
    setDepopFile(null);
    setPlatformResults([]);
    setFlaggedItems(new Set());
    setIsDragging(null);
    setScanSession({});
    setSessionLoaded(false);
  };

  if (!open) return null;

  const hasAtLeastOneFile = ebayFile !== null || poshmarkFile !== null || depopFile !== null;

  const platformColors: Record<Platform, { bg: string; border: string; text: string; badge: string }> = {
    eBay: {
      bg: 'bg-blue-900/10',
      border: 'border-blue-700/30',
      text: 'text-blue-300',
      badge: 'bg-blue-900/30 text-blue-300',
    },
    Poshmark: {
      bg: 'bg-pink-900/10',
      border: 'border-pink-700/30',
      text: 'text-pink-300',
      badge: 'bg-pink-900/30 text-pink-300',
    },
    Depop: {
      bg: 'bg-red-900/10',
      border: 'border-red-700/30',
      text: 'text-red-300',
      badge: 'bg-red-900/30 text-red-300',
    },
  };

  const renderDropZone = (platform: Platform, file: File | null) => {
    const isOver = isDragging === platform;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-gray-300">{platform} CSV</p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(platform);
          }}
          onDragLeave={() => setIsDragging(null)}
          onDrop={(e) => handleDrop(e, platform)}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
            isOver
              ? 'border-blue-500 bg-blue-500/10'
              : file
              ? 'border-green-600/50 bg-green-900/10'
              : 'border-gray-700 bg-gray-800/50'
          }`}
        >
          {file ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                <span className="text-xs text-green-300 truncate">{file.name}</span>
              </div>
              <button
                onClick={() => handlePlatformFile(platform, null)}
                className="text-gray-500 hover:text-white shrink-0"
                aria-label={`Remove ${platform} file`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload
                className={`h-8 w-8 mx-auto mb-2 ${isOver ? 'text-blue-400' : 'text-gray-600'}`}
              />
              <p className="text-xs text-gray-400 mb-2">
                {isOver ? 'Drop CSV here' : 'Drag & drop or browse'}
              </p>
              <label className="inline-block">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileInput(e, platform)}
                  className="hidden"
                  disabled={isProcessing}
                />
                <span className="inline-flex items-center justify-center px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors">
                  Browse
                </span>
              </label>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderMismatchRow = (
    key: React.Key,
    itemName: string,
    sku: string,
    badgeLabel: string,
    badgeClass: string,
    flagKey: string,
    extra?: React.ReactNode
  ) => {
    const isFlagged = flaggedItems.has(flagKey);
    return (
      <div key={key} className="bg-gray-800/50 rounded p-2 text-xs">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isFlagged && (
                <span
                  className="inline-block w-2 h-2 rounded-full bg-orange-400 shrink-0"
                  aria-label="Flagged"
                />
              )}
              <p className="font-medium text-white truncate">{itemName}</p>
            </div>
            <p className="text-gray-400">SKU: {sku}</p>
            {extra}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2 py-0.5 rounded text-[10px] ${badgeClass}`}>
              {badgeLabel}
            </span>
            <button
              onClick={() => toggleFlag(flagKey)}
              className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                isFlagged
                  ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                  : 'border-gray-600 text-gray-400 hover:border-orange-500 hover:text-orange-300'
              }`}
            >
              {isFlagged ? 'Unflag' : 'Flag'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPlatformResults = (pr: PlatformResult) => {
    const { platform, result } = pr;
    const c = platformColors[platform];
    const totalMismatches =
      result.soldOnMarketplace.length +
      result.missingPhysically.length +
      result.quantityMismatch.length;

    return (
      <div key={platform} className={`${c.bg} border ${c.border} rounded-xl p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className={`font-semibold text-sm ${c.text}`}>{platform}</h3>
          <div className="flex gap-3 text-xs text-gray-400">
            <span>{pr.itemCount} marketplace items</span>
            <span>{totalMismatches} mismatch{totalMismatches !== 1 ? 'es' : ''}</span>
            <span className="text-green-400">{result.matched.length} matched</span>
          </div>
        </div>

        {/* Sold on marketplace */}
        {result.soldOnMarketplace.length > 0 && (
          <details open className="bg-red-900/10 border border-red-700/30 rounded-lg">
            <summary className="p-3 cursor-pointer font-semibold text-red-300 text-xs">
              Sold on Marketplace ({result.soldOnMarketplace.length})
            </summary>
            <div className="p-3 pt-0 space-y-2">
              {result.soldOnMarketplace.map(({ local }, i) =>
                renderMismatchRow(
                  i,
                  local.name,
                  local.ebaySku || local.barcode || '-',
                  'Qty 0 on marketplace',
                  'bg-red-900/30 text-red-300',
                  getFlagKey(local)
                )
              )}
            </div>
          </details>
        )}

        {/* Missing physically */}
        {result.missingPhysically.length > 0 && (
          <details className="bg-yellow-900/10 border border-yellow-700/30 rounded-lg">
            <summary className="p-3 cursor-pointer font-semibold text-yellow-300 text-xs">
              Missing from Physical Inventory ({result.missingPhysically.length})
            </summary>
            <div className="p-3 pt-0 space-y-2">
              {result.missingPhysically.map(({ marketplace, local }, i) =>
                renderMismatchRow(
                  i,
                  local?.name || marketplace.title,
                  marketplace.sku || '-',
                  `Listed (Qty ${marketplace.quantity})`,
                  'bg-yellow-900/30 text-yellow-300',
                  getFlagKey(marketplace),
                  local?.lastScannedDate ? (
                    <p className="text-gray-500 text-[10px]">
                      Last scanned:{' '}
                      {new Date(local.lastScannedDate).toLocaleDateString()}
                    </p>
                  ) : (
                    <p className="text-gray-500 text-[10px]">Never scanned</p>
                  )
                )
              )}
            </div>
          </details>
        )}

        {/* Not listed */}
        {result.notListed.length > 0 && (
          <details className="bg-blue-900/10 border border-blue-700/30 rounded-lg">
            <summary className="p-3 cursor-pointer font-semibold text-blue-300 text-xs">
              In Inventory but Not Listed ({result.notListed.length})
            </summary>
            <div className="p-3 pt-0 space-y-2">
              {result.notListed.slice(0, 20).map((item, i) =>
                renderMismatchRow(
                  i,
                  item.name,
                  item.ebaySku || item.barcode || '-',
                  'Not on marketplace',
                  'bg-blue-900/30 text-blue-300',
                  getFlagKey(item)
                )
              )}
              {result.notListed.length > 20 && (
                <p className="text-gray-500 text-center text-[10px]">
                  ...and {result.notListed.length - 20} more
                </p>
              )}
            </div>
          </details>
        )}

        {/* Quantity mismatches */}
        {result.quantityMismatch.length > 0 && (
          <details className="bg-orange-900/10 border border-orange-700/30 rounded-lg">
            <summary className="p-3 cursor-pointer font-semibold text-orange-300 text-xs">
              Quantity Mismatches ({result.quantityMismatch.length})
            </summary>
            <div className="p-3 pt-0 space-y-2">
              {result.quantityMismatch.map(({ local, marketplace }, i) =>
                renderMismatchRow(
                  i,
                  local.name,
                  local.ebaySku || local.barcode || '-',
                  `Marketplace Qty: ${marketplace.quantity}`,
                  'bg-orange-900/30 text-orange-300',
                  getFlagKey(local)
                )
              )}
            </div>
          </details>
        )}

        {totalMismatches === 0 && result.matched.length > 0 && (
          <div className="flex items-center gap-2 text-green-400 text-xs p-2">
            <CheckCircle className="h-4 w-4" />
            <span>All {result.matched.length} items matched — no mismatches found</span>
          </div>
        )}

        {totalMismatches === 0 && result.matched.length === 0 && (
          <div className="text-gray-500 text-xs p-2">No reconciliation data for this platform.</div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Check Stock</h2>
            {step > 1 && (
              <span className="text-xs text-gray-500 ml-1">
                — Analyzing {jerseyItems.length} new jersey{jerseyItems.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Step indicator */}
            <div className="flex items-center gap-1 text-xs text-gray-500">
              {([1, 2, 3] as const).map((s) => (
                <React.Fragment key={s}>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-medium ${
                      step === s
                        ? 'bg-blue-600 text-white'
                        : step > s
                        ? 'bg-green-700 text-white'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {s}
                  </span>
                  {s < 3 && <span className="w-3 h-px bg-gray-700" />}
                </React.Fragment>
              ))}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* ── STEP 1: Upload ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-sm text-gray-400">
                Upload CSV exports from your marketplaces to reconcile against your{' '}
                <span className="text-white font-medium">
                  {jerseyItems.length} new jersey{jerseyItems.length !== 1 ? 's' : ''}
                </span>{' '}
                in inventory. At least one platform file is required.
              </div>

              {sessionLoaded && (
                <div className="text-xs text-gray-500">
                  {hasScanSession
                    ? `Comparing against ${Object.keys(scanSession).length} scanned item${Object.keys(scanSession).length !== 1 ? 's' : ''} from current session`
                    : 'No scan session active \u2014 comparing against full jersey inventory'}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {renderDropZone('eBay', ebayFile)}
                {renderDropZone('Poshmark', poshmarkFile)}
                {renderDropZone('Depop', depopFile)}
              </div>

              <div className="bg-gray-800/50 rounded-lg p-4 text-xs text-gray-400">
                <p className="font-semibold text-gray-300 mb-2">CSV Format Requirements:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Must include columns: SKU/Custom Label, Title/Name, Quantity, Status</li>
                  <li>Optional columns: Price, Item ID/Listing ID</li>
                  <li>Supports eBay, Poshmark, Depop, and most marketplace exports</li>
                </ul>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleAnalyze}
                  disabled={!hasAtLeastOneFile || isProcessing}
                  className="bg-blue-600 hover:bg-blue-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Analyzing...' : 'Analyze'}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Results ── */}
          {step === 2 && platformResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  Analyzing{' '}
                  <span className="text-white font-medium">{jerseyItems.length}</span> new
                  jersey{jerseyItems.length !== 1 ? 's' : ''} across{' '}
                  <span className="text-white font-medium">{platformResults.length}</span>{' '}
                  platform{platformResults.length !== 1 ? 's' : ''}
                  {flaggedItems.size > 0 && (
                    <span className="ml-2 text-orange-400">
                      — {flaggedItems.size} flagged
                    </span>
                  )}
                </p>
                <Button
                  onClick={() => setStep(3)}
                  className="bg-blue-600 hover:bg-blue-700 text-sm"
                >
                  Review Actions
                </Button>
              </div>

              {platformResults.map((pr) => renderPlatformResults(pr))}
            </div>
          )}

          {/* ── STEP 3: Actions ── */}
          {step === 3 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-400">
                Review and take action on the audit results.{' '}
                {flaggedItems.size > 0 && (
                  <span className="text-orange-400">{flaggedItems.size} items flagged.</span>
                )}
              </p>

              {/* Summary across all platforms */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="h-4 w-4 text-red-400" />
                    <span className="text-xs font-semibold text-red-300">Sold on Marketplace</span>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {platformResults.reduce(
                      (sum, pr) => sum + pr.result.soldOnMarketplace.length,
                      0
                    )}
                  </p>
                </div>

                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-yellow-400" />
                    <span className="text-xs font-semibold text-yellow-300">Missing Physically</span>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {platformResults.reduce(
                      (sum, pr) => sum + pr.result.missingPhysically.length,
                      0
                    )}
                  </p>
                </div>

                <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="h-4 w-4 text-blue-400" />
                    <span className="text-xs font-semibold text-blue-300">Not Listed</span>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {platformResults.reduce(
                      (sum, pr) => sum + pr.result.notListed.length,
                      0
                    )}
                  </p>
                </div>

                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-xs font-semibold text-green-300">Matched</span>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {platformResults.reduce(
                      (sum, pr) => sum + pr.result.matched.length,
                      0
                    )}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {allSoldItems.length > 0 && (
                  <Button
                    onClick={() => handleMarkAsSold(allSoldItems)}
                    className="bg-red-600 hover:bg-red-700 text-sm"
                  >
                    Mark All {allSoldItems.length} as SOLD
                  </Button>
                )}
                <Button onClick={handleExportAudit} variant="ghost" className="text-sm">
                  <Download className="w-3 h-3 mr-1.5" />
                  Export Audit
                </Button>
                <Button
                  onClick={handleExportFlagged}
                  variant="ghost"
                  className="text-sm"
                  disabled={flaggedItems.size === 0}
                >
                  <Download className="w-3 h-3 mr-1.5" />
                  Export Flagged ({flaggedItems.size})
                </Button>
                <Button onClick={resetToStep1} variant="ghost" className="text-sm">
                  Upload New File
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  variant="ghost"
                  className="text-sm text-gray-500"
                >
                  Back to Results
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
