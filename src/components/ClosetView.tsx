import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Wrench, Bot, X as XIcon, Search, DollarSign, Package, Tag, Copy, Printer, ShoppingCart, Trash2, RotateCcw, TrendingUp, StopCircle, Layers, ChevronDown, ArrowDownLeft, History, ClipboardCheck, Bell, Receipt, ShieldCheck } from 'lucide-react';
import type { Item } from '../types/item';
import { Button } from './ui/Button';
import { UnifiedCheckPanel } from './inventory/UnifiedCheckPanel';
import { EbayDelistConfirmModal } from './inventory/EbayDelistConfirmModal';
import { stockOnHand } from '../services/inventory/stockOnHand';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, updateDoc, serverTimestamp, collection, addDoc, setDoc, arrayUnion, deleteField, writeBatch } from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import { toast } from 'sonner';
import { sendAIMessage, type AIChatMessage } from '../services/aiService';
import { useAuthStore } from '../store/useAuthStore';
import { useItemStore } from '../store/useItemStore';
import { AIActionConfirmationModal, type AIActionData } from './AIActionConfirmationModal';
import { BulkPriceModal } from './BulkPriceModal';
import { BulkStatusModal } from './BulkStatusModal';
import { BulkCloneModal } from './BulkCloneModal';
import { BulkPromotionsModal } from './BulkPromotionsModal';
import { BulkPromotedListingsModal } from './BulkPromotedListingsModal';
import { QRCodePrintModal } from './QRCodePrintModal';
import { ListToDepopModal } from './ListToDepopModal';
import { StockCheckModal } from './StockCheckModal';
import { ItemHistoryPanel } from './ItemHistoryPanel';
import { CheckQuantityModal } from './inventory/CheckQuantityModal';
import { SoldActivityFeed } from './inventory/SoldActivityFeed';
import { MismatchAlertBanner, type MismatchAlertSummary } from './inventory/MismatchAlertBanner';
import { SoldDelistModal } from './SoldDelistModal';
import { StockReconciliationModal } from './inventory/StockReconciliationModal';
import { SyncStockModal, type SyncStockData } from './inventory/SyncStockModal';
import { MatchSuggestionsModal, type MatchSuggestion } from './inventory/MatchSuggestionsModal';
import { AIMatchProgressModal } from './inventory/AIMatchProgressModal';
import { AIMatchConfirmModal, type ProposedMatch } from './inventory/AIMatchConfirmModal';
import { writeSnapshotBatch, confirmPlatformCount, recordBaselineSnapshot, type SnapshotInput } from '../services/inventory/saleSnapshot';
import type { SaleSnapshotPlatform } from '../types/saleSnapshot';
import { writeSnapshot } from '../services/inventory/inventorySnapshot';
import { upsertListings, markRemovedListings, getListings, bulkSetListingItemIds, type UpsertListingInput } from '../services/inventory/platformListing';
import { logCalibrationRun, logSyncRun, logSaleDetected, logListingRemoved, type InventoryRunTotals } from '../services/activityLog';
import { reconcileStock, type ReconciliationResult } from '../services/inventory/reconciliation';
import { findEbayMatchForListing, cleanDescriptiveTitle, tokenizeDescription, descriptionToPlainText, isDescriptionPrefixMatch } from '../services/inventory/listingMatcher';
import { extractColor } from '../services/inventory/listingNormalizer';
import { normalizeSize, extractSizeFromTitle as extractSizeFromTitleCanonical } from '../services/ebay/import';
import { ebayService } from '../services/ebayService';
import { recordSale } from '../services/saleService';

// Extend Window interface for Firebase MCP
declare global {
  interface Window {
    mcp__firebase__firestore_update_document?: (params: {
      path: string;
      data: Record<string, any>;
    }) => Promise<void>;
  }
}

interface ClosetViewProps {
  items: Item[];
  onItemClick: (item: Item) => void;
  onImageUpload?: (itemId: string, imageUrl: string) => void;
  onUpdate?: (item: Item) => void;
  onAddItem?: () => void;
  onRequestPrint?: (item: Item) => void;
}

export const ClosetView: React.FC<ClosetViewProps> = ({ items, onItemClick, onAddItem }) => {
  const { loadItems, deleteItem, updateItem } = useItemStore();
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sellQuery, setSellQuery] = useState('');
  const [sellSuggestions, setSellSuggestions] = useState<Item[]>([]);
  const [markingAsSold, setMarkingAsSold] = useState<string | null>(null);
  const sellInputRef = useRef<HTMLInputElement>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<AIActionData | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showPromotionsModal, setShowPromotionsModal] = useState(false);
  const [showPromotedListingsModal, setShowPromotedListingsModal] = useState(false);
  const [showQRPrintModal, setShowQRPrintModal] = useState(false);
  const [showDepopModal, setShowDepopModal] = useState(false);
  const [showStockCheckModal, setShowStockCheckModal] = useState(false);
  const [showCheckQuantity, setShowCheckQuantity] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null);
  const [showSyncStockModal, setShowSyncStockModal] = useState(false);
  const [syncStockMode, setSyncStockMode] = useState<'reconcile' | 'calibrate'>('reconcile');
  const [criticalAlertCount, setCriticalAlertCount] = useState(0);
  const [mismatchAlerts, setMismatchAlerts] = useState<MismatchAlertSummary | null>(null);
  const [showSoldFeed, setShowSoldFeed] = useState(false);
  const [historyItem, setHistoryItem] = useState<Item | null>(null);
  const [delistItem, setDelistItem] = useState<Item | null>(null);
  const [ebayAutoDelisted, setEbayAutoDelisted] = useState(false);
  const [depopAutoDelisted, setDepopAutoDelisted] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState('1');
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
  const [editingQuantityValue, setEditingQuantityValue] = useState('');
  const [editingJerseyId, setEditingJerseyId] = useState<string | null>(null);
  const [editingJerseyValue, setEditingJerseyValue] = useState('');
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null);
  const [editingSizeValue, setEditingSizeValue] = useState('');
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);
  const [showMatchSuggestions, setShowMatchSuggestions] = useState(false);
  const [aiMatchRunId, setAiMatchRunId] = useState<string | null>(null);
  const [showAiMatchProgress, setShowAiMatchProgress] = useState(false);
  const [aiProposedMatches, setAiProposedMatches] = useState<ProposedMatch[]>([]);
  const [showAiConfirm, setShowAiConfirm] = useState(false);
  const [isApplyingAiConfirm, setIsApplyingAiConfirm] = useState(false);
  const [isRedoingMatches, setIsRedoingMatches] = useState(false);
  // Track which itemIds the user has rejected per listing across multiple Redo passes,
  // so the matcher never re-suggests the same wrong item.
  const [redoExcludeMap, setRedoExcludeMap] = useState<Record<string, string[]>>({});
  const [aiMatchPlatform, setAiMatchPlatform] = useState<'depop' | 'poshmark' | null>(null);
  const { user } = useAuthStore();

  // Close sell suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sellInputRef.current && !sellInputRef.current.closest('div')?.contains(e.target as Node)) {
        setSellSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);


  // Helper function to get effective price
  const getEffectivePrice = (item: Item): number => {
    if (item.manualPriceCents !== undefined && item.manualPriceCents !== null && item.manualPriceCents > 0) {
      return item.manualPriceCents / 100;
    }
    if (item.sellingPrice && item.sellingPrice > 0) {
      return item.sellingPrice;
    }
    if (item.ebayPrice && item.ebayPrice > 0) {
      return item.ebayPrice / 100;
    }
    return 0;
  };

  // Update quantity inline
  const handleQuantityUpdate = async (itemId: string, newQty: string) => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 0) {
      toast.error('Invalid quantity');
      setEditingQuantityId(null);
      return;
    }

    try {
      console.log(`[Quantity Update] Updating item ${itemId} to quantity ${qty}`);

      const db = getFirestore(app);
      const itemRef = doc(db, 'Item', itemId);

      // Update Firestore — manual edit sets both physical and eBay quantity
      await updateDoc(itemRef, {
        physicalQuantity: qty,
        ebayQuantity: qty,
        updatedAt: serverTimestamp(),
      });

      console.log(`[Quantity Update] Successfully updated Firestore`);

      // Reload items from store to get fresh data
      await loadItems();

      toast.success(`✓ Saved! Quantity is now ${qty}`);
      setEditingQuantityId(null);
    } catch (error: any) {
      console.error('[Quantity Update] Failed to update quantity:', error);
      toast.error(`Failed to update: ${error.message || 'Unknown error'}`);
      setEditingQuantityId(null);
    }
  };

  // Update jersey number inline
  const handleJerseyUpdate = async (itemId: string, value: string) => {
    try {
      const db = getFirestore(app);
      await updateDoc(doc(db, 'Item', itemId), {
        jerseyNumber: value.trim(),
        updatedAt: serverTimestamp(),
      });
      await loadItems();
      setEditingJerseyId(null);
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
      setEditingJerseyId(null);
    }
  };

  // Update size inline
  const handleSizeUpdate = async (itemId: string, value: string) => {
    try {
      const db = getFirestore(app);
      await updateDoc(doc(db, 'Item', itemId), {
        size: value.trim(),
        updatedAt: serverTimestamp(),
      });
      await loadItems();
      setEditingSizeId(null);
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
      setEditingSizeId(null);
    }
  };

  // Handle clicking a green dot to mark a unit as sold
  const handleDotSold = async (item: Item) => {
    try {
      const db = getFirestore(app);
      const itemRef = doc(db, 'Item', item.id);
      const currentPhysical = item.physicalQuantity ?? item.ebayQuantity ?? 1;
      const newPhysical = Math.max(0, currentPhysical - 1);
      const soldCount = (item.unitSales?.length || 0) + 1;

      // Determine new stock status
      let newStockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'SOLD';
      if (newPhysical === 0) {
        newStockStatus = 'SOLD';
      } else if (newPhysical <= 2) {
        newStockStatus = 'LOW_STOCK';
      } else {
        newStockStatus = 'IN_STOCK';
      }

      const saleEntry = {
        soldAt: new Date().toISOString(),
        platform: 'in_person' as const,
        priceCents: item.manualPriceCents || 0,
      };

      const activityEntry = {
        action: 'SOLD',
        timestamp: new Date().toISOString(),
        details: `Unit ${soldCount} sold in-person for $${((item.manualPriceCents || 0) / 100).toFixed(2)}`,
        oldValue: String(currentPhysical),
        newValue: String(newPhysical),
      };

      // Cap arrays to prevent Firestore doc size overflow
      const MAX_UNIT_SALES = 200;
      const MAX_ITEM_ACTIVITY = 50;

      const updatedUnitSales = [...(item.unitSales || []), saleEntry].slice(-MAX_UNIT_SALES);
      const updatedItemActivity = [...(item.itemActivity || []), activityEntry].slice(-MAX_ITEM_ACTIVITY);

      await updateDoc(itemRef, {
        physicalQuantity: newPhysical,
        stockStatus: newStockStatus,
        unitSales: updatedUnitSales,
        itemActivity: updatedItemActivity,
        updatedAt: serverTimestamp(),
      });

      // Record sale so it shows up on Sales page
      if (user) {
        await recordSale({
          userId: user.id,
          itemId: item.id,
          itemName: item.name,
          itemImageUrl: item.imageUrl,
          salePrice: item.manualPriceCents || 0,
          costPrice: item.costPrice || 0,
          marketplace: 'in_person',
          saleSource: 'dot_sold',
          notes: `Unit ${soldCount} sold`,
        });
      }

      await loadItems();
      toast.success(`Marked unit as sold! ${newPhysical} remaining`);

      // Auto-open the sold feed briefly so the user sees the new sale
      setShowSoldFeed(true);
      setTimeout(() => setShowSoldFeed(false), 3000);

      // Track auto-delist results for the modal
      let ebayAutoSuccess = false;
      let depopAutoSuccess = false;

      // If physicalQuantity hit 0 and item has eBay listing, auto-end it
      if (newPhysical === 0 && (item.ebayListingId || item.ebayItemId)) {
        try {
          const listingId = item.ebayListingId || item.ebayItemId!;
          await httpsCallable(getFunctions(app), 'ebayEndItem')({ itemId: listingId, endingReason: 'NotAvailable' });
          toast.success('eBay listing ended automatically');
          ebayAutoSuccess = true;
        } catch {
          toast.error('Failed to end eBay listing — do it manually');
        }
      }

      // Auto-mark sold on Depop when qty hits 0
      if (newPhysical === 0 && item.depopListingId) {
        try {
          await httpsCallable(getFunctions(app), 'depopMarkItemSold')({ productId: item.depopListingId });
          toast.success('Marked sold on Depop');
          depopAutoSuccess = true;
        } catch {
          toast.error('Failed to mark sold on Depop');
        }
      }

      // Open delist confirmation modal when stock hits 0
      if (newPhysical === 0) {
        setDelistItem(item);
        setEbayAutoDelisted(ebayAutoSuccess);
        setDepopAutoDelisted(depopAutoSuccess);
      }
    } catch (error: any) {
      console.error('[DotSold] Failed:', error);
      toast.error(`Failed to mark as sold: ${error.message || 'Unknown error'}`);
    }
  };

  // Extract size from title as fallback when the stored size is empty
  const extractSizeFromTitle = (title: string): string => {
    const sizePatterns = [
      /\b(xxs|xs|small|medium|large|x-large|xx-large|xxx-large)\b/i,
      /\b(2xs|3xs|4xs|s|m|l|xl|2xl|3xl|4xl|xxl|xxxl|xxxxl)\b/i,
      /\bsize\s*(\w+)\b/i,
      /\bmens?\s*(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl)\b/i,
      // Jersey numeric sizes (40–64 range used for authentic jerseys)
      /\b(40|44|46|48|50|52|54|56|58|60|64)\b/,
    ];
    for (const pattern of sizePatterns) {
      const match = title.match(pattern);
      if (match) {
        const size = match[1] || match[0];
        const sizeMap: Record<string, string> = {
          'small': 'S', 'medium': 'M', 'large': 'L',
          'x-large': 'XL', 'xx-large': 'XXL', 'xxx-large': 'XXXL',
        };
        return sizeMap[size.toLowerCase()] || size.toUpperCase();
      }
    }
    return '';
  };

  // Extract jersey number from title (e.g. "#23" or "No. 23")
  const extractJerseyNumberFromTitle = (title: string): string => {
    const match = title.match(/#\s*(\d+)\b/) || title.match(/\bno\.?\s*(\d+)\b/i) || title.match(/\bnumber\s+(\d+)\b/i);
    return match ? match[1] : '';
  };

  // Get effective jersey number: stored value, then auto-extracted from title
  const getJerseyNumber = (item: { jerseyNumber?: string; name?: string }) =>
    item.jerseyNumber || extractJerseyNumberFromTitle(item.name || '');

  // Get effective size: stored value, then auto-extracted from title
  const getSize = (item: { size?: string; name?: string }) =>
    item.size || extractSizeFromTitle(item.name || '');


  // Sync size + jersey number from eBay itemSpecifics for all items with ebayListingId
  const [isSyncingEbay, setIsSyncingEbay] = useState(false);
  const [isSyncingFromEbay, setIsSyncingFromEbay] = useState(false);
  const [isSyncingDepop, setIsSyncingDepop] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const handleSyncFromEbay = async () => {
    setIsSyncingEbay(true);
    try {
      toast.info('Fetching eBay listing data…');
      const result = await ebayService.getAllListings();
      if (!result.success || !result.listings) {
        toast.error('Failed to fetch eBay listings');
        return;
      }

      // Build map: ebayItemId → full listing (with itemSpecifics)
      const ebayMap = new Map<string, any>();
      for (const listing of result.listings as any[]) {
        ebayMap.set(listing.itemId, listing);
      }

      const db = getFirestore(app);
      const updates: Promise<void>[] = [];
      let count = 0;

      for (const item of items) {
        if (!item.ebayListingId || !ebayMap.has(item.ebayListingId)) continue;
        const listing = ebayMap.get(item.ebayListingId);
        const specs: Record<string, string> = listing.itemSpecifics || {};

        const newSize = specs['Size'] || specs['Jersey Size'] || specs['Shoe Size'] || item.size || '';
        const newJerseyNum =
          specs['Player Number'] || specs['Jersey Number'] || specs['Number'] ||
          item.jerseyNumber || extractJerseyNumberFromTitle(item.name || '') || '';

        const sizeChanged = newSize && newSize !== item.size;
        const numChanged = newJerseyNum && newJerseyNum !== (item.jerseyNumber || '');

        if (sizeChanged || numChanged) {
          const payload: Record<string, any> = { updatedAt: serverTimestamp() };
          if (sizeChanged) payload.size = newSize;
          if (numChanged) payload.jerseyNumber = newJerseyNum;
          updates.push(updateDoc(doc(db, 'Item', item.id), payload));
          count++;
        }
      }

      await Promise.all(updates);
      await loadItems();
      toast.success(`Synced ${count} items from eBay`);
    } catch (error: any) {
      toast.error('Sync failed: ' + error.message);
    } finally {
      setIsSyncingEbay(false);
    }
  };

  // Parse a Posh/Depop listing price into a number. Scrapers return mixed shapes:
  // "$52.99" string, 52.99 number, { amount: "52.99" } object, etc. Returns undefined
  // if we can't read it (so the caller doesn't accidentally filter the listing as cheap).
  const parsePoshDepopPrice = (raw: unknown): number | undefined => {
    if (raw == null) return undefined;
    if (typeof raw === 'number' && !isNaN(raw)) return raw;
    if (typeof raw === 'string') {
      const cleaned = raw.replace(/[^0-9.]/g, '');
      const n = parseFloat(cleaned);
      return isNaN(n) ? undefined : n;
    }
    if (typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      const candidate = r.amount ?? r.value ?? r.price ?? r.priceAmount ?? r.current_price;
      if (candidate !== undefined) return parsePoshDepopPrice(candidate);
    }
    return undefined;
  };

  // Calibrate mode: same SyncStockModal fetches, but instead of reconciling we freeze every
  // currently-visible sale into SaleSnapshot as 'baseline'. One-time setup. Idempotent.
  // Match Listings — backfill itemId on existing PlatformListing rows by running title
  // fuzzy match against the user's local Items, AND write the reverse direction back
  // to the Item document (poshmarkListingId / depopListingId / URLs) so the platform
  // pills next to "In Stock" actually render. Operates on existing baseline data,
  // doesn't re-fetch from any platform.
  // @ts-expect-error — kept as a heuristic-only fallback in case AI matcher is offline; not currently wired to UI.
  const _handleMatchListings = async (opts: { onlySelected?: boolean } = {}) => {
    if (!user) return;
    const userId = user.id;
    const onlySelected = !!opts.onlySelected;
    if (onlySelected && selectedItemIds.size === 0) {
      toast.error('No items selected — pick some items first or use "Match all"');
      return;
    }
    toast.info(
      onlySelected
        ? `Matching listings for ${selectedItemIds.size} selected item(s)...`
        : 'Matching listings to local inventory...',
    );
    try {
      // Match against ALL local items (not just eBay-anchored) so non-eBay items
      // without an eBay listing can still link to Posh/Depop platform listings.
      const matchPool = items;
      if (matchPool.length === 0) {
        toast.error('No local items to match against');
        return;
      }
      // Pull existing PlatformListing rows for the user
      const allRows = await getListings(userId);
      const MIN_PRICE = 40;
      const isLowPrice = (r: any) =>
        r.flagged === 'low_price' || (typeof r.price === 'number' && r.price < MIN_PRICE);
      const candidates = allRows.filter(r =>
        (r.platform === 'poshmark' || r.platform === 'depop') && !isLowPrice(r)
      );
      const skippedByPrice = allRows.filter(r =>
        (r.platform === 'poshmark' || r.platform === 'depop') && isLowPrice(r)
      ).length;
      console.log(`[MatchListings] Considering ${candidates.length} Posh/Depop rows (skipped ${skippedByPrice} flagged/sub-$${MIN_PRICE}; total ${allRows.length})`);
      if (candidates.length === 0) {
        toast.success('No Poshmark/Depop listings to match');
        return;
      }

      const platformListingUpdates: Array<{ platform: 'poshmark' | 'depop'; listingId: string; itemId: string }> = [];
      const platformListingClears: Array<{ platform: 'poshmark' | 'depop'; listingId: string }> = [];
      const itemUpdates = new Map<string, Record<string, any>>();
      const itemsWithFreshPosh = new Set<string>();
      const itemsWithFreshDepop = new Set<string>();

      // When user clicked "Match selected", restrict the eBay-side candidate pool to only the
      // items they checked. Posh/Depop rows still considered all — we filter the final binds
      // by selection at write-time below so unrelated rows aren't touched.
      let ebayItems = matchPool.filter(i =>
        (i.ebayListingId || i.ebayItemId) &&
        (!onlySelected || selectedItemIds.has(i.id))
      );
      let totalAssigned = 0;

      // ── eBay description backfill ──
      // The user pastes their eBay listing's full HTML description into the Depop/Poshmark
      // title field. Matching against the short eBay listing title misses ~half of cases;
      // matching against the full eBay description gives massive token overlap. Backfill
      // any eBay-anchored Item missing `ebayFullDescription` by calling the existing CF
      // `ebayGetItemDetails` (Trading API GetItem with ItemReturnDescription).
      const itemsNeedingDescription = ebayItems.filter(
        i => (i.ebayListingId || i.ebayItemId) && !i.ebayFullDescription
      );
      if (itemsNeedingDescription.length > 0) {
        toast.info(`Fetching ${itemsNeedingDescription.length} eBay descriptions...`);
        const backfillStart = Date.now();
        const fetchedById = new Map<string, string>(); // itemDocId -> description

        // Run in parallel batches of 10. Sequential is too slow for ~200 items;
        // all-at-once risks rate-limiting from eBay.
        const PARALLEL_BATCH = 10;
        for (let start = 0; start < itemsNeedingDescription.length; start += PARALLEL_BATCH) {
          const slice = itemsNeedingDescription.slice(start, start + PARALLEL_BATCH);
          const results = await Promise.allSettled(
            slice.map(async (it) => {
              const ebayItemId = (it.ebayListingId || it.ebayItemId) as string;
              const data: any = await ebayService.getItemDetails(ebayItemId);
              // CF returns { success: true, item: { description, ... } } — description lives at data.item.description.
              const description: string =
                (data?.item && typeof data.item.description === 'string') ? data.item.description :
                (data && typeof data.description === 'string') ? data.description : '';
              return { id: it.id, description };
            })
          );
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const it = slice[i];
            if (r.status === 'fulfilled' && r.value.description) {
              fetchedById.set(r.value.id, r.value.description);
            } else if (r.status === 'rejected') {
              console.warn(`[MatchListings] description fetch failed for ${it.id} (${it.ebayListingId || it.ebayItemId}):`, r.reason);
            }
          }
        }

        // Persist to Firestore in writeBatch chunks of 400 (Firestore limit is 500; leave headroom).
        if (fetchedById.size > 0) {
          const firestore = getFirestore(app);
          const entries = Array.from(fetchedById.entries());
          const WRITE_BATCH_SIZE = 400;
          for (let start = 0; start < entries.length; start += WRITE_BATCH_SIZE) {
            const slice = entries.slice(start, start + WRITE_BATCH_SIZE);
            const batch = writeBatch(firestore);
            for (const [itemId, description] of slice) {
              batch.update(doc(firestore, 'Item', itemId), { ebayFullDescription: description });
            }
            await batch.commit();
          }
        }

        // Refresh the in-memory ebayItems array so this Match run sees the new descriptions.
        if (fetchedById.size > 0) {
          ebayItems = ebayItems.map(it =>
            fetchedById.has(it.id)
              ? { ...it, ebayFullDescription: fetchedById.get(it.id)! }
              : it
          );
        }

        const failedCount = itemsNeedingDescription.length - fetchedById.size;
        const elapsedMs = Date.now() - backfillStart;
        console.log(
          `[MatchListings] backfilled ${fetchedById.size} eBay descriptions in ${elapsedMs}ms; ${failedCount} failed`
        );
        if (failedCount > 0) {
          toast.info(`Fetched ${fetchedById.size} descriptions, ${failedCount} failed`);
        }
      }

      // ── Simple, predictable matching (per user model) ──
      // The user manually copies eBay titles into Poshmark/Depop, so titles share most
      // tokens. We match on:
      //   - name token overlap (Jaccard) ≥ threshold
      //   - color matches when both sides have one (hard-reject on contradiction)
      //   - size matches when both sides have one (hard-reject on contradiction)
      // Three buckets:
      //   HIGH (auto-bind): score ≥ 0.40 AND no contradictions AND both color+size determinable+matching
      //   MEDIUM (suggest): score ≥ 0.30 AND no contradictions AND ≤1 of {color,size} missing
      //   LOW (skip): otherwise

      const sizeFromTitle = (t: string): string => {
        const raw = extractSizeFromTitleCanonical(t || '');
        if (!raw) return '';
        return normalizeSize(raw).toUpperCase();
      };
      const colorFromTitle = (t: string): string | null => {
        const c = extractColor(t || '');
        return c ? c.toLowerCase() : null;
      };

      const STOP_WORDS = new Set([
        'the', 'a', 'an', 'and', 'or', 'for', 'in', 'on', 'of', 'to', 'with',
        'new', 'nwt', 'nwot', 'size', 'mens', 'men', 'womens', 'women', 'youth',
        'free', 'shipping', 'fast', 'brand', 'authentic', 'official', 'licensed',
        'item', 'listing', 'description', 'condition', 'details', 'adult', 'is',
        'this', 'that', 'product', 'jersey', 'shirt',
      ]);
      const tokenize = (t: string): Set<string> => {
        const cleaned = cleanDescriptiveTitle(t || '');
        const out = new Set<string>();
        for (const w of cleaned.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
          if (w.length >= 2 && !STOP_WORDS.has(w)) out.add(w);
        }
        return out;
      };

      // Coverage-from-row: what fraction of the row's tokens are present in the eBay
      // item's token set (title ∪ description). True Jaccard would penalize the long
      // eBay description side; coverage from the row's perspective is what we want —
      // "does most of what the Posh/Depop title says appear somewhere on the eBay side?"
      // First arg MUST be the row tokens.
      const coverage = (rowTokens: Set<string>, itemTokens: Set<string>): number => {
        if (rowTokens.size === 0 || itemTokens.size === 0) return 0;
        let inter = 0;
        for (const w of rowTokens) if (itemTokens.has(w)) inter++;
        return inter / rowTokens.size;
      };

      // Pre-tokenize each eBay item once. Token set is the UNION of:
      //   - the eBay listing title (short, structured) and
      //   - the eBay full HTML description (long-form — matches what the user pasted
      //     into the Depop/Poshmark title field).
      // Description tokens are capped (see tokenizeDescription) so a giant description
      // can't dominate scoring across all items.
      const ebayItemTokens = new Map<string, Set<string>>();
      // ALSO pre-decode the full description into normalized plain text. The Depop scraper
      // truncates the eBay description at exactly 100 chars and writes it into PlatformListing.title
      // verbatim. So `descriptionPlainText.startsWith(rowTitle)` is a 100% match signal.
      // This is the PRIMARY matcher; the token-coverage path is fallback.
      const ebayItemPlainDesc = new Map<string, string>();
      for (const item of ebayItems) {
        const titleTokens = tokenize(item.name || '');
        const descTokens = tokenizeDescription(item.ebayFullDescription || '', 200);
        const union = new Set<string>(titleTokens);
        for (const w of descTokens) {
          if (w.length >= 2 && !STOP_WORDS.has(w)) union.add(w);
        }
        ebayItemTokens.set(item.id, union);
        if (item.ebayFullDescription) {
          ebayItemPlainDesc.set(item.id, descriptionToPlainText(item.ebayFullDescription));
        }
      }

      const HIGH_FLOOR = 0.40;
      const MEDIUM_FLOOR = 0.30;

      type ScoredPair = {
        row: typeof candidates[number];
        item: typeof ebayItems[number];
        score: number;
        bucket: 'HIGH' | 'MEDIUM';
      };
      const collectedPairs: ScoredPair[] = [];

      const platformStats: Record<'poshmark' | 'depop', {
        H: number; M: number; L: number;
        rejectSize: number; rejectColor: number;
      }> = {
        poshmark: { H: 0, M: 0, L: 0, rejectSize: 0, rejectColor: 0 },
        depop: { H: 0, M: 0, L: 0, rejectSize: 0, rejectColor: 0 },
      };

      let prefixExactCount = 0;
      let prefixAmbiguousCount = 0;

      for (const platform of ['poshmark', 'depop'] as const) {
        const rows = candidates.filter(r => r.platform === platform);
        if (rows.length === 0) continue;

        const stats = platformStats[platform];

        for (const row of rows) {
          const rowSize = sizeFromTitle(row.title || '');
          const rowColor = colorFromTitle(row.title || '');
          const rowTokens = tokenize(row.title || '');
          if (rowTokens.size < 2) { stats.L++; continue; }

          // ── PASS 1 — Prefix match (primary) ──
          // The Depop scraper truncates the eBay description at 100 chars and writes it
          // verbatim into PlatformListing.title. So if any eBay item's full description
          // starts with this row's title, it's a 100% match. After hard-rejects on
          // size/color, take the unique survivor at score 1.0.
          const prefixCandidates: typeof ebayItems = [];
          for (const item of ebayItems) {
            const plain = ebayItemPlainDesc.get(item.id);
            if (plain && isDescriptionPrefixMatch(row.title || '', plain)) {
              prefixCandidates.push(item);
            }
          }
          if (prefixCandidates.length > 0) {
            const filtered = prefixCandidates.filter(item => {
              const storedItemSize = item.size ? normalizeSize(item.size).toUpperCase() : '';
              const itemSize = storedItemSize || sizeFromTitle(item.name || '');
              const itemColor = colorFromTitle(item.name || '');
              if (rowSize && itemSize && rowSize !== itemSize) return false;
              if (rowColor && itemColor && rowColor !== itemColor) return false;
              return true;
            });
            if (filtered.length === 1) {
              collectedPairs.push({ row, item: filtered[0], score: 1.0, bucket: 'HIGH' });
              prefixExactCount++;
              continue; // skip the fuzzy path entirely (bipartite will count this as H)
            }
            if (filtered.length > 1) {
              // Genuine ambiguity (e.g. row truncates before the player name and multiple
              // items share the same template). Push first one as MEDIUM so it surfaces
              // in the suggestion modal at high confidence — user picks. Bipartite/MEDIUM
              // pass will count this as M.
              prefixAmbiguousCount++;
              collectedPairs.push({ row, item: filtered[0], score: 0.95, bucket: 'MEDIUM' });
              continue;
            }
            // All prefix candidates filtered out by size/color — genuine contradiction,
            // fall through to fuzzy path which will likely also reject.
          }

          // ── PASS 2 — Token-coverage fallback ──
          let bestPair: ScoredPair | null = null;
          for (const item of ebayItems) {
            const storedItemSize = item.size ? normalizeSize(item.size).toUpperCase() : '';
            const itemSize = storedItemSize || sizeFromTitle(item.name || '');
            const itemColor = colorFromTitle(item.name || '');

            // Hard rejects on explicit contradictions.
            if (rowSize && itemSize && rowSize !== itemSize) { stats.rejectSize++; continue; }
            if (rowColor && itemColor && rowColor !== itemColor) { stats.rejectColor++; continue; }

            const itemTokens = ebayItemTokens.get(item.id)!;
            const score = coverage(rowTokens, itemTokens);
            if (score < MEDIUM_FLOOR) continue;

            const sizeKnown = !!rowSize && !!itemSize;
            const colorKnown = !!rowColor && !!itemColor;
            const sizeMatches = sizeKnown && rowSize === itemSize;
            const colorMatches = colorKnown && rowColor === itemColor;

            // HIGH: score ≥ 0.40, AND every-known-side matches.
            // If both color and size are known on both sides, both must match.
            // If only one is known, that one must match (the other is "missing"); but for
            // HIGH we also require ≥1 of the two to be a positive match.
            const noContradictions =
              (!sizeKnown || sizeMatches) && (!colorKnown || colorMatches);
            const isHigh =
              score >= HIGH_FLOOR &&
              noContradictions &&
              (sizeMatches || colorMatches || (sizeKnown && colorKnown));

            // MEDIUM: score ≥ 0.30, no contradictions, at most one of {color,size} missing,
            // and not already HIGH.
            const knownCount = (sizeKnown ? 1 : 0) + (colorKnown ? 1 : 0);
            const isMedium =
              !isHigh &&
              score >= MEDIUM_FLOOR &&
              noContradictions &&
              knownCount >= 1;

            if (!isHigh && !isMedium) continue;

            const bucket: 'HIGH' | 'MEDIUM' = isHigh ? 'HIGH' : 'MEDIUM';
            // Prefer HIGH > MEDIUM, then higher score.
            const better =
              !bestPair ||
              (bucket === 'HIGH' && bestPair.bucket === 'MEDIUM') ||
              (bucket === bestPair.bucket && score > bestPair.score);
            if (better) bestPair = { row, item, score, bucket };
          }

          if (!bestPair) { stats.L++; continue; }
          collectedPairs.push(bestPair);
        }
      }

      // ── Bipartite 1:1 auto-bind for HIGH ──
      // Sort all HIGH pairs by score desc; greedy claim by (listingId, itemId-per-platform).
      const highPairs = collectedPairs
        .filter(p => p.bucket === 'HIGH')
        .sort((a, b) => b.score - a.score);

      const claimedListings = new Set<string>();
      // eBay items can be claimed once per platform (one Posh + one Depop allowed).
      const claimedByPlatform: Record<'poshmark' | 'depop', Set<string>> = {
        poshmark: new Set(),
        depop: new Set(),
      };

      for (const p of highPairs) {
        const platform = p.row.platform as 'poshmark' | 'depop';
        if (claimedListings.has(p.row.listingId)) continue;
        if (claimedByPlatform[platform].has(p.item.id)) continue;
        claimedListings.add(p.row.listingId);
        claimedByPlatform[platform].add(p.item.id);
        platformStats[platform].H++;

        platformListingUpdates.push({ platform, listingId: p.row.listingId, itemId: p.item.id });
        if (platform === 'poshmark') itemsWithFreshPosh.add(p.item.id);
        else itemsWithFreshDepop.add(p.item.id);

        const patch = itemUpdates.get(p.item.id) || {};
        if (platform === 'poshmark') {
          patch.poshmarkListingId = p.row.listingId;
          patch.poshmarkUrl = `https://poshmark.com/listing/${p.row.listingId}`;
        } else {
          patch.depopListingId = p.row.listingId;
          patch.depopUrl = `https://www.depop.com/products/${p.row.listingId}`;
        }
        itemUpdates.set(p.item.id, patch);
        totalAssigned++;
      }

      // ── Build MEDIUM suggestion list ──
      // Skip MEDIUM pairs whose row was already HIGH-bound or whose eBay item was claimed
      // for this platform. Also collapse duplicates: only one suggestion per (row, eBay item),
      // and at most one suggestion per listingId; if multiple rows want the same eBay item
      // for the same platform, keep the highest score.
      const suggestionByListing = new Map<string, ScoredPair>();
      const mediumByItemPerPlatform = new Map<string, ScoredPair>(); // key: platform:itemId
      const mediumPairs = collectedPairs
        .filter(p => p.bucket === 'MEDIUM')
        .sort((a, b) => b.score - a.score);
      for (const p of mediumPairs) {
        const platform = p.row.platform as 'poshmark' | 'depop';
        if (claimedListings.has(p.row.listingId)) continue;
        if (claimedByPlatform[platform].has(p.item.id)) continue;
        if (suggestionByListing.has(p.row.listingId)) continue;
        const itemKey = `${platform}:${p.item.id}`;
        if (mediumByItemPerPlatform.has(itemKey)) continue;
        suggestionByListing.set(p.row.listingId, p);
        mediumByItemPerPlatform.set(itemKey, p);
        platformStats[platform].M++;
      }
      const pendingSuggestions: MatchSuggestion[] = Array.from(suggestionByListing.values())
        .sort((a, b) => b.score - a.score)
        .map(p => ({
          id: p.row.listingId,
          platform: p.row.platform as 'poshmark' | 'depop',
          listingId: p.row.listingId,
          listingTitle: p.row.title || '(no title)',
          ebayItemId: p.item.id,
          ebayItemTitle: p.item.name || '(no title)',
          score: p.score,
        }));

      console.log(
        `[MatchListings] prefix-matched: ${prefixExactCount} exact / ${prefixAmbiguousCount} ambiguous`
      );
      for (const platform of ['poshmark', 'depop'] as const) {
        const s = platformStats[platform];
        console.log(
          `[MatchListings] ${platform}: ${s.H} high / ${s.M} medium / ${s.L} low / ` +
          `${s.rejectSize + s.rejectColor} rejected (size:${s.rejectSize} color:${s.rejectColor})`
        );
      }

      // 3. Build back-pointer CLEARS for Items that didn't get a fresh confident match.
      // (Auto-binds only — MEDIUM suggestions are NOT yet bound, so they don't count here.
      //  If user later accepts a suggestion, that write happens in the modal handler, but
      //  it does not unset other items.)
      const firestore = getFirestore(app);
      const itemClears = new Map<string, Record<string, any>>();
      for (const item of matchPool) {
        // When running "Match selected", we ONLY considered selected items in the matcher
        // — never clear back-pointers on items the user didn't ask us to touch.
        if (onlySelected && !selectedItemIds.has(item.id)) continue;
        const clears: Record<string, any> = {};
        if (item.poshmarkListingId && !itemsWithFreshPosh.has(item.id)) {
          clears.poshmarkListingId = null;
          clears.poshmarkUrl = null;
        }
        if (item.depopListingId && !itemsWithFreshDepop.has(item.id)) {
          clears.depopListingId = null;
          clears.depopUrl = null;
        }
        if (Object.keys(clears).length > 0) {
          itemClears.set(item.id, clears);
        }
      }

      // Stale itemId clears on PlatformListing rows that we did NOT freshly bind.
      // In "Match selected" mode, only clear rows whose existing itemId points to a SELECTED
      // item (those were the only ones the matcher had a chance to re-claim). Rows pointing
      // to non-selected items weren't candidates this run — leave them alone.
      for (const row of candidates) {
        if (!claimedListings.has(row.listingId) && row.itemId) {
          if (onlySelected && !selectedItemIds.has(row.itemId)) continue;
          platformListingClears.push({ platform: row.platform as 'poshmark' | 'depop', listingId: row.listingId });
        }
      }

      console.log(`[MatchListings] Total auto-bound (HIGH, 1:1): ${totalAssigned}`);
      console.log(`[MatchListings] Pending MEDIUM suggestions: ${pendingSuggestions.length}`);
      console.log(`[MatchListings] PlatformListing itemId fills: ${platformListingUpdates.length}`);
      console.log(`[MatchListings] PlatformListing itemId clears: ${platformListingClears.length}`);
      console.log(`[MatchListings] Item back-pointer fills: ${itemUpdates.size}`);
      console.log(`[MatchListings] Item back-pointer clears: ${itemClears.size}`);

      // 1) PlatformListing.itemId fills
      if (platformListingUpdates.length > 0) {
        await bulkSetListingItemIds(userId, platformListingUpdates);
      }

      // 1b) PlatformListing.itemId clears for unclaimed rows
      if (platformListingClears.length > 0) {
        const BATCH_SIZE = 400;
        for (let start = 0; start < platformListingClears.length; start += BATCH_SIZE) {
          const slice = platformListingClears.slice(start, start + BATCH_SIZE);
          const batch = writeBatch(firestore);
          for (const c of slice) {
            const id = `${userId}:${c.platform}:${c.listingId}`;
            batch.set(doc(firestore, 'PlatformListing', id), { itemId: null, lastSeenAt: new Date().toISOString() }, { merge: true });
          }
          await batch.commit();
        }
      }

      // 2) Item back-pointers — fills + clears combined
      const allItemPatches = new Map<string, Record<string, any>>();
      for (const [id, patch] of itemUpdates) allItemPatches.set(id, patch);
      for (const [id, clears] of itemClears) {
        const existing = allItemPatches.get(id) || {};
        allItemPatches.set(id, { ...existing, ...clears });
      }
      if (allItemPatches.size > 0) {
        const entries = Array.from(allItemPatches.entries());
        const BATCH_SIZE = 400;
        for (let start = 0; start < entries.length; start += BATCH_SIZE) {
          const slice = entries.slice(start, start + BATCH_SIZE);
          const batch = writeBatch(firestore);
          for (const [itemId, patch] of slice) {
            batch.update(doc(firestore, 'Item', itemId), patch);
          }
          await batch.commit();
        }
        await loadItems();
      }

      toast.success(
        `Match complete: ${totalAssigned} auto-bound · ${pendingSuggestions.length} need review · ${platformListingClears.length} stale cleared`
      );

      if (pendingSuggestions.length > 0) {
        setMatchSuggestions(pendingSuggestions);
        setShowMatchSuggestions(true);
      }
    } catch (err: any) {
      console.error('[MatchListings] failed:', err);
      toast.error(`Match failed: ${err?.message || 'Unknown error'}`);
    }
  };

  // ── Deterministic listing matching (legacy — match flow moved to per-platform pages) ──
  // @ts-expect-error — kept temporarily; safe to remove once AIMatchConfirmModal/AIMatchProgressModal mounts are removed.
  const handleAIMatch = async (opts: { onlySelected?: boolean; onlyPlatform?: 'depop' | 'poshmark'; resetFirst?: boolean } = {}) => {
    if (!user) return;
    const onlySelected = !!opts.onlySelected;
    const onlyPlatform = opts.onlyPlatform;
    const resetFirst = !!opts.resetFirst;
    if (onlySelected && selectedItemIds.size === 0) {
      toast.error('No items selected — pick some items first');
      return;
    }
    if (resetFirst && !onlyPlatform) {
      toast.error('Reset & Re-match requires a platform (Depop or Poshmark)');
      return;
    }
    if (resetFirst) {
      const ok = window.confirm(`Reset all ${onlyPlatform} matches and re-match from scratch? This clears PlatformListing.itemId + Item back-pointers for that platform.`);
      if (!ok) return;
      toast.info(`Clearing ${onlyPlatform} bindings...`);
      try {
        const clearCf = httpsCallable(getFunctions(app), 'clearPlatformBindings', { timeout: 120000 });
        const cr = await clearCf({ platform: onlyPlatform });
        const cd = cr.data as { success: boolean; listingsCleared?: number; itemsCleared?: number };
        toast.success(`Cleared ${cd.listingsCleared || 0} listings · ${cd.itemsCleared || 0} item back-pointers`);
        await loadItems();
      } catch (err: any) {
        toast.error(`Clear failed: ${err?.message || 'unknown'}`);
        return;
      }
    }
    const platformLabel = onlyPlatform === 'depop' ? 'Depop' : onlyPlatform === 'poshmark' ? 'Poshmark' : 'all platforms';
    toast.info(
      onlySelected
        ? `Matching ${platformLabel} for ${selectedItemIds.size} selected item(s)...`
        : `Matching ${platformLabel}...`,
    );

    // Open the live-progress modal BEFORE the CF call so the user sees events as the
    // agent calls tools. The runId is generated client-side and threaded into the CF
    // request; the CF writes events to aiMatchRuns/{runId}/events as it goes.
    const runId = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAiMatchRunId(runId);
    setShowAiMatchProgress(true);
    // Fresh run wipes any stale Redo exclusions from a previous round.
    setRedoExcludeMap({});
    setAiMatchPlatform(onlyPlatform || null);

    try {
      const cf = httpsCallable(getFunctions(app), 'matchListingsWithAI', { timeout: 540000 });
      const result = await cf({
        onlyItemIds: onlySelected ? Array.from(selectedItemIds) : null,
        onlyPlatform: onlyPlatform || null,
        runId,
      });
      const data = result.data as {
        success: boolean;
        stats?: {
          itemsConsidered: number;
          listingsConsidered: number;
          tier1Bound: number;
          tier2Bound: number;
          tier2MediumPending: number;
          durationMs: number;
          inputTokens: number;
          outputTokens: number;
        };
        proposedMatches?: ProposedMatch[];
        error?: string;
      };

      if (!data.success) {
        toast.error(`Match failed: ${data.error || 'unknown'}`);
        return;
      }

      const s = data.stats;
      console.log(
        `[Match] tier1=${s?.tier1Bound ?? 0} tier2=${s?.tier2Bound ?? 0} medium=${s?.tier2MediumPending ?? 0} ` +
        `(items=${s?.itemsConsidered} listings=${s?.listingsConsidered} ${s?.durationMs}ms tokens(in/out)=${s?.inputTokens}/${s?.outputTokens})`
      );
      console.log('[Match] response keys:', Object.keys(data || {}), 'proposedMatches.length:', Array.isArray(data?.proposedMatches) ? data.proposedMatches.length : 'NOT-ARRAY', 'sample:', data?.proposedMatches?.[0]);

      const proposed = data.proposedMatches || [];
      if (proposed.length === 0) {
        toast.success('Match run complete — no confident matches to confirm.');
        setShowAiMatchProgress(false);
        return;
      }

      // Close the progress modal first so it doesn't visually cover the confirm modal.
      console.log('[Match] opening confirm modal with', proposed.length, 'proposals');
      setShowAiMatchProgress(false);
      setAiProposedMatches(proposed);
      setShowAiConfirm(true);
      toast.info(`Proposed ${proposed.length} match${proposed.length === 1 ? '' : 'es'} — review and confirm.`);
    } catch (err: any) {
      console.error('[Match] failed:', err);
      toast.error(`Match failed: ${err?.message || 'unknown'}`);
    }
  };

  // User confirmed N selected matches in the AIMatchConfirmModal — apply them.
  const handleApplyAiMatches = async (selected: ProposedMatch[]) => {
    if (!user || selected.length === 0) {
      setShowAiConfirm(false);
      return;
    }
    setIsApplyingAiConfirm(true);
    try {
      const userId = user.id;
      const platformListingUpdates = selected.map(m => ({
        platform: m.platform,
        listingId: m.listingId,
        itemId: m.itemId,
      }));
      await bulkSetListingItemIds(userId, platformListingUpdates);

      // Item back-pointer fills in batches.
      const firestore = getFirestore(app);
      const itemPatches = new Map<string, Record<string, any>>();
      for (const m of selected) {
        const patch = itemPatches.get(m.itemId) || {};
        if (m.platform === 'poshmark') {
          patch.poshmarkListingId = m.listingId;
          patch.poshmarkUrl = `https://poshmark.com/listing/${m.listingId}`;
        } else {
          patch.depopListingId = m.listingId;
          patch.depopUrl = `https://www.depop.com/products/${m.listingId}`;
        }
        itemPatches.set(m.itemId, patch);
      }
      const entries = Array.from(itemPatches.entries());
      const BATCH_SIZE = 400;
      for (let start = 0; start < entries.length; start += BATCH_SIZE) {
        const slice = entries.slice(start, start + BATCH_SIZE);
        const batch = writeBatch(firestore);
        for (const [itemId, patch] of slice) {
          batch.update(doc(firestore, 'Item', itemId), patch);
        }
        await batch.commit();
      }
      await loadItems();
      toast.success(`Applied ${selected.length} match${selected.length === 1 ? '' : 'es'}.`);
      setShowAiConfirm(false);
      setAiProposedMatches([]);
    } catch (err: any) {
      console.error('[Match] apply failed:', err);
      toast.error(`Apply failed: ${err?.message || 'unknown'}`);
    } finally {
      setIsApplyingAiConfirm(false);
    }
  };

  // Re-run the matcher on just the unchecked listings, excluding the items the user
  // rejected on this pass (and any prior passes). Replaces those rows in place — does
  // NOT erase the matches the user kept checked.
  const handleRedoMatches = async (rejected: ProposedMatch[]) => {
    if (!user || rejected.length === 0) return;
    setIsRedoingMatches(true);
    try {
      // Merge the freshly-rejected pairs into the running excludeMap.
      const nextExcludeMap: Record<string, string[]> = { ...redoExcludeMap };
      for (const r of rejected) {
        const arr = nextExcludeMap[r.listingId] || [];
        if (!arr.includes(r.itemId)) arr.push(r.itemId);
        nextExcludeMap[r.listingId] = arr;
      }
      setRedoExcludeMap(nextExcludeMap);

      const runId = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAiMatchRunId(runId);
      setShowAiMatchProgress(true);

      const cf = httpsCallable(getFunctions(app), 'matchListingsWithAI', { timeout: 540000 });
      const result = await cf({
        onlyListingIds: rejected.map(r => r.listingId),
        onlyPlatform: aiMatchPlatform || null,
        excludeMap: nextExcludeMap,
        runId,
      });
      const data = result.data as { success: boolean; proposedMatches?: ProposedMatch[]; error?: string };
      if (!data.success) {
        toast.error(`Redo failed: ${data.error || 'unknown'}`);
        return;
      }
      const fresh = data.proposedMatches || [];
      const freshById = new Map(fresh.map(m => [m.listingId, m]));
      // Build the updated proposal list:
      //   - Keep every checked row exactly as-is
      //   - For each rejected row, replace with the fresh proposal if one exists,
      //     otherwise drop the row entirely (no candidate left after exclusion).
      const rejectedIds = new Set(rejected.map(r => r.listingId));
      setAiProposedMatches(prev => {
        const updated: ProposedMatch[] = [];
        for (const m of prev) {
          if (!rejectedIds.has(m.listingId)) {
            updated.push(m);
          } else if (freshById.has(m.listingId)) {
            updated.push(freshById.get(m.listingId)!);
          }
          // else: no fresh candidate — listing drops out of the proposal list.
        }
        return updated;
      });
      const replaced = rejected.filter(r => freshById.has(r.listingId)).length;
      const dropped = rejected.length - replaced;
      toast.success(`Redo: ${replaced} new suggestion${replaced === 1 ? '' : 's'} found · ${dropped} listing${dropped === 1 ? '' : 's'} had no other candidate.`);
    } catch (err: any) {
      console.error('[Match] redo failed:', err);
      toast.error(`Redo failed: ${err?.message || 'unknown'}`);
    } finally {
      setIsRedoingMatches(false);
      setShowAiMatchProgress(false);
    }
  };

  // Handler for accepting a single MEDIUM suggestion from the modal.
  // Applies the same writes a HIGH auto-bind would have:
  //   - PlatformListing.itemId  (via bulkSetListingItemIds)
  //   - Item back-pointer + URL (poshmarkListingId+poshmarkUrl OR depopListingId+depopUrl)
  const handleAcceptSuggestion = async (s: MatchSuggestion) => {
    if (!user) return;
    const userId = user.id;
    try {
      await bulkSetListingItemIds(userId, [
        { platform: s.platform, listingId: s.listingId, itemId: s.ebayItemId },
      ]);

      const firestore = getFirestore(app);
      const patch: Record<string, any> = {};
      if (s.platform === 'poshmark') {
        patch.poshmarkListingId = s.listingId;
        patch.poshmarkUrl = `https://poshmark.com/listing/${s.listingId}`;
      } else {
        patch.depopListingId = s.listingId;
        patch.depopUrl = `https://www.depop.com/products/${s.listingId}`;
      }
      await updateDoc(doc(firestore, 'Item', s.ebayItemId), patch);
      await loadItems();

      toast.success('Match accepted');
      setMatchSuggestions(prev => {
        const next = prev.filter(x => x.id !== s.id);
        if (next.length === 0) setShowMatchSuggestions(false);
        return next;
      });
    } catch (err: any) {
      console.error('[MatchListings] accept failed:', err);
      toast.error(`Accept failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleRejectSuggestion = (s: MatchSuggestion) => {
    setMatchSuggestions(prev => {
      const next = prev.filter(x => x.id !== s.id);
      if (next.length === 0) setShowMatchSuggestions(false);
      return next;
    });
  };

  const handleSkipSuggestion = (s: MatchSuggestion) => {
    setMatchSuggestions(prev => {
      const next = prev.filter(x => x.id !== s.id);
      if (next.length === 0) setShowMatchSuggestions(false);
      return next;
    });
  };

  const handleCalibrateBaseline = async (syncData: SyncStockData) => {
    if (!user) return;
    const userId = user.id;
    setShowSyncStockModal(false);
    try {
      const inputs: SnapshotInput[] = [];
      const perPlatformCount: Record<SaleSnapshotPlatform, number> = { ebay: 0, poshmark: 0, depop: 0, facebook: 0, whatnot: 0 };

      // eBay sales come from ebayActive[].quantitySold (per-listing sold counts).
      // Synthesize one snapshot row per sold unit, keyed by listing+index so re-runs dedupe.
      for (const listing of (syncData.ebayActive || [])) {
        const listingId = String(listing.itemId || listing.listingId || '');
        if (!listingId) continue;
        const sold = Number(listing.quantitySold || 0);
        for (let i = 0; i < sold; i++) {
          inputs.push({
            platform: 'ebay',
            saleKey: `ebay:${listingId}:sold:${i}`,
            listingId,
            title: String(listing.title || '(no title)'),
            salePrice: typeof listing.currentPrice === 'number' ? listing.currentPrice : undefined,
          });
          perPlatformCount.ebay++;
        }
      }

      // Depop sold rows — extension already enriches with _purchaseId, _soldDate, _soldPrice.
      for (const item of (syncData.depopSold || [])) {
        const purchaseId = String((item as any)._purchaseId || (item as any).purchaseId || '');
        const id = String((item as any).id || (item as any).slug || '');
        const saleKey = purchaseId && id ? `depop:${purchaseId}:${id}` : `depop:${id || purchaseId || 'unknown'}:${perPlatformCount.depop}`;
        inputs.push({
          platform: 'depop',
          saleKey,
          listingId: id || purchaseId,
          title: String((item as any).title || (item as any).description || '(no title)'),
          soldAt: (item as any)._soldDate,
          salePrice: typeof (item as any)._soldPrice === 'number' ? (item as any)._soldPrice : undefined,
        });
        perPlatformCount.depop++;
      }

      // Poshmark sold rows — extension provides order_id (preferred), listing_id, sold_date_iso, sale_price.
      for (const row of (syncData.poshmarkSold || [])) {
        const orderId = String((row as any).order_id || '');
        const listingId = String((row as any).listing_id || '');
        const saleKey = orderId
          ? `poshmark:order:${orderId}`
          : listingId
            ? `poshmark:listing:${listingId}:${(row as any).sold_date_iso || perPlatformCount.poshmark}`
            : `poshmark:row:${perPlatformCount.poshmark}`;
        inputs.push({
          platform: 'poshmark',
          saleKey,
          listingId: listingId || orderId,
          title: String((row as any).title || '(no title)'),
          soldAt: (row as any).sold_date_iso,
          salePrice: typeof (row as any).sale_price === 'number' ? (row as any).sale_price : undefined,
        });
        perPlatformCount.poshmark++;
      }

      console.log('[Calibrate] Writing baseline snapshot:', inputs.length, 'entries', perPlatformCount);
      const startMs = Date.now();
      const result = await writeSnapshotBatch(userId, inputs, 'baseline');
      console.log('[Calibrate] Snapshot result:', result);

      // ── Auto-match active listings to local Items by listingId ──
      // Build lookup maps from the current items state (no manual UI — fully automated).
      const itemByEbayId = new Map<string, string>();
      const itemByPoshId = new Map<string, string>();
      const itemByDepopId = new Map<string, string>();
      for (const it of items) {
        if (it.ebayListingId) itemByEbayId.set(it.ebayListingId, it.id);
        if (it.ebayItemId) itemByEbayId.set(it.ebayItemId, it.id);
        if (it.poshmarkListingId) itemByPoshId.set(it.poshmarkListingId, it.id);
        if (it.depopListingId) itemByDepopId.set(it.depopListingId, it.id);
      }

      const listingInputs: UpsertListingInput[] = [];
      const unmatched = { ebay: 0, poshmark: 0, depop: 0 };

      // FLAG (don't skip) listings under $40 across all 3 platforms — preserve as record so
      // the user can review/delete them later. Match button skips flagged rows so they don't
      // pollute auto-link.
      const MIN_LISTING_PRICE = 40;
      let flaggedCount = 0;

      for (const listing of (syncData.ebayActive || [])) {
        const listingId = String(listing.itemId || listing.listingId || '');
        if (!listingId) continue;
        const ebayPrice = typeof listing.currentPrice === 'number'
          ? listing.currentPrice
          : parsePoshDepopPrice(listing.currentPrice);
        const flag: 'low_price' | undefined = (typeof ebayPrice === 'number' && ebayPrice < MIN_LISTING_PRICE) ? 'low_price' : undefined;
        if (flag) flaggedCount++;
        const itemId = itemByEbayId.get(listingId);
        if (!itemId && !flag) unmatched.ebay++;
        listingInputs.push({
          platform: 'ebay',
          listingId,
          title: String(listing.title || '(no title)'),
          price: ebayPrice,
          qty: typeof listing.quantityAvailable === 'number'
            ? listing.quantityAvailable
            : (typeof listing.quantity === 'number' ? listing.quantity - (listing.quantitySold || 0) : undefined),
          qtySold: typeof listing.quantitySold === 'number' ? listing.quantitySold : undefined,
          itemId,
          flagged: flag,
        });
      }

      for (const listing of (syncData.poshmarkActive || [])) {
        const l = listing as any;
        const listingId = String(l.listing_id || l.id || '');
        if (!listingId) continue;
        const price = parsePoshDepopPrice(l.price);
        const flag: 'low_price' | undefined = (typeof price === 'number' && price < MIN_LISTING_PRICE) ? 'low_price' : undefined;
        if (flag) flaggedCount++;
        const itemId = itemByPoshId.get(listingId);
        if (!itemId && !flag) unmatched.poshmark++;
        listingInputs.push({
          platform: 'poshmark',
          listingId,
          title: String(l.title || '(no title)'),
          price,
          itemId,
          flagged: flag,
          // Scraper fields for the deterministic matcher.
          description: typeof l.description === 'string' ? l.description : undefined,
          brand: typeof l.brand === 'string' ? l.brand : undefined,
          sizeRaw: typeof l.size === 'string' ? l.size : undefined,
          color: typeof l.color === 'string' ? l.color : (typeof l.colour === 'string' ? l.colour : undefined),
          category: typeof l.category === 'string' ? l.category : undefined,
        });
      }

      for (const listing of (syncData.depopActive || [])) {
        const l = listing as any;
        const listingId = String(l.id || l.slug || '');
        if (!listingId) continue;
        const price = parsePoshDepopPrice(l.price);
        const flag: 'low_price' | undefined = (typeof price === 'number' && price < MIN_LISTING_PRICE) ? 'low_price' : undefined;
        if (flag) flaggedCount++;
        const itemId = itemByDepopId.get(listingId);
        if (!itemId && !flag) unmatched.depop++;
        listingInputs.push({
          platform: 'depop',
          listingId,
          title: String(l.title || l.description || '(no title)'),
          price,
          itemId,
          flagged: flag,
          // Scraper fields. Depop's `description` is the 200-char extension extract.
          description: typeof l.description === 'string' ? l.description : undefined,
          brand: typeof l.brand === 'string' ? l.brand : undefined,
          sizeRaw: typeof l.size === 'string'
            ? l.size
            : (Array.isArray(l.sizes) && typeof l.sizes[0] === 'string' ? l.sizes[0] : undefined),
          color: typeof l.color === 'string' ? l.color : (typeof l.colour === 'string' ? l.colour : undefined),
          category: typeof l.category === 'string' ? l.category : undefined,
        });
      }
      console.log(`[Calibrate] Flagged ${flaggedCount} listings priced under $${MIN_LISTING_PRICE}`);

      // Second-pass: title fuzzy match for Posh/Depop rows that didn't direct-listing-id match.
      // Skip flagged rows. The matcher uses cleanDescriptiveTitle + multi-strategy internally.
      const ebayAnchorItems = items.filter(it => it.ebayListingId || it.ebayItemId);
      let fuzzyMatched = 0;
      for (const li of listingInputs) {
        if (li.itemId) continue;
        if (li.platform === 'ebay') continue;
        if (li.flagged === 'low_price') continue;
        const result = findEbayMatchForListing(li.title || '', '', ebayAnchorItems, 0.15);
        if (result) {
          li.itemId = result.ebayItem.id;
          fuzzyMatched++;
        }
      }
      // Recount unmatched after fuzzy pass (excluding flagged)
      unmatched.poshmark = listingInputs.filter(l => l.platform === 'poshmark' && !l.itemId && l.flagged !== 'low_price').length;
      unmatched.depop = listingInputs.filter(l => l.platform === 'depop' && !l.itemId && l.flagged !== 'low_price').length;
      console.log(`[Calibrate] Fuzzy-matched ${fuzzyMatched} additional listings by title (cleaned + multi-strategy)`);

      // Each step below is wrapped in its own try/catch so a failure in one collection
      // doesn't lose the work from the others. We collect step results + errors and toast
      // a summary at the end with whatever succeeded.
      const ebayActiveCount = (syncData.ebayActive || []).length;
      const poshActiveCount = (syncData.poshmarkActive || []).length;
      const depopActiveCount = (syncData.depopActive || []).length;
      let ebayActiveUnits = 0;
      for (const listing of (syncData.ebayActive || [])) {
        const q = typeof listing.quantityAvailable === 'number'
          ? listing.quantityAvailable
          : (typeof listing.quantity === 'number' ? listing.quantity - (listing.quantitySold || 0) : 1);
        ebayActiveUnits += Math.max(0, q || 0);
      }
      const totals: InventoryRunTotals = {
        ebay:     { activeListings: ebayActiveCount,  activeUnits: ebayActiveUnits, sales: perPlatformCount.ebay },
        poshmark: { activeListings: poshActiveCount,  sales: perPlatformCount.poshmark },
        depop:    { activeListings: depopActiveCount, sales: perPlatformCount.depop },
        facebook: { activeListings: 0,                sales: perPlatformCount.facebook },
        whatnot:  { activeListings: 0,                sales: perPlatformCount.whatnot },
      };

      const errors: string[] = [];
      let listingsWritten = 0;
      let snapshotId = '';

      // Step: PlatformListing upsert
      try {
        console.log(`[Calibrate] Upserting ${listingInputs.length} PlatformListing rows (unmatched: eBay ${unmatched.ebay} · Posh ${unmatched.poshmark} · Depop ${unmatched.depop})`);
        const upsertResult = await upsertListings(userId, listingInputs);
        listingsWritten = upsertResult.total;
        console.log('[Calibrate] PlatformListing upsert result:', upsertResult);
      } catch (e: any) {
        console.error('[Calibrate] PlatformListing upsert failed:', e);
        errors.push(`PlatformListing: ${e?.message || 'unknown'}`);
      }

      // Step: Per-Item baseline seed (Linear 444-142 Phase 1)
      // Snapshot each eBay-anchored Item's current qty as the per-item baseline.
      // The reconciler reads: ebaySalesSinceBaseline = max(0, baseline - current).
      // User's rule: they don't manually update stock, so any decrease IS a sale.
      try {
        const baselineIso = new Date().toISOString();
        // Build a quick lookup of "what eBay reported this listing's qty as at calibration time"
        const ebayQtyByListing = new Map<string, number>();
        for (const listing of (syncData.ebayActive || [])) {
          const lid = String(listing.itemId || listing.listingId || '');
          if (!lid) continue;
          const q = typeof listing.quantityAvailable === 'number'
            ? listing.quantityAvailable
            : (typeof listing.quantity === 'number' ? listing.quantity - (listing.quantitySold || 0) : 0);
          ebayQtyByListing.set(lid, Math.max(0, q || 0));
        }
        const itemBaselineInputs: Array<{ id: string; ebayQty: number; physQty: number }> = [];
        for (const it of items) {
          if (!it.ebayListingId && !it.ebayItemId) continue;
          const lid = it.ebayListingId || it.ebayItemId!;
          // Prefer the calibration-time eBay qty; fall back to whatever the Item currently has.
          const ebayQty = ebayQtyByListing.get(lid) ?? it.ebayQuantity ?? 0;
          const physQty = typeof it.physicalQuantity === 'number' ? it.physicalQuantity : ebayQty;
          itemBaselineInputs.push({ id: it.id, ebayQty, physQty });
        }
        console.log(`[Calibrate] Seeding per-item baseline for ${itemBaselineInputs.length} eBay-anchored items at ${baselineIso}`);
        const ITEM_BATCH = 400;
        const firestore = getFirestore(app);
        for (let start = 0; start < itemBaselineInputs.length; start += ITEM_BATCH) {
          const slice = itemBaselineInputs.slice(start, start + ITEM_BATCH);
          const batch = writeBatch(firestore);
          for (const r of slice) {
            batch.update(doc(firestore, 'Item', r.id), {
              ebayQuantityAtBaseline: r.ebayQty,
              physicalQuantityAtBaseline: r.physQty,
              baselineCalibratedAt: baselineIso,
            });
          }
          await batch.commit();
        }
        console.log(`[Calibrate] Per-item baseline seed complete.`);
      } catch (e: any) {
        console.error('[Calibrate] Per-item baseline seed failed:', e);
        errors.push(`Per-item baseline: ${e?.message || 'unknown'}`);
      }

      // Step: CalibrationStatus + per-platform baseline counts
      try {
        await Promise.all([
          confirmPlatformCount(userId, 'ebay', ebayActiveCount),
          confirmPlatformCount(userId, 'poshmark', poshActiveCount),
          confirmPlatformCount(userId, 'depop', depopActiveCount),
          recordBaselineSnapshot(userId, 'ebay', perPlatformCount.ebay),
          recordBaselineSnapshot(userId, 'poshmark', perPlatformCount.poshmark),
          recordBaselineSnapshot(userId, 'depop', perPlatformCount.depop),
        ]);
      } catch (e: any) {
        console.error('[Calibrate] CalibrationStatus update failed:', e);
        errors.push(`CalibrationStatus: ${e?.message || 'unknown'}`);
      }

      // Step: InventorySnapshot doc
      try {
        snapshotId = await writeSnapshot({
          userId,
          reason: 'calibration',
          totals,
          saleSnapshotIds: result.insertedIds,
        });
        console.log('[Calibrate] InventorySnapshot written:', snapshotId);
      } catch (e: any) {
        console.error('[Calibrate] InventorySnapshot write failed:', e);
        errors.push(`InventorySnapshot: ${e?.message || 'unknown'}`);
      }

      // Step: ActivityLog CALIBRATION_RUN entry
      try {
        await logCalibrationRun(userId, {
          snapshotId: snapshotId || '(none)',
          totals,
          salesInserted: result.inserted,
          salesSkipped: result.skipped,
          listingsUpserted: listingsWritten,
          unmatchedByPlatform: unmatched,
          durationMs: Date.now() - startMs,
        });
      } catch (e: any) {
        console.error('[Calibrate] CALIBRATION_RUN log failed:', e);
        errors.push(`ActivityLog: ${e?.message || 'unknown'}`);
      }

      const totalUnmatched = unmatched.ebay + unmatched.poshmark + unmatched.depop;
      const summary = `${listingsWritten} listings · ${result.inserted} sales (eBay ${perPlatformCount.ebay} · Posh ${perPlatformCount.poshmark} · Depop ${perPlatformCount.depop})${totalUnmatched > 0 ? ` · ${totalUnmatched} unmatched` : ''}`;
      if (errors.length === 0) {
        toast.success(`Baseline locked — ${summary}`);
      } else {
        // Partial success — sales+snapshot may have landed even if other steps errored.
        toast.warning(
          `Baseline partial — ${summary}. Errors: ${errors.join(' · ')}`,
          { duration: 12000 },
        );
        console.warn('[Calibrate] partial success. Errors:', errors);
      }
    } catch (err: any) {
      // Catches errors in writeSnapshotBatch (the very first step) — everything else has its own try/catch
      console.error('[Calibrate] failed at sale snapshot batch:', err);
      toast.error(`Calibrate failed at sale snapshot: ${err?.message || 'Unknown error'}`);
    }
  };

  // Process data collected from SyncStockModal: update eBay qty, link listings, detect sold, reconcile
  const handleReconciliationFromSyncData = async (syncData: SyncStockData) => {
    if (!user) return;
    setShowSyncStockModal(false);
    setIsSyncingFromEbay(true);

    try {
      const ebayItems = items.filter(i => i.ebayListingId || i.ebayItemId);
      const db = getFirestore(app);
      const qtyMap = syncData.ebayQtyMap;
      const soldMap = syncData.ebaySold;

      const MAX_UNIT_SALES = 200;
      const MAX_ITEM_ACTIVITY = 50;

      toast.info('Updating eBay quantities + computing true stock on hand...');

      // Step 1: Update each eBay item with true stock on hand
      for (const item of ebayItems) {
        const listingId = item.ebayListingId || item.ebayItemId!;
        const ebayQty = qtyMap.get(listingId);
        if (ebayQty === undefined || isNaN(ebayQty)) continue;

        const localSold = item.unitSales?.filter(s => s.platform === 'ebay').length || 0;
        const ebaySold = soldMap.get(listingId) || 0;
        const newEbaySales = ebaySold - localSold;

        const nonEbaySalesCount = (item.unitSales || []).filter(
          s => s.platform === 'poshmark' || s.platform === 'depop' || s.platform === 'in_person'
        ).length;
        const trueStockOnHand = Math.max(0, ebayQty - nonEbaySalesCount);

        const updatePayload: Record<string, any> = {
          ebayQuantity: ebayQty,
          physicalQuantity: trueStockOnHand,
          updatedAt: serverTimestamp(),
        };

        if (newEbaySales > 0) {
          const newPhysical = Math.max(0, trueStockOnHand - newEbaySales);
          let newStockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'SOLD' =
            newPhysical === 0 ? 'SOLD' : newPhysical <= 2 ? 'LOW_STOCK' : 'IN_STOCK';

          const newSaleEntries = [];
          for (let s = 0; s < newEbaySales; s++) {
            newSaleEntries.push({
              soldAt: new Date().toISOString(),
              platform: 'ebay',
              priceCents: item.manualPriceCents || 0,
            });
          }

          const activityEntry = {
            action: 'SOLD',
            timestamp: new Date().toISOString(),
            details: `${newEbaySales} sold on eBay (auto-detected)`,
            oldValue: String(trueStockOnHand),
            newValue: String(newPhysical),
          };

          updatePayload.physicalQuantity = newPhysical;
          updatePayload.stockStatus = newStockStatus;
          updatePayload.unitSales = [...(item.unitSales || []), ...newSaleEntries].slice(-MAX_UNIT_SALES);
          updatePayload.itemActivity = [...(item.itemActivity || []), activityEntry].slice(-MAX_ITEM_ACTIVITY);

          for (let s = 0; s < newEbaySales; s++) {
            try {
              await recordSale({
                userId: user.id,
                itemId: item.id,
                itemName: item.name,
                itemImageUrl: item.imageUrl,
                salePrice: item.ebayPrice || item.manualPriceCents || 0,
                costPrice: item.costPrice || 0,
                marketplace: 'ebay',
                saleSource: 'auto_ebay_sync',
                marketplaceUrl: item.ebayUrl,
                notes: `Auto-detected eBay sale (${s + 1} of ${newEbaySales})`,
              });
            } catch (e) { console.error('recordSale eBay failed:', e); }
          }
        }

        try { await updateDoc(doc(db, 'Item', item.id), updatePayload); } catch {}
      }

      toast.info('Linking Depop + Poshmark listings...');

      // Step 2: Link active Depop listings
      const depopActive = (syncData.depopActive || []).filter((l: any) =>
        !l.sold && l.status !== 'sold' && l.status !== 'SOLD'
      );
      for (const listing of depopActive) {
        const title = listing.description || listing.title || '';
        const size = listing.sizes?.[0] || listing.size || '';
        const match = findEbayMatchForListing(title, size, ebayItems);
        if (match && match.confidence >= 0.15) {
          const depopUrl = listing.url || (listing.slug ? `https://www.depop.com/products/${listing.slug}` : '');
          if (!match.ebayItem.depopListingId) {
            try {
              await updateDoc(doc(db, 'Item', match.ebayItem.id), {
                depopListingId: listing.id || listing.slug,
                depopUrl,
                depopQuantity: 1,
              });
            } catch {}
          }
        }
      }

      // Step 3: Link active Poshmark listings
      const poshActive = (syncData.poshmarkActive || []).filter((l: any) =>
        !l.sold && l.status !== 'sold' && l.status !== 'sold_out'
      );
      for (const listing of poshActive) {
        const listingId = listing.listing_id || listing.id;
        const title = listing.title || listing.description || '';
        const size = listing.size || '';
        const match = findEbayMatchForListing(title, size, ebayItems);
        if (match && match.confidence >= 0.15) {
          const poshmarkUrl = listing.listingUrl || listing.listing_url || `https://poshmark.com/listing/${listingId}`;
          if (!match.ebayItem.poshmarkListingId) {
            try {
              await updateDoc(doc(db, 'Item', match.ebayItem.id), {
                poshmarkListingId: listingId,
                poshmarkUrl,
                poshmarkQuantity: 1,
              });
            } catch {}
          }
        }
      }

      toast.info('Recording non-eBay sales...');

      // Step 4: Record Depop sold items
      // Track unmatched + bundles so we can surface them to the user.
      const depopUnmatched: any[] = [];
      const depopBundles: any[] = [];
      const depopPotentialBundles: any[] = []; // receipts where items[] was empty (may be bundles)

      const depopSold = (syncData.depopSold || []).filter((l: any) =>
        l.sold || l._soldFromAPI || l.status === 'sold' || l.status === 'SOLD'
      );
      for (const listing of depopSold) {
        const soldId = listing.id || listing.slug;

        // Track bundles + potential bundles for user review
        if (listing._isBundle) depopBundles.push(listing);
        if (listing._itemsArrayMissing) depopPotentialBundles.push(listing);

        const linkedItem = items.find(i => i.depopListingId === soldId);
        if (!linkedItem) {
          depopUnmatched.push(listing);
          continue;
        }
        const alreadyRecorded = (linkedItem.unitSales || []).some(
          // Dedupe by _purchaseId (unique per receipt) so bundle multi-unit sales aren't collapsed
          (s: any) => s.platform === 'depop' && s.note === `depop:${listing._purchaseId || soldId}`
        );
        if (alreadyRecorded) continue;

        const soldPrice = typeof listing._soldPrice === 'number' ? listing._soldPrice : parseFloat(listing._soldPrice || '0') || 0;
        const soldDate = listing._soldDate || new Date().toISOString();
        const existingSales = linkedItem.unitSales || [];
        const noteKey = `depop:${listing._purchaseId || soldId}`;
        const bundleNote = listing._isBundle ? ` [BUNDLE ${listing._bundleSize}x]` : '';

        try {
          await updateDoc(doc(db, 'Item', linkedItem.id), {
            physicalQuantity: Math.max(0, (linkedItem.physicalQuantity ?? 1) - 1),
            stockStatus: (linkedItem.physicalQuantity ?? 1) - 1 <= 0 ? 'SOLD' : 'IN_STOCK',
            unitSales: [...existingSales, {
              soldAt: soldDate, platform: 'depop', priceCents: Math.round(soldPrice * 100), note: noteKey + bundleNote,
            }],
          });
          try {
            await recordSale({
              userId: user.id, itemId: linkedItem.id, itemName: linkedItem.name, itemImageUrl: linkedItem.imageUrl,
              salePrice: Math.round(soldPrice * 100), costPrice: linkedItem.costPrice || 0,
              marketplace: 'depop', saleSource: 'auto_ebay_sync',
              notes: `Auto-detected from Depop sold page (receipt ${listing._purchaseId || soldId})${bundleNote}`,
            });
          } catch {}
        } catch {}
      }

      // Report Depop sync stats so user can review bundles + unmatched sales
      if (depopUnmatched.length > 0 || depopBundles.length > 0 || depopPotentialBundles.length > 0) {
        console.group('[SyncStock] Depop sold review');
        console.log(`Bundles detected: ${depopBundles.length}`);
        if (depopBundles.length > 0) console.table(depopBundles.map(b => ({ purchaseId: b._purchaseId, bundleSize: b._bundleSize, title: b.title })));
        console.log(`Potential bundles (receipt without items[]): ${depopPotentialBundles.length}`);
        if (depopPotentialBundles.length > 0) console.table(depopPotentialBundles.map(b => ({ purchaseId: b._purchaseId, soldPrice: b._soldPrice, title: b.title })));
        console.log(`Unmatched to inventory: ${depopUnmatched.length}`);
        if (depopUnmatched.length > 0) console.table(depopUnmatched.map(u => ({ id: u.id, title: u.title, purchaseId: u._purchaseId, soldPrice: u._soldPrice })));
        console.groupEnd();

        const parts: string[] = [];
        if (depopBundles.length > 0) parts.push(`${depopBundles.length} bundles`);
        if (depopPotentialBundles.length > 0) parts.push(`${depopPotentialBundles.length} possible bundles`);
        if (depopUnmatched.length > 0) parts.push(`${depopUnmatched.length} unmatched`);
        if (parts.length > 0) toast.warning(`Depop review: ${parts.join(' · ')} — check console (F12)`, { duration: 10000 });
      }

      // Step 5: Record Poshmark sold items
      const poshUnmatched: any[] = [];
      const poshRefunded: any[] = [];
      const poshSold = (syncData.poshmarkSold || []).filter((l: any) => {
        // Exclude refunded/cancelled — they shouldn't decrement stock
        if (l.is_refunded) { poshRefunded.push(l); return false; }
        return l.sold || l.status === 'sold' || l.status === 'sold_out' || l.status === 'not_for_sale';
      });
      if (poshRefunded.length > 0) {
        console.log(`[SyncStock] Poshmark: filtered out ${poshRefunded.length} refunded/cancelled orders`);
      }
      for (const listing of poshSold) {
        // Prefer order_id as dedupe key (unique per sale); fall back to listing_id
        const soldId = listing.listing_id || listing.id;
        const saleKey = listing.order_id || soldId;
        const linkedItem = items.find(i => i.poshmarkListingId === soldId);
        if (!linkedItem) { poshUnmatched.push(listing); continue; }
        const alreadyRecorded = (linkedItem.unitSales || []).some(
          (s: any) => s.platform === 'poshmark' && s.note === `posh:${saleKey}`
        );
        if (alreadyRecorded) continue;

        const soldPrice = typeof listing.sale_price === 'number' ? listing.sale_price
          : typeof listing.price === 'number' ? listing.price
          : parseFloat(String(listing.price) || '0') || 0;
        const soldAt = listing.sold_date_iso || new Date().toISOString();
        const existingSales = linkedItem.unitSales || [];

        try {
          await updateDoc(doc(db, 'Item', linkedItem.id), {
            physicalQuantity: Math.max(0, (linkedItem.physicalQuantity ?? 1) - 1),
            stockStatus: (linkedItem.physicalQuantity ?? 1) - 1 <= 0 ? 'SOLD' : 'IN_STOCK',
            unitSales: [...existingSales, {
              soldAt, platform: 'poshmark', priceCents: Math.round(soldPrice * 100), note: `posh:${saleKey}`,
            }],
          });
          try {
            await recordSale({
              userId: user.id, itemId: linkedItem.id, itemName: linkedItem.name, itemImageUrl: linkedItem.imageUrl,
              salePrice: Math.round(soldPrice * 100), costPrice: linkedItem.costPrice || 0,
              marketplace: 'poshmark', saleSource: 'auto_ebay_sync',
              notes: `Auto-detected from Poshmark sold page (order ${listing.order_id || saleKey})`,
            });
          } catch {}
        } catch {}
      }

      // Report Poshmark unmatched
      if (poshUnmatched.length > 0) {
        console.group('[SyncStock] Poshmark sold review');
        console.log(`Unmatched to inventory: ${poshUnmatched.length}`);
        console.table(poshUnmatched.map(u => ({
          listingId: u.listing_id || u.id,
          title: u.title || u.description,
          price: u.price,
        })));
        console.groupEnd();
        toast.warning(`Poshmark: ${poshUnmatched.length} sold items unmatched to inventory — check console (F12)`, { duration: 10000 });
      }

      // Step 6: Reload items and run reconciliation on fresh data
      await loadItems();
      const freshItems = useItemStore.getState().items;
      // Pass user's sale-window preference: since they restock frequently, only count
      // sales within the last N days (default 30). 0 = count all history.
      const reconResult = reconcileStock(freshItems, qtyMap, syncData.saleWindowDays);
      setReconciliationResult(reconResult);
      setShowReconciliation(true);

      if (reconResult.summary.issues > 0) {
        toast.warning(`${reconResult.summary.issues} stock issue${reconResult.summary.issues > 1 ? 's' : ''} found`);
      } else {
        toast.success('All platforms synced — no stock issues!');
      }

      // ─────────────────────────────────────────────────────────────────
      // Phase B: track this sync run against the calibrated baseline.
      // Each step has its own try/catch so a write failure in one collection
      // doesn't block the others. Existing reconcile behavior above is unchanged.
      // ─────────────────────────────────────────────────────────────────
      try {
        const userId = user.id;
        const syncRunStart = new Date().toISOString();
        const syncStartMs = Date.now();

        // 1. Build listing-upsert payloads + auto-match to local Items
        const itemByEbayId = new Map<string, string>();
        const itemByPoshId = new Map<string, string>();
        const itemByDepopId = new Map<string, string>();
        for (const it of freshItems) {
          if (it.ebayListingId) itemByEbayId.set(it.ebayListingId, it.id);
          if (it.ebayItemId) itemByEbayId.set(it.ebayItemId, it.id);
          if (it.poshmarkListingId) itemByPoshId.set(it.poshmarkListingId, it.id);
          if (it.depopListingId) itemByDepopId.set(it.depopListingId, it.id);
        }
        const ebayAnchorItems = freshItems.filter(it => it.ebayListingId || it.ebayItemId);

        const listingInputs: UpsertListingInput[] = [];
        const MIN_LISTING_PRICE_RECON = 40;

        for (const listing of (syncData.ebayActive || [])) {
          const listingId = String(listing.itemId || listing.listingId || '');
          if (!listingId) continue;
          const ebayPrice = typeof listing.currentPrice === 'number'
            ? listing.currentPrice
            : parsePoshDepopPrice(listing.currentPrice);
          const flag: 'low_price' | undefined = (typeof ebayPrice === 'number' && ebayPrice < MIN_LISTING_PRICE_RECON) ? 'low_price' : undefined;
          listingInputs.push({
            platform: 'ebay',
            listingId,
            title: String(listing.title || '(no title)'),
            price: ebayPrice,
            qty: typeof listing.quantityAvailable === 'number'
              ? listing.quantityAvailable
              : (typeof listing.quantity === 'number' ? listing.quantity - (listing.quantitySold || 0) : undefined),
            qtySold: typeof listing.quantitySold === 'number' ? listing.quantitySold : undefined,
            itemId: itemByEbayId.get(listingId),
            flagged: flag,
          });
        }
        for (const listing of (syncData.poshmarkActive || [])) {
          const listingId = String((listing as any).listing_id || (listing as any).id || '');
          if (!listingId) continue;
          const price = parsePoshDepopPrice((listing as any).price);
          const flag: 'low_price' | undefined = (typeof price === 'number' && price < MIN_LISTING_PRICE_RECON) ? 'low_price' : undefined;
          listingInputs.push({
            platform: 'poshmark',
            listingId,
            title: String((listing as any).title || '(no title)'),
            price,
            itemId: itemByPoshId.get(listingId),
            flagged: flag,
          });
        }
        for (const listing of (syncData.depopActive || [])) {
          const listingId = String((listing as any).id || (listing as any).slug || '');
          if (!listingId) continue;
          const price = parsePoshDepopPrice((listing as any).price);
          const flag: 'low_price' | undefined = (typeof price === 'number' && price < MIN_LISTING_PRICE_RECON) ? 'low_price' : undefined;
          listingInputs.push({
            platform: 'depop',
            listingId,
            title: String((listing as any).title || (listing as any).description || '(no title)'),
            price,
            itemId: itemByDepopId.get(listingId),
            flagged: flag,
          });
        }

        // Title fuzzy match for unmatched Posh/Depop. Skip flagged (sub-$40) — those are junk.
        // findEbayMatchForListing now uses cleanDescriptiveTitle + multi-strategy internally.
        for (const li of listingInputs) {
          if (li.itemId || li.platform === 'ebay' || li.flagged === 'low_price') continue;
          const fuzzy = findEbayMatchForListing(li.title || '', '', ebayAnchorItems, 0.15);
          if (fuzzy) li.itemId = fuzzy.ebayItem.id;
        }

        // 2. Upsert PlatformListing rows
        await upsertListings(userId, listingInputs);

        // 3. Mark previously-active listings that we DIDN'T see this run as 'removed'
        const removedAll: Array<{ platform: 'ebay' | 'poshmark' | 'depop'; listingId: string; title: string; itemId?: string; lastSeenAt: string }> = [];
        for (const platform of ['ebay', 'poshmark', 'depop'] as const) {
          try {
            const stale = await markRemovedListings(userId, platform, syncRunStart);
            for (const r of stale) {
              removedAll.push({ platform, listingId: r.listingId, title: r.title, itemId: r.itemId, lastSeenAt: r.lastSeenAt });
            }
          } catch (e) {
            console.warn(`[SyncStock] markRemovedListings ${platform} failed:`, e);
          }
        }

        // 4. Detect NEW sales (not already in SaleSnapshot) and write them as 'pending'
        const saleInputs: SnapshotInput[] = [];
        // eBay synthetic sales — same key shape as calibrate so dedupe works
        for (const listing of (syncData.ebayActive || [])) {
          const listingId = String(listing.itemId || listing.listingId || '');
          if (!listingId) continue;
          const sold = Number(listing.quantitySold || 0);
          for (let i = 0; i < sold; i++) {
            saleInputs.push({
              platform: 'ebay',
              saleKey: `ebay:${listingId}:sold:${i}`,
              listingId,
              title: String(listing.title || '(no title)'),
              salePrice: typeof listing.currentPrice === 'number' ? listing.currentPrice : undefined,
            });
          }
        }
        for (const item of (syncData.depopSold || [])) {
          const purchaseId = String((item as any)._purchaseId || (item as any).purchaseId || '');
          const id = String((item as any).id || (item as any).slug || '');
          const saleKey = purchaseId && id ? `depop:${purchaseId}:${id}` : `depop:${id || purchaseId || 'unknown'}:${saleInputs.length}`;
          saleInputs.push({
            platform: 'depop', saleKey, listingId: id || purchaseId,
            title: String((item as any).title || (item as any).description || '(no title)'),
            soldAt: (item as any)._soldDate,
            salePrice: typeof (item as any)._soldPrice === 'number' ? (item as any)._soldPrice : undefined,
          });
        }
        for (const row of (syncData.poshmarkSold || [])) {
          const orderId = String((row as any).order_id || '');
          const listingId = String((row as any).listing_id || '');
          const saleKey = orderId
            ? `poshmark:order:${orderId}`
            : listingId
              ? `poshmark:listing:${listingId}:${(row as any).sold_date_iso || saleInputs.length}`
              : `poshmark:row:${saleInputs.length}`;
          saleInputs.push({
            platform: 'poshmark', saleKey, listingId: listingId || orderId,
            title: String((row as any).title || '(no title)'),
            soldAt: (row as any).sold_date_iso,
            salePrice: typeof (row as any).sale_price === 'number' ? (row as any).sale_price : undefined,
          });
        }

        // writeSnapshotBatch dedupes by saleKey — only NEW saleKeys get written.
        // status='pending' so the spreadsheet view can flag them as user-actionable.
        const saleResult = await writeSnapshotBatch(userId, saleInputs, 'pending');

        // 5. Write a sync InventorySnapshot
        let ebayActiveUnits = 0;
        for (const listing of (syncData.ebayActive || [])) {
          const q = typeof listing.quantityAvailable === 'number'
            ? listing.quantityAvailable
            : (typeof listing.quantity === 'number' ? listing.quantity - (listing.quantitySold || 0) : 1);
          ebayActiveUnits += Math.max(0, q || 0);
        }
        const totals: InventoryRunTotals = {
          ebay:     { activeListings: (syncData.ebayActive || []).length, activeUnits: ebayActiveUnits, sales: saleInputs.filter(s => s.platform === 'ebay').length },
          poshmark: { activeListings: (syncData.poshmarkActive || []).length, sales: saleInputs.filter(s => s.platform === 'poshmark').length },
          depop:    { activeListings: (syncData.depopActive || []).length, sales: saleInputs.filter(s => s.platform === 'depop').length },
          facebook: { activeListings: 0, sales: saleInputs.filter(s => s.platform === 'facebook').length },
          whatnot:  { activeListings: 0, sales: saleInputs.filter(s => s.platform === 'whatnot').length },
        };
        const snapshotId = await writeSnapshot({ userId, reason: 'sync', totals, saleSnapshotIds: saleResult.insertedIds });

        // 6. Append SYNC_RUN + SALE_DETECTED + LISTING_REMOVED audit-log entries
        await logSyncRun(userId, {
          snapshotId, totals,
          newSalesDetected: saleResult.inserted,
          listingsAdded: 0, // we don't differentiate added-this-run from existing in upsert
          listingsRemoved: removedAll.length,
          durationMs: Date.now() - syncStartMs,
        });
        // Per-event logs for the new sales
        for (let i = 0; i < saleInputs.length && i < saleResult.insertedIds.length; i++) {
          const s = saleInputs[i];
          const id = saleResult.insertedIds[i];
          if (!id) continue;
          logSaleDetected(userId, {
            platform: s.platform, listingId: s.listingId, saleKey: s.saleKey,
            salePrice: s.salePrice, soldAt: s.soldAt, saleSnapshotId: id,
          });
        }
        // Per-event logs for removed listings
        for (const r of removedAll) {
          logListingRemoved(userId, {
            platform: r.platform, listingId: r.listingId, title: r.title,
            itemId: r.itemId, lastSeenAt: r.lastSeenAt,
          });
        }

        console.log(`[SyncStock] Phase B tracking complete: ${saleResult.inserted} new sales (status: pending), ${removedAll.length} listings removed, snapshot ${snapshotId}`);
        if (saleResult.inserted > 0 || removedAll.length > 0) {
          toast.info(`Tracked: ${saleResult.inserted} new sale${saleResult.inserted === 1 ? '' : 's'} · ${removedAll.length} removed listing${removedAll.length === 1 ? '' : 's'}`);
        }
      } catch (trackErr: any) {
        console.error('[SyncStock] Phase B tracking failed (existing reconcile still succeeded):', trackErr);
        // Non-fatal — reconcile already toasted success above.
      }
    } catch (err: any) {
      console.error('[SyncStock] Reconciliation failed:', err);
      toast.error(`Reconciliation failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSyncingFromEbay(false);
    }
  };

  // Quick eBay-only quantity refresh (the "Check Quantity" button).
  // Pulls current eBay listing quantities and pushes them into local Firestore so
  // the imported inventory matches eBay reality. Does NOT touch Depop/Poshmark and
  // does NOT run reconciliation — that's the new SyncStockModal's job.
  // ── Unified Check Quantity ───────────────────────────────────────────────
  // One corner widget reconciles every site vs real stock. eBay is mirrored
  // up front (bulk), then Poshmark/Depop are verified per item in the panel.
  const [unifiedItems, setUnifiedItems] = useState<Item[] | null>(null);
  // eBay: items with stock that should be 0 (sold elsewhere) → confirm delist.
  const [ebayDelistCandidates, setEbayDelistCandidates] = useState<Item[]>([]);
  const [showEbayDelist, setShowEbayDelist] = useState(false);

  // Single entry point: open the unified panel IMMEDIATELY. The panel runs the
  // eBay bulk mirror as step 0 (chips show "checking"), then walks Poshmark/Depop.
  // Scope = selected items if any, else everything on at least one site.
  const startUnifiedCheck = () => {
    if (isSyncingFromEbay || unifiedItems !== null) { toast.warning('Check already running'); return; }
    const all = useItemStore.getState().items as any[];
    const onAnySite = all.filter((i) => i.ebayListingId || i.ebayItemId || i.poshmarkListingId || i.depopListingId);
    const selected = onAnySite.filter((i) => selectedItemIds.has(i.id));
    const scope = (selected.length > 0 ? selected : onAnySite) as Item[];
    if (scope.length === 0) { toast.info('No listed items to check.'); return; }
    setUnifiedItems(scope);
  };

  // After the Posh/Depop walk: flag eBay listings still live but real stock ≤ 0.
  const onUnifiedDone = () => {
    const fresh = useItemStore.getState().items as any[];
    const candidates = fresh.filter((i) => {
      if (!(i.ebayListingId || i.ebayItemId)) return false;
      if (i.ebayDelisted === true) return false;
      if ((i.ebayQuantity ?? 0) <= 0) return false;
      return stockOnHand(i) <= 0; // ebayQty − non-eBay sales < 1 ⇒ should be delisted
    });
    if (candidates.length > 0) {
      setEbayDelistCandidates(candidates as Item[]);
      setShowEbayDelist(true);
    }
  };

  const confirmEbayDelist = async () => {
    let ended = 0;
    for (const it of ebayDelistCandidates) {
      const ebayId = (it as any).ebayListingId || (it as any).ebayItemId;
      if (!ebayId) continue;
      try {
        await ebayService.endItem(ebayId);
      } catch (err: any) {
        if (!err?.message?.includes('already been closed')) {
          console.warn('[eBay delist] end failed for', it.id, err?.message);
        }
      }
      try {
        await updateDoc(doc(getFirestore(app), 'Item', it.id), {
          ebayDelisted: true,
          ebayQuantity: 0,
          status: 'SOLD',
          stockStatus: 'OUT_OF_STOCK',
          updatedAt: serverTimestamp(),
        });
        ended++;
      } catch (err) {
        console.error('[eBay delist] patch failed for', it.id, err);
      }
    }
    toast.success(`Delisted ${ended} item${ended === 1 ? '' : 's'} from eBay`);
    setShowEbayDelist(false);
    setEbayDelistCandidates([]);
    await loadItems();
  };

  const handleCheckEbayQuantities = async () => {
    console.log('[CheckQty] Button clicked. user:', !!user, 'items:', items.length, 'isSyncing:', isSyncingFromEbay);
    if (isSyncingFromEbay) {
      toast.warning('Sync already in progress — wait for it to finish');
      return;
    }
    if (!user) {
      toast.error('Not signed in — refresh and try again');
      return;
    }
    const ebayItems = items.filter(i => i.ebayListingId || i.ebayItemId);
    console.log('[CheckQty] Items with eBay listings:', ebayItems.length);
    if (ebayItems.length === 0) {
      toast.error('No items have an eBay listing');
      return;
    }

    setIsSyncingFromEbay(true);
    setSyncProgress({ current: 0, total: ebayItems.length });
    toast.info(`Checking eBay quantities for ${ebayItems.length} items...`);
    console.log('[CheckQty] Calling ebayGetAllListings Cloud Function...');

    try {
      const getAllListings = httpsCallable(getFunctions(app), 'ebayGetAllListings', { timeout: 300000 });
      const cloudCallStart = Date.now();
      const result = await getAllListings({ fetchAll: true });
      console.log(`[CheckQty] Cloud Function returned in ${Date.now() - cloudCallStart}ms`);
      const data = result.data as { success: boolean; listings: Array<{ itemId: string; quantity: number; quantityAvailable?: number; quantitySold?: number }> };
      if (!data?.success || !data?.listings) {
        console.error('[CheckQty] Bad response:', data);
        toast.error('Failed to fetch eBay listings');
        setIsSyncingFromEbay(false);
        setSyncProgress(null);
        return;
      }
      console.log(`[CheckQty] Got ${data.listings.length} eBay listings, building maps...`);

      // Build qty + sold maps
      const qtyMap = new Map<string, number>();
      const soldMap = new Map<string, number>();
      for (const listing of data.listings) {
        if (!listing.itemId) continue;
        const available = listing.quantityAvailable ?? (listing.quantity - (listing.quantitySold || 0));
        qtyMap.set(listing.itemId, typeof available === 'number' ? available : 0);
        soldMap.set(listing.itemId, listing.quantitySold || 0);
      }
      console.log(`[CheckQty] Built qtyMap (${qtyMap.size}) + soldMap. Diffing local items...`);

      // eBay is the source of truth right now — blindly mirror every eBay value
      // into Firestore. No "unchanged" diff: just write what eBay reports for every
      // item that has an eBay listingId and was found in the API response.
      type Pending = { itemId: string; payload: Record<string, any>; oldQty: number; newQty: number; name: string; listingId: string };
      const pending: Pending[] = [];
      let noMatch = 0;
      const noMatchSamples: Array<{ id: string; name: string; listingId: string }> = [];
      const changes: Pending[] = [];
      for (const item of ebayItems) {
        const listingId = item.ebayListingId || item.ebayItemId!;
        const ebayQty = qtyMap.get(listingId);
        const oldQty = item.physicalQuantity ?? item.ebayQuantity ?? -1;
        // CASE 1: listing not found in current eBay API response — eBay no longer
        // shows it (ended / delisted / unavailable). Flag as ebayDelisted so the
        // closet badge swaps from "e" to OOS marker. Don't drop the listingId —
        // we want to preserve the historical link for the baseline-diff math.
        if (ebayQty === undefined) {
          noMatch++;
          if (noMatchSamples.length < 5) {
            noMatchSamples.push({ id: item.id, name: item.name || '(no name)', listingId });
          }
          const entry: Pending = {
            itemId: item.id,
            payload: {
              ebayQuantity: 0,
              ebayDelisted: true,
              stockStatus: 'OUT_OF_STOCK',
              status: 'SOLD',
              updatedAt: serverTimestamp(),
            },
            oldQty,
            newQty: 0,
            name: item.name || '(no name)',
            listingId,
          };
          pending.push(entry);
          if (oldQty !== 0) changes.push(entry);
          continue;
        }
        const ebaySoldNum = soldMap.get(listingId) || 0;
        let newStockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'SOLD';
        if (ebayQty <= 0) newStockStatus = 'OUT_OF_STOCK';
        else if (ebayQty <= 2) newStockStatus = 'LOW_STOCK';
        else newStockStatus = 'IN_STOCK';
        // Also set top-level status: IN_STOCK if eBay says qty > 0, else SOLD.
        // The transform in useItemStore renders status === 'IN_STOCK' as "Active"
        // in the closet table — without this, every row shows "Inactive".
        const newTopStatus = ebayQty > 0 ? 'IN_STOCK' : 'SOLD';
        const entry: Pending = {
          itemId: item.id,
          payload: {
            ebayQuantity: ebayQty,
            ebayQuantitySold: ebaySoldNum,
            // Clear delisted flag if eBay is showing the listing again with qty > 0.
            ebayDelisted: ebayQty === 0 ? true : false,
            physicalQuantity: ebayQty,
            stockStatus: newStockStatus,
            status: newTopStatus,
            updatedAt: serverTimestamp(),
          },
          oldQty,
          newQty: ebayQty,
          name: item.name || '(no name)',
          listingId,
        };
        pending.push(entry);
        if (oldQty !== ebayQty) changes.push(entry);
      }
      console.log(`[CheckQty] Mirroring ${pending.length} items from eBay; ${noMatch} not found on eBay`);
      console.log(`[CheckQty] ${changes.length} items have a DIFFERENT qty than eBay (will visibly change). ${pending.length - changes.length} already match.`);
      if (changes.length > 0) {
        console.table(changes.slice(0, 15).map(c => ({
          name: c.name.substring(0, 40),
          listingId: c.listingId,
          local: c.oldQty,
          ebay: c.newQty,
          firestoreId: c.itemId,
        })));
      } else {
        console.log('[CheckQty] No qty differences detected — your local data already matches what eBay reports right now.');
      }
      if (noMatchSamples.length > 0) {
        console.warn('[CheckQty] First 5 items NOT found on eBay (probably ended/private listings):', noMatchSamples);
      }

      // Second pass: write in BATCHES of 400 (Firestore batch limit is 500, leave headroom)
      // Each batch is a single roundtrip → much faster than 232 sequential updateDoc calls
      const firestore = getFirestore(app);
      const BATCH_SIZE = 400;
      let updated = 0;
      for (let start = 0; start < pending.length; start += BATCH_SIZE) {
        const slice = pending.slice(start, start + BATCH_SIZE);
        const batch = writeBatch(firestore);
        for (const p of slice) {
          batch.update(doc(firestore, 'Item', p.itemId), p.payload);
        }
        try {
          await batch.commit();
          updated += slice.length;
          console.log(`[CheckQty] Batch ${Math.floor(start / BATCH_SIZE) + 1} committed (${slice.length} items, ${updated}/${pending.length} total)`);
          setSyncProgress({ current: updated, total: pending.length });
        } catch (e) {
          console.error('[CheckQty] Batch commit failed:', e);
        }
      }

      console.log('[CheckQty] All batches done. Patching local store in-place...');
      // Patch the Zustand store via immer's mutation pattern (the rest of the
      // store uses this — returning a new object skips immer's draft tracking).
      const pendingMap = new Map(pending.map(p => [p.itemId, p.payload]));
      // Map the Firestore-shape `status` to the UI-shape `status` ('IN_STOCK' → 'Active').
      const uiStatus = (raw: string) => raw === 'SOLD' ? 'SOLD' : raw === 'IN_STOCK' ? 'Active' : 'Inactive';
      useItemStore.setState((state: any) => {
        for (let i = 0; i < state.items.length; i++) {
          const patch = pendingMap.get(state.items[i].id);
          if (!patch) continue;
          state.items[i].ebayQuantity = patch.ebayQuantity;
          state.items[i].ebayQuantitySold = patch.ebayQuantitySold;
          state.items[i].physicalQuantity = patch.physicalQuantity;
          state.items[i].stockStatus = patch.stockStatus;
          state.items[i].status = uiStatus(patch.status);
        }
        for (let i = 0; i < state.filteredItems.length; i++) {
          const patch = pendingMap.get(state.filteredItems[i].id);
          if (!patch) continue;
          state.filteredItems[i].ebayQuantity = patch.ebayQuantity;
          state.filteredItems[i].ebayQuantitySold = patch.ebayQuantitySold;
          state.filteredItems[i].physicalQuantity = patch.physicalQuantity;
          state.filteredItems[i].stockStatus = patch.stockStatus;
          state.filteredItems[i].status = uiStatus(patch.status);
        }
      });
      // Re-run the filter pipeline so any sort/filter views also see the new values.
      useItemStore.getState().applyFilters();
      console.log('[CheckQty] Local store patched + filters reapplied. Re-fetching from Firestore in background...');
      await loadItems();
      // Sample log: pick first patched item, show before/after the dot reads.
      const firstId = pending[0]?.itemId;
      if (firstId) {
        const after = useItemStore.getState().items.find((i: any) => i.id === firstId);
        console.log('[CheckQty] Sample item after reload:', {
          id: firstId,
          ebayQuantity: after?.ebayQuantity,
          ebayQuantitySold: after?.ebayQuantitySold,
          physicalQuantity: after?.physicalQuantity,
          stockStatus: after?.stockStatus,
        });
      }
      console.log('[CheckQty] Done.');

      const parts: string[] = [];
      parts.push(`Mirrored ${updated} items from eBay`);
      if (noMatch > 0) parts.push(`${noMatch} not found on eBay`);
      toast.success(parts.join(' · '));
    } catch (err: any) {
      console.error('[CheckQty] Failed:', err);
      toast.error(`Check Quantity failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSyncingFromEbay(false);
      setSyncProgress(null);
    }
  };


  // ── Depop Bulk Actions ──

  const handleBulkDelistDepop = async () => {
    const depopItems = items.filter(i => selectedItemIds.has(i.id) && i.depopListingId);
    if (depopItems.length === 0) { toast.error('No selected items have Depop listings'); return; }
    if (!confirm(`Delist ${depopItems.length} item(s) from Depop?`)) return;

    setIsSyncingDepop(true);
    toast.info(`Delisting ${depopItems.length} items from Depop...`);
    let success = 0, failed = 0;
    const depopDelistFn = httpsCallable(getFunctions(app), 'depopDelistItem');
    const db = getFirestore(app);

    for (const item of depopItems) {
      try {
        await depopDelistFn({ productId: item.depopListingId });
        await updateDoc(doc(db, 'Item', item.id), { depopListingId: deleteField(), depopUrl: deleteField(), updatedAt: serverTimestamp() });
        success++;
      } catch { failed++; }
    }

    await loadItems();
    toast.success(`Delisted ${success} from Depop${failed ? ` · ${failed} failed` : ''}`);
    setIsSyncingDepop(false);
    setSelectedItemIds(new Set());
  };

  const handleSyncFromDepop = async () => {
    setIsSyncingDepop(true);
    toast.info('Fetching Depop listings...');
    try {
      const depopSyncFn = httpsCallable(getFunctions(app), 'depopGetAllListings', { timeout: 300000 });
      const result = await depopSyncFn({});
      const data = result.data as { success: boolean; listings: Array<{ productId: string; slug: string; quantity: number }> };
      if (!data?.success || !data?.listings) { toast.error('Failed to fetch Depop listings'); setIsSyncingDepop(false); return; }

      const db = getFirestore(app);
      let synced = 0;
      const depopMap = new Map<string, { productId: string; slug: string; quantity: number }>();
      for (const listing of data.listings) depopMap.set(listing.productId, listing);

      for (const item of items) {
        if (!item.depopListingId || !depopMap.has(item.depopListingId)) continue;
        const listing = depopMap.get(item.depopListingId)!;
        const updatePayload: Record<string, any> = { updatedAt: serverTimestamp() };
        if (listing.slug) updatePayload.depopUrl = `https://www.depop.com/products/${listing.slug}`;
        if (listing.quantity !== undefined) updatePayload.depopQuantity = listing.quantity;
        await updateDoc(doc(db, 'Item', item.id), updatePayload);
        synced++;
      }

      await loadItems();
      toast.success(`Synced ${synced} Depop listings`);
    } catch (err: any) {
      toast.error(`Depop sync failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSyncingDepop(false);
    }
  };

  // Typeahead suggestions for the quick-sell lookup (only non-SOLD items)
  const handleSellQueryChange = (q: string) => {
    setSellQuery(q);
    if (!q.trim()) { setSellSuggestions([]); return; }
    const lower = q.toLowerCase();
    const matches = items
      .filter(item => item.status !== 'SOLD' && (
        item.name?.toLowerCase().includes(lower) ||
        item.ebaySku?.toLowerCase().includes(lower) ||
        item.barcode?.toLowerCase().includes(lower)
      ))
      .slice(0, 8);
    setSellSuggestions(matches);
  };

  const handleMarkAsSold = async (item: Item) => {
    setMarkingAsSold(item.id);
    try {
      await updateItem({ ...item, status: 'SOLD' });

      // Record sale so it shows up on Sales page
      if (user) {
        await recordSale({
          userId: user.id,
          itemId: item.id,
          itemName: item.name,
          itemImageUrl: item.imageUrl,
          salePrice: item.manualPriceCents || item.sellingPrice || 0,
          costPrice: item.costPrice || 0,
          marketplace: 'in_person',
          saleSource: 'sell_search',
        });
      }

      toast.success(`"${item.name}" marked as sold`);
      setSellQuery('');
      setSellSuggestions([]);
    } catch (e) {
      toast.error('Failed to mark as sold');
    } finally {
      setMarkingAsSold(null);
    }
  };

  // Filter items based on search — exclude SOLD from main inventory display
  const filteredItems = items.filter(item => {
    if (item.status === 'SOLD') return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.name?.toLowerCase().includes(query) ||
      item.ebaySku?.toLowerCase().includes(query)
    );
  }).sort((a, b) => {
    // Sort by effective jersey number (stored or extracted) smallest to largest
    const jA = getJerseyNumber(a);
    const jB = getJerseyNumber(b);
    const numA = jA ? parseInt(jA, 10) : Infinity;
    const numB = jB ? parseInt(jB, 10) : Infinity;
    if (numA !== numB) return numA - numB;
    return 0;
  });

  // Selection handlers
  const handleSelectItem = useCallback((itemId: string, selected: boolean) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedItemIds(new Set(filteredItems.map(item => item.id)));
  }, [filteredItems]);

  const handleClearSelection = useCallback(() => {
    setSelectedItemIds(new Set());
  }, []);

  // Bulk price update
  const handleBulkPriceUpdate = async (updates: { itemId: string; newPrice: number }[]) => {
    toast.info(`Updating ${updates.length} item(s)...`);
    let successCount = 0;

    for (const update of updates) {
      try {
        await window.mcp__firebase__firestore_update_document?.({
          path: `Item/${update.itemId}`,
          data: {
            manualPriceCents: Math.round(update.newPrice * 100),
            updatedAt: new Date().toISOString()
          }
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to update item ${update.itemId}:`, error);
        try {
          const db = getFirestore(app);
          const itemRef = doc(db, 'Item', update.itemId);
          await updateDoc(itemRef, {
            manualPriceCents: Math.round(update.newPrice * 100),
            updatedAt: serverTimestamp()
          });
          successCount++;
        } catch (fallbackError) {
          console.error(`Fallback update failed for ${update.itemId}:`, fallbackError);
        }
      }
    }

    toast.success(`Updated ${successCount} item price(s)!`);
    setTimeout(() => window.location.reload(), 2000);
  };

  // Delete selected
  const handleDeleteSelected = async () => {
    if (selectedItemIds.size === 0) {
      toast.error('No items selected');
      return;
    }

    const confirmed = confirm(`⚠️ Permanently delete ${selectedItemIds.size} item(s) from your inventory? This does NOT touch your eBay listings.`);
    if (!confirmed) return;

    const toDelete = items.filter(i => selectedItemIds.has(i.id));
    toast.info(`Deleting ${toDelete.length} item(s)...`);

    let deletedCount = 0;
    const suppressedEbayIds: string[] = [];

    for (const item of toDelete) {
      try {
        const ebayId = item.ebayListingId || (item as any).ebayItemId;
        if (ebayId) suppressedEbayIds.push(ebayId);

        await deleteItem(item.id);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete ${item.name}:`, error);
        toast.error(`Failed to delete: ${item.name}`);
      }
    }

    // Save suppressed eBay IDs so Import All won't re-import them
    if (suppressedEbayIds.length > 0 && user) {
      try {
        const db = getFirestore(app);
        const suppressRef = doc(db, 'importSuppressions', user.id);
        await setDoc(suppressRef, { ids: arrayUnion(...suppressedEbayIds) }, { merge: true });
      } catch (err) {
        console.warn('[Delete] Failed to save suppression list:', err);
      }
    }

    setSelectedItemIds(new Set());
    if (deletedCount > 0) {
      toast.success(`Deleted ${deletedCount} item(s) from inventory`);
    }
  };

  // Bulk status change
  const handleBulkStatusChange = async (action: 'sold' | 'in_stock' | 'archive' | 'delete', endEbayListings: boolean) => {
    toast.info(`Processing ${selectedItemIds.size} item(s)...`);
    const db = getFirestore(app);

    let successCount = 0;

    for (const itemId of selectedItemIds) {
      const item = items.find(i => i.id === itemId);
      if (!item) continue;

      try {
        if (endEbayListings) {
          const ebayId = item.ebayListingId || item.ebayItemId;
          if (ebayId) {
            try {
              await ebayService.endItem(ebayId);
            } catch (error: any) {
              if (!error.message?.includes('already been closed')) {
                console.warn(`Failed to delist ${item.name}:`, error.message);
              }
            }
          }
        }

        if (action === 'delete') {
          await deleteItem(itemId);
        } else {
          const updateData: any = { updatedAt: serverTimestamp() };

          switch (action) {
            case 'sold':
              updateData.status = 'SOLD';
              updateData.quantity = 0;
              break;
            case 'in_stock':
              updateData.status = 'IN_STOCK';
              updateData.quantity = 1;
              break;
            case 'archive':
              updateData.status = 'Inactive';
              break;
          }

          await updateDoc(doc(db, 'Item', itemId), updateData);

          // Record sale for bulk SOLD actions
          if (action === 'sold' && user) {
            await recordSale({
              userId: user.id,
              itemId: itemId,
              itemName: item.name,
              itemImageUrl: item.imageUrl,
              salePrice: item.manualPriceCents || item.sellingPrice || 0,
              costPrice: item.costPrice || 0,
              marketplace: 'in_person',
              saleSource: 'bulk_status',
              notes: 'Bulk status change to SOLD',
            });
          }
        }

        successCount++;
      } catch (error) {
        console.error(`Failed to update ${item.name}:`, error);
      }
    }

    if (successCount > 0) {
      const actionText = action === 'delete' ? 'Deleted' : 'Updated';
      toast.success(`${actionText} ${successCount} item(s)!`, { duration: 5000 });
    }

    setSelectedItemIds(new Set());
    if (action !== 'delete') {
      // For non-delete updates, reload to get fresh data from Firestore
      setTimeout(() => window.location.reload(), 2000);
    }
  };

  // Bulk clone
  const handleBulkClone = async (cloneType: 'duplicate' | 'variation' | 'marketplace', options: any) => {
    const selectedItems = items.filter(item => selectedItemIds.has(item.id));
    toast.info(`Cloning ${selectedItems.length} item(s)...`);
    const db = getFirestore(app);

    let clonedCount = 0;

    for (const item of selectedItems) {
      try {
        let clones: any[] = [];

        switch (cloneType) {
          case 'duplicate':
            for (let i = 0; i < (options.count || 1); i++) {
              clones.push({
                ...item,
                id: undefined,
                ebaySku: `${item.ebaySku || item.id}${options.skuSuffix || '-COPY'}${options.count > 1 ? (i + 1) : ''}`,
                ebayListingId: undefined,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
            }
            break;

          case 'variation':
            for (const variation of options.variations || []) {
              clones.push({
                ...item,
                id: undefined,
                name: `${item.name} - ${variation.value}`,
                ebaySku: `${item.ebaySku || item.id}-${variation.value.replace(/\s+/g, '-').toUpperCase()}`,
                ebayListingId: undefined,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
            }
            break;

          case 'marketplace':
            clones.push({
              ...item,
              id: undefined,
              ebaySku: `${item.ebaySku || item.id}-${(options.targetMarketplace || '').toUpperCase()}`,
              ebayListingId: options.keepEbayData ? item.ebayListingId : undefined,
              marketplaceTarget: options.targetMarketplace,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            break;
        }

        for (const clone of clones) {
          await addDoc(collection(db, 'Item'), clone);
          clonedCount++;
        }
      } catch (error) {
        console.error(`Failed to clone ${item.name}:`, error);
      }
    }

    if (clonedCount > 0) {
      toast.success(`Successfully cloned ${clonedCount} item(s)!`, { duration: 5000 });
    }

    setSelectedItemIds(new Set());
    setTimeout(() => window.location.reload(), 2000);
  };

  // Bulk promotions
  const handleBulkPromotion = async (promotionData: any) => {
    const selectedItems = items.filter(item => selectedItemIds.has(item.id));
    toast.info(`Creating promotion for ${selectedItems.length} item(s)...`);

    try {
      const ebayItemIds = selectedItems
        .map(item => item.ebayListingId || item.ebayItemId)
        .filter(id => id) as string[];

      if (ebayItemIds.length === 0) {
        toast.error('No eBay items selected.');
        return;
      }

      const functions = getFunctions(app);
      const createPromotionFn = httpsCallable(functions, 'createEbayPromotion');

      await createPromotionFn({
        items: ebayItemIds,
        promotionType: promotionData.type,
        name: promotionData.name,
        discount: promotionData.discount,
        startDate: promotionData.startDate,
        endDate: promotionData.endDate,
        minPurchase: promotionData.minPurchase
      });

      toast.success(`✓ Promotion "${promotionData.name}" created!`, { duration: 5000 });
      setSelectedItemIds(new Set());
    } catch (error: any) {
      toast.error(error.message || 'Failed to create promotion');
    }
  };

  // Promoted listings
  const handlePromotedListings = async (action: 'enable' | 'disable' | 'update_rate', adRate?: number) => {
    const selectedItems = items.filter(item => selectedItemIds.has(item.id));
    toast.info(`${action === 'enable' ? 'Enabling' : action === 'disable' ? 'Disabling' : 'Updating'} promoted listings...`);

    try {
      const ebayItemIds = selectedItems
        .map(item => item.ebayListingId || item.ebayItemId)
        .filter(id => id) as string[];

      if (ebayItemIds.length === 0) {
        toast.error('No eBay items selected.');
        return;
      }

      const functions = getFunctions(app);
      const managePromotedListingsFn = httpsCallable(functions, 'managePromotedListings');

      await managePromotedListingsFn({
        items: ebayItemIds,
        action,
        adRate: adRate || 5
      });

      toast.success(`✓ ${action === 'enable' ? 'Enabled' : action === 'disable' ? 'Disabled' : 'Updated'} promoted listings!`, { duration: 5000 });
      setSelectedItemIds(new Set());
    } catch (error: any) {
      toast.error(error.message || 'Failed to manage promoted listings');
    }
  };

  // AI message handler
  const handleSendAIMessage = async () => {
    if (!aiInput.trim() || !user) return;

    const userMessage = aiInput.trim();
    setAiInput('');
    setIsAILoading(true);

    const newUserMessage: AIChatMessage = { role: 'user', content: userMessage };
    setChatMessages(prev => [...prev, newUserMessage]);

    try {
      const response = await sendAIMessage(userMessage, user.id, chatMessages);

      const assistantMessage: AIChatMessage = { role: 'assistant', content: response.message };
      setChatMessages(prev => [...prev, assistantMessage]);

      if (response.toolResults?.priceChanges) {
        setPendingAction({ type: 'price_update', priceChanges: response.toolResults.priceChanges });
        setShowConfirmModal(true);
      } else if (response.toolResults?.relistItems) {
        setPendingAction({
          type: 'relist',
          relistItems: response.toolResults.relistItems.results,
          message: response.toolResults.relistItems.message
        });
        setShowConfirmModal(true);
      }
    } catch (error) {
      toast.error('Failed to get AI response');
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsAILoading(false);
    }
  };

  // Confirm AI action
  const handleConfirmAction = async () => {
    if (!pendingAction || !user) return;

    setIsProcessingAction(true);

    try {
      if (pendingAction.type === 'price_update' && pendingAction.priceChanges) {
        const db = getFirestore(app);
        let successCount = 0;

        for (const change of pendingAction.priceChanges) {
          try {
            await updateDoc(doc(db, 'Item', change.itemId), {
              manualPriceCents: change.newPrice,
              updatedAt: serverTimestamp()
            });
            successCount++;
          } catch (error) {
            console.error(`Failed to update price for item ${change.itemId}:`, error);
          }
        }

        if (successCount > 0) {
          toast.success(`Successfully updated ${successCount} item price(s)`);
        }
      }

      setShowConfirmModal(false);
      setPendingAction(null);
    } catch (error) {
      toast.error('Failed to execute action');
    } finally {
      setIsProcessingAction(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-[1900px] mx-auto">
        {/* Control Center */}
        <div className="relative z-10 mb-6 bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white tracking-tight">Inventory</h1>
            <div className="text-sm text-gray-400 bg-gray-800 px-3 py-1.5 rounded-full border border-gray-700">{items.length} items</div>
          </div>

          {/* Search + Top Actions */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white/[0.03] border border-white/10 rounded-2xl text-gray-100 placeholder-gray-500 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all text-sm"
              />
            </div>
            {onAddItem && (
              <Button onClick={onAddItem} className="flex items-center gap-2 px-4 py-2 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 rounded-xl transition-all">
                <Plus className="h-4 w-4" /><span className="text-sm font-medium">Add</span>
              </Button>
            )}
            <Button onClick={() => setShowAIPanel(!showAIPanel)} className={`flex items-center gap-2 px-4 py-2 ${showAIPanel ? 'bg-white/[0.10] border-white/20' : 'bg-white/[0.05] border-white/10'} border rounded-xl transition-all`}>
              <Bot className="h-4 w-4" /><span className="text-sm font-medium">AI</span>
            </Button>
            {/* Check Quantity + Calibrate moved into the Tools dropdown to declutter. */}
            {/* Alert bell */}
            <button
              type="button"
              onClick={() => setShowCheckQuantity(true)}
              className="relative flex items-center justify-center w-10 h-10 bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all"
              aria-label="Quantity alerts"
            >
              <Bell className="h-4 w-4 text-gray-400" />
              {criticalAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full border-2 border-gray-900">
                  {criticalAlertCount}
                </span>
              )}
            </button>
            {/* Sales feed toggle */}
            <button
              type="button"
              onClick={() => setShowSoldFeed(!showSoldFeed)}
              className={`flex items-center gap-2 px-4 py-2 ${showSoldFeed ? 'bg-green-600/20 border-green-500/30' : 'bg-white/[0.05] border-white/10'} border rounded-xl transition-all`}
            >
              <Receipt className="h-4 w-4" />
              <span className="text-sm font-medium">Sales</span>
            </button>
            {/* Tools dropdown */}
            {/* Check Quantity — single unified action (eBay + Posh + Depop) */}
            <Button
              onClick={startUnifiedCheck}
              disabled={isSyncingFromEbay || unifiedItems !== null}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all disabled:opacity-50"
            >
              <ClipboardCheck className={`h-4 w-4 ${isSyncingFromEbay ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-medium">{isSyncingFromEbay && syncProgress ? `Checking ${syncProgress.current}/${syncProgress.total}` : 'Check Qty'}</span>
            </Button>
            {/* Tools dropdown */}
            <div className="relative">
              <Button
                onClick={() => setOpenDropdown(openDropdown === 'tools' ? null : 'tools')}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all"
              >
                <Wrench className="h-4 w-4" /><span className="text-sm font-medium">Tools</span><ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              {openDropdown === 'tools' && (
                <div className="absolute right-0 top-full mt-2 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 min-w-[200px] py-1 overflow-hidden">
                  <button onClick={() => { setSyncStockMode('calibrate'); setShowSyncStockModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-gray-400" />Calibrate Baseline</button>
                  <button onClick={() => { setShowStockCheckModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><Package className="h-4 w-4 text-gray-400" />Check Stock</button>
                  <button onClick={() => { handleSyncFromEbay(); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><RotateCcw className={`h-4 w-4 text-gray-400 ${isSyncingEbay ? 'animate-spin' : ''}`} />{isSyncingEbay ? 'Syncing…' : 'Sync eBay Data'}</button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Sell Lookup */}
          <div className="relative mb-4" onClick={(e) => e.stopPropagation()}>
            <ShoppingCart className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-green-400 z-10" />
            <input
              ref={sellInputRef}
              type="text"
              placeholder="Quick sell — type to find an item..."
              value={sellQuery}
              onChange={(e) => handleSellQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setSellQuery(''); setSellSuggestions([]); } }}
              className="w-full pl-11 pr-4 py-3 bg-green-950/20 border border-green-500/20 rounded-2xl text-gray-100 placeholder-green-700 focus:outline-none focus:border-green-500/40 focus:bg-green-950/30 transition-all text-sm"
            />
            {sellSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                {sellSuggestions.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors border-b border-white/5 last:border-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-white/10 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-100 truncate">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.size || '—'} · {item.ebaySku || item.barcode || ''}</div>
                    </div>
                    {(() => {
                      const price = getEffectivePrice(item);
                      return price > 0 ? <span className="text-sm text-green-400 font-medium flex-shrink-0">${price.toFixed(2)}</span> : null;
                    })()}
                    <button
                      onClick={() => handleMarkAsSold(item)}
                      disabled={markingAsSold === item.id}
                      className="flex-shrink-0 px-3 py-1.5 bg-green-600/80 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {markingAsSold === item.id ? '…' : 'Sold'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Bar — always visible */}
          <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-white/[0.06]" onClick={() => setOpenDropdown(null)}>
              {/* Count + quick selects */}
              <div className="flex items-center gap-2 text-sm mr-2">
                <span className="font-semibold text-white">{selectedItemIds.size} selected</span>
                <button onClick={(e) => { e.stopPropagation(); setSelectedItemIds(new Set(filteredItems.map(i => i.id))); }} className="text-purple-400 hover:text-purple-300 transition-colors">All</button>
                <button onClick={(e) => { e.stopPropagation(); const ids = new Set(items.filter(i => i.ebayListingId || (i as any).marketplace === 'ebay').map(i => i.id)); setSelectedItemIds(ids); toast.info(`Selected ${ids.size} eBay item(s)`); }} className="text-blue-400 hover:text-blue-300 transition-colors">eBay</button>
                <button onClick={(e) => { e.stopPropagation(); setSelectedItemIds(new Set()); }} className="text-gray-400 hover:text-gray-300 transition-colors">Clear</button>
              </div>

              {/* Edit dropdown */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => setOpenDropdown(openDropdown === 'edit' ? null : 'edit')} className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all text-sm text-gray-200">
                  Edit <ChevronDown className="h-3 w-3" />
                </button>
                {openDropdown === 'edit' && (
                  <div className="absolute left-0 top-full mt-2 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 min-w-[160px] py-1">
                    <button onClick={() => { setShowPriceModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><DollarSign className="h-4 w-4 text-gray-400" />Prices</button>
                    <button onClick={() => { setShowQuantityModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><Layers className="h-4 w-4 text-gray-400" />Quantity</button>
                    <button onClick={() => { setShowStatusModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><Tag className="h-4 w-4 text-gray-400" />Status</button>
                    <button onClick={() => { setShowCloneModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><Copy className="h-4 w-4 text-gray-400" />Clone</button>
                  </div>
                )}
              </div>

              {/* eBay dropdown */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => setOpenDropdown(openDropdown === 'ebay' ? null : 'ebay')} className="flex items-center gap-1.5 px-3 py-2 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-700/30 rounded-xl transition-all text-sm text-blue-300">
                  eBay <ChevronDown className="h-3 w-3" />
                </button>
                {openDropdown === 'ebay' && (
                  <div className="absolute left-0 top-full mt-2 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 min-w-[180px] py-1">
                    <button onClick={async () => {
                      setOpenDropdown(null);
                      if (selectedItemIds.size === 0) { toast.error('No items selected'); return; }
                      const selectedItems = items.filter(item => selectedItemIds.has(item.id));
                      const itemsWithEbayId = selectedItems.filter(item => item.ebayListingId || item.ebayItemId);
                      if (itemsWithEbayId.length === 0) { toast.error('No selected items have eBay IDs'); return; }
                      toast.info(`Relisting ${itemsWithEbayId.length} items...`);
                      let successCount = 0;
                      for (const item of itemsWithEbayId) {
                        try {
                          const ebayId = item.ebayListingId || item.ebayItemId;
                          if (!ebayId) continue;
                          try { await ebayService.endItem(ebayId); } catch (endError: any) { if (!endError.message?.includes('already been closed')) console.warn('End listing warning:', endError.message); }
                          await ebayService.relistItem(ebayId);
                          successCount++;
                        } catch (error) { console.error(`Failed to relist ${item.name}:`, error); }
                      }
                      if (successCount > 0) { toast.success(`Relisted ${successCount} item(s)!`); setSelectedItemIds(new Set()); }
                    }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><RotateCcw className="h-4 w-4 text-gray-400" />Relist</button>
                    <button onClick={async () => {
                      setOpenDropdown(null);
                      if (selectedItemIds.size === 0) { toast.error('No items selected'); return; }
                      if (!confirm(`End ${selectedItemIds.size} eBay listing(s)?`)) return;
                      toast.info('Ending listings...');
                      let successCount = 0;
                      for (const itemId of selectedItemIds) {
                        const item = items.find(i => i.id === itemId);
                        if (!item?.ebayListingId) continue;
                        try { await ebayService.endItem(item.ebayListingId); successCount++; } catch (error) { console.error('Failed to end listing:', error); }
                      }
                      if (successCount > 0) { toast.success(`Ended ${successCount} listing(s)`); setSelectedItemIds(new Set()); }
                    }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><StopCircle className="h-4 w-4 text-gray-400" />End Listing</button>
                    <button onClick={() => { setShowPromotionsModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><TrendingUp className="h-4 w-4 text-gray-400" />Promotions</button>
                    <button onClick={() => { setShowPromotedListingsModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><TrendingUp className="h-4 w-4 text-gray-400" />Promoted Ads</button>
                  </div>
                )}
              </div>

              {/* Depop dropdown */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => setOpenDropdown(openDropdown === 'depop' ? null : 'depop')} className="flex items-center gap-1.5 px-3 py-2 bg-purple-900/20 hover:bg-purple-900/40 border border-purple-700/30 rounded-xl transition-all text-sm text-purple-300">
                  Depop <ChevronDown className="h-3 w-3" />
                </button>
                {openDropdown === 'depop' && (
                  <div className="absolute left-0 top-full mt-2 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 min-w-[200px] py-1">
                    <button onClick={() => { setShowDepopModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><ShoppingCart className="h-4 w-4 text-gray-400" />List to Depop</button>
                    <button onClick={() => { handleBulkDelistDepop(); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><StopCircle className="h-4 w-4 text-gray-400" />Delist from Depop</button>
                    <div className="border-t border-white/[0.08] my-1" />
                    <button onClick={() => { handleSyncFromDepop(); setOpenDropdown(null); }} disabled={isSyncingDepop} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3 disabled:opacity-50"><ArrowDownLeft className="h-4 w-4 text-gray-400" />{isSyncingDepop ? 'Syncing…' : 'Sync from Depop'}</button>
                  </div>
                )}
              </div>

              {/* Export dropdown */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => setOpenDropdown(openDropdown === 'export' ? null : 'export')} className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all text-sm text-gray-200">
                  Export <ChevronDown className="h-3 w-3" />
                </button>
                {openDropdown === 'export' && (
                  <div className="absolute left-0 top-full mt-2 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 min-w-[160px] py-1">
                    <button onClick={() => { setShowQRPrintModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><Printer className="h-4 w-4 text-gray-400" />Print QR</button>
                    <button onClick={() => { setShowDepopModal(true); setOpenDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-3"><ShoppingCart className="h-4 w-4 text-gray-400" />Depop</button>
                  </div>
                )}
              </div>

              {/* Delete */}
              <button type="button" onClick={handleDeleteSelected} disabled={selectedItemIds.size === 0} className="flex items-center gap-1.5 px-3 py-2 bg-red-900/20 hover:bg-red-900/40 border border-red-700/30 rounded-xl transition-all text-sm text-red-400 ml-auto disabled:opacity-30">
                <Trash2 className="h-4 w-4" />Delete
              </button>
            </div>
        </div>

        {/* Mismatch Alert Banner */}
        <MismatchAlertBanner
          alerts={mismatchAlerts}
          onReview={() => setShowCheckQuantity(true)}
        />

        {/* Table */}
        <div className="bg-white/[0.02] backdrop-blur-[40px] rounded-3xl border border-white/10 overflow-hidden shadow-[0_8px_32px_0_rgba(255,255,255,0.05),inset_0_0_0_1px_rgba(255,255,255,0.05)]" style={{ backdropFilter: 'blur(40px) saturate(180%)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/[0.03] backdrop-blur-xl border-b border-white/10" style={{ backdropFilter: 'blur(20px)' }}>
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                      onChange={(e) => e.target.checked ? handleSelectAll() : handleClearSelection()}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700"
                      aria-label="Select all items"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Image</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Jersey #</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Size</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">SKU</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Price</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Quantity</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">eBay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                      No items found
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      id={`item-${item.id}`}
                      className={`hover:bg-gray-800/50 cursor-pointer transition-colors ${
                        selectedItemIds.has(item.id) ? 'bg-blue-900/20' : ''
                      }`}
                      onClick={() => onItemClick(item)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSelectItem(item.id, e.target.checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-gray-600 bg-gray-700"
                          aria-label={`Select ${item.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative w-12 h-12">
                          {item.imageUrl ? (
                            <img
                              src={Array.isArray(item.imageUrl) ? item.imageUrl[0] : item.imageUrl}
                              alt={item.name}
                              className="w-12 h-12 object-cover rounded"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                if (item.ebayPrimaryImage && target.src !== item.ebayPrimaryImage) {
                                  target.src = item.ebayPrimaryImage;
                                } else if (item.ebayPhotos && item.ebayPhotos.length > 0) {
                                  const photo = item.ebayPhotos[0];
                                  const fallbackUrl = photo.firebaseStorageUrl || photo.ebayUrl;
                                  if (target.src !== fallbackUrl) {
                                    target.src = fallbackUrl;
                                  }
                                } else {
                                  target.style.display = 'none';
                                  target.parentElement!.innerHTML = '<div class="w-12 h-12 bg-gray-800 rounded flex items-center justify-center text-gray-600 text-xs">No Image</div>';
                                }
                              }}
                            />
                          ) : item.ebayPrimaryImage ? (
                            <img
                              src={item.ebayPrimaryImage}
                              alt={item.name}
                              className="w-12 h-12 object-cover rounded"
                            />
                          ) : item.ebayPhotos && item.ebayPhotos.length > 0 ? (
                            <img
                              src={item.ebayPhotos[0].firebaseStorageUrl || item.ebayPhotos[0].ebayUrl}
                              alt={item.name}
                              className="w-12 h-12 object-cover rounded"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center text-gray-600 text-xs">
                              No Image
                            </div>
                          )}
                          {/* Image overlays removed — per-site status now lives
                              in the name-column chips below. */}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-medium text-gray-200">{item.name}</div>
                          {/* Stock Status Badge — eBay is source of truth, no double-counting unitSales */}
                          {(() => {
                            const qty = item.physicalQuantity ?? item.ebayQuantity ?? 0;
                            const status = item.stockStatus || (qty <= 0 ? 'SOLD' : qty <= 2 ? 'LOW_STOCK' : 'IN_STOCK');
                            switch (status) {
                              case 'IN_STOCK':
                                return (
                                  <span className="inline-flex items-center gap-1 text-xs text-green-400 whitespace-nowrap">
                                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />In Stock
                                  </span>
                                );
                              case 'LOW_STOCK':
                                return (
                                  <span className="inline-flex items-center gap-1 text-xs text-yellow-400 whitespace-nowrap">
                                    <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />Low
                                  </span>
                                );
                              case 'OUT_OF_STOCK':
                                return (
                                  <span className="inline-flex items-center gap-1 text-xs text-red-400 whitespace-nowrap">
                                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Out of Stock
                                  </span>
                                );
                              case 'SOLD':
                                return (
                                  <span className="inline-flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                                    <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />Sold
                                  </span>
                                );
                              default:
                                return null;
                            }
                          })()}
                          {/* Platform listing links — click to open listing in new tab */}
                          {(() => {
                            const ebayHref = item.ebayUrl || (item.ebayListingId ? `https://www.ebay.com/itm/${item.ebayListingId}` : null);
                            const poshHref = item.poshmarkUrl || (item.poshmarkListingId ? `https://poshmark.com/listing/${item.poshmarkListingId}` : null);
                            const depopHref = item.depopUrl || (item.depopListingId ? `https://www.depop.com/products/${item.depopListingId}` : null);
                            const links: JSX.Element[] = [];
                            if (ebayHref) {
                              links.push(
                                <a
                                  key="ebay"
                                  href={ebayHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-blue-300 bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/40 transition"
                                  title="Open eBay listing"
                                >eBay</a>
                              );
                            }
                            if (poshHref) {
                              links.push(
                                <a
                                  key="posh"
                                  href={poshHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-pink-300 bg-pink-600/20 border border-pink-500/30 hover:bg-pink-600/40 transition"
                                  title="Open Poshmark listing"
                                >Posh</a>
                              );
                            }
                            if (depopHref) {
                              links.push(
                                <a
                                  key="depop"
                                  href={depopHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-red-300 bg-red-600/20 border border-red-500/30 hover:bg-red-600/40 transition"
                                  title="Open Depop listing"
                                >Depop</a>
                              );
                            }
                            return links.length > 0 ? <span className="inline-flex gap-1">{links}</span> : null;
                          })()}
                        </div>
                      </td>

                      {/* Jersey # - scroll wheel or click to edit */}
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {editingJerseyId === item.id ? (
                          <input
                            type="text"
                            value={editingJerseyValue}
                            onChange={(e) => setEditingJerseyValue(e.target.value)}
                            onWheel={(e) => {
                              e.preventDefault();
                              const num = parseInt(editingJerseyValue) || 0;
                              const next = e.deltaY < 0 ? num + 1 : Math.max(0, num - 1);
                              setEditingJerseyValue(String(next));
                            }}
                            onBlur={() => handleJerseyUpdate(item.id, editingJerseyValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleJerseyUpdate(item.id, editingJerseyValue);
                              if (e.key === 'Escape') setEditingJerseyId(null);
                              if (e.key === 'ArrowUp') { e.preventDefault(); setEditingJerseyValue(v => String((parseInt(v) || 0) + 1)); }
                              if (e.key === 'ArrowDown') { e.preventDefault(); setEditingJerseyValue(v => String(Math.max(0, (parseInt(v) || 0) - 1))); }
                            }}
                            autoFocus
                            placeholder="#"
                            className="w-14 px-2 py-1 bg-gray-800 border border-blue-500 rounded text-white text-sm text-center focus:outline-none"
                          />
                        ) : (
                          <span
                            onClick={() => { setEditingJerseyId(item.id); setEditingJerseyValue(item.jerseyNumber || ''); }}
                            className="cursor-pointer hover:bg-gray-700/50 px-2 py-1 rounded inline-block text-sm text-gray-300 min-w-[2rem] text-center"
                            title="Click or scroll to edit jersey number"
                          >
                            {getJerseyNumber(item) || <span className="text-gray-600">—</span>}
                          </span>
                        )}
                      </td>

                      {/* Size - click to edit with predefined options */}
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {editingSizeId === item.id ? (
                          <input
                            type="text"
                            value={editingSizeValue}
                            onChange={(e) => setEditingSizeValue(e.target.value)}
                            onBlur={() => handleSizeUpdate(item.id, editingSizeValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSizeUpdate(item.id, editingSizeValue);
                              if (e.key === 'Escape') setEditingSizeId(null);
                            }}
                            autoFocus
                            placeholder="Size"
                            className="w-16 px-2 py-1 bg-gray-800 border border-blue-500 rounded text-white text-sm text-center focus:outline-none"
                          />
                        ) : (
                          <span
                            onClick={() => { setEditingSizeId(item.id); setEditingSizeValue(getSize(item)); }}
                            className="cursor-pointer hover:bg-gray-700/50 px-2 py-1 rounded inline-block text-sm text-gray-300 min-w-[2.5rem] text-center"
                            title="Click to edit size"
                          >
                            {getSize(item) || <span className="text-gray-600">—</span>}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-400">{item.ebaySku || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-green-400">
                          ${getEffectivePrice(item).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          item.status === 'SOLD'
                            ? 'bg-green-900/50 text-green-300'
                            : item.status === 'Active'
                            ? 'bg-blue-900/50 text-blue-300'
                            : 'bg-gray-800 text-gray-400'
                        }`}>
                          {item.status || 'Unknown'}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-sm text-gray-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {editingQuantityId === item.id ? (
                          <input
                            type="number"
                            min="0"
                            title="Quantity"
                            placeholder="Qty"
                            value={editingQuantityValue}
                            onChange={(e) => setEditingQuantityValue(e.target.value)}
                            onBlur={() => handleQuantityUpdate(item.id, editingQuantityValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleQuantityUpdate(item.id, editingQuantityValue);
                              } else if (e.key === 'Escape') {
                                setEditingQuantityId(null);
                              }
                            }}
                            autoFocus
                            className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                          />
                        ) : (
                          <div className="flex flex-col gap-1">
                            {/* Quantity dots */}
                            <div className="flex items-center gap-0.5 flex-wrap">
                              {(() => {
                                const MAX_DOTS = 20;
                                const physical = item.physicalQuantity ?? item.ebayQuantity ?? 1;
                                const soldCount = item.unitSales?.length || 0;
                                const remaining = Math.max(0, physical);
                                const total = remaining + soldCount;
                                const dots = [];
                                // Sold dots — color-coded by platform (ebay=blue, posh=purple,
                                // depop=red, in_person=amber, other=gray). Tooltip shows
                                // platform · price · date so the user can scan sales history
                                // without opening the History modal. Click → open History.
                                const PLATFORM_DOT: Record<string, string> = {
                                  ebay: 'bg-blue-500',
                                  poshmark: 'bg-purple-500',
                                  depop: 'bg-red-500',
                                  in_person: 'bg-amber-500',
                                };
                                const soldToShow = Math.min(soldCount, MAX_DOTS);
                                for (let d = 0; d < soldToShow; d++) {
                                  const sale = item.unitSales?.[soldCount - 1 - d];
                                  const dateStr = sale?.soldAt ? new Date(sale.soldAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                                  const platform = (sale?.platform || 'unknown').toLowerCase();
                                  const priceLabel = typeof sale?.priceCents === 'number' ? ` · $${(sale.priceCents / 100).toFixed(2)}` : '';
                                  const tipPlatform = platform === 'in_person' ? 'In person' : platform.charAt(0).toUpperCase() + platform.slice(1);
                                  const dotColor = PLATFORM_DOT[platform] || 'bg-gray-500';
                                  dots.push(
                                    <span
                                      key={`sold-${d}`}
                                      className={`w-2 h-2 rounded-full ${dotColor} inline-block cursor-pointer hover:ring-2 hover:ring-white/40 transition`}
                                      title={`${tipPlatform}${priceLabel}${dateStr ? ' · ' + dateStr : ''}`}
                                      onClick={() => setHistoryItem(item)}
                                    />
                                  );
                                }
                                // Available dots (green, clickable)
                                const availToShow = Math.min(remaining, MAX_DOTS - soldToShow);
                                for (let d = 0; d < availToShow; d++) {
                                  dots.push(
                                    <span key={`avail-${d}`} className="w-2 h-2 rounded-full bg-green-500 inline-block cursor-pointer hover:bg-green-300 transition-colors" title="Click to mark sold" onClick={() => handleDotSold(item)} />
                                  );
                                }
                                if (total > MAX_DOTS) {
                                  dots.push(<span key="more" className="text-xs text-gray-500 ml-1">+{total - MAX_DOTS} more</span>);
                                }
                                return dots.length > 0 ? dots : <span className="text-xs text-gray-600">0</span>;
                              })()}
                            </div>
                            {/* Mismatch + edit */}
                            <div className="flex items-center gap-1.5">
                              <span
                                onClick={() => {
                                  setEditingQuantityId(item.id);
                                  setEditingQuantityValue(String(item.physicalQuantity ?? item.ebayQuantity ?? 1));
                                }}
                                className="cursor-pointer hover:bg-gray-700/50 px-1 py-0.5 rounded text-xs"
                                title="Click to edit quantity"
                              >
                                {item.physicalQuantity ?? item.ebayQuantity ?? 1}
                              </span>
                              <button
                                onClick={() => setHistoryItem(item)}
                                className="text-gray-500 hover:text-gray-300 transition-colors p-0.5 rounded hover:bg-white/[0.06]"
                                title="View item history"
                                aria-label="View item history"
                              >
                                <History className="h-3 w-3" />
                              </button>
                              {item.ebayQuantity !== undefined && (item.physicalQuantity ?? item.ebayQuantity) !== item.ebayQuantity && (
                                <span className="text-xs text-yellow-400" title={`Physical: ${item.physicalQuantity}, eBay: ${item.ebayQuantity}`}>
                                  eBay:{item.ebayQuantity}
                                </span>
                              )}
                              {/* Stock status badge */}
                              {(() => {
                                const status = item.stockStatus || ((item.physicalQuantity ?? item.ebayQuantity ?? 1) > 2 ? 'IN_STOCK' : (item.physicalQuantity ?? item.ebayQuantity ?? 1) > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK');
                                if (status === 'SOLD') return <span className="text-xs text-gray-500">Sold</span>;
                                if (status === 'OUT_OF_STOCK') return <span className="text-xs text-red-400 font-medium">OOS</span>;
                                if (status === 'LOW_STOCK') return <span className="text-xs text-yellow-400">Low</span>;
                                return null;
                              })()}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {item.ebayListingId || item.ebayItemId ? (
                            <span className="text-xs text-blue-400">Listed</span>
                          ) : (
                            <span className="text-xs text-gray-600">-</span>
                          )}
                          {item.linkedGroupId && (
                            <span className="text-[10px] text-green-400 flex items-center gap-1">
                              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                              Linked
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* AI Assistant Panel */}
      {showAIPanel && (
        <div className="fixed top-4 right-4 w-96 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-[40px] p-6 shadow-[0_8px_32px_0_rgba(255,255,255,0.05),inset_0_0_0_1px_rgba(255,255,255,0.05)] flex flex-col max-h-[90vh] z-50" style={{ backdropFilter: 'blur(40px) saturate(180%)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-bold text-white">AI Assistant</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowAIPanel(false)}
              className="text-gray-400 hover:text-white"
              title="Close AI Assistant"
              aria-label="Close AI Assistant"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto mb-4 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="text-center py-8">
                <Bot className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Ask me anything!</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg ${
                    msg.role === 'user' ? 'bg-blue-600 text-white ml-8' : 'bg-gray-800 text-gray-200 mr-8'
                  }`}
                >
                  <p className="text-xs font-semibold mb-1 opacity-70">
                    {msg.role === 'user' ? 'You' : 'AI'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))
            )}

            {isAILoading && (
              <div className="p-3 bg-gray-800 text-gray-200 mr-8 rounded-lg">
                <p className="text-sm">Thinking...</p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-700 pt-4">
            <textarea
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendAIMessage();
                }
              }}
              className="w-full bg-gray-800 text-white rounded-lg p-3 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
              placeholder="Ask me anything..."
              rows={3}
              disabled={isAILoading || !user}
            />
            <Button
              onClick={handleSendAIMessage}
              disabled={isAILoading || !aiInput.trim() || !user}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {isAILoading ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AIActionConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false);
          setPendingAction(null);
        }}
        onConfirm={handleConfirmAction}
        actionData={pendingAction}
        isProcessing={isProcessingAction}
      />

      <BulkPriceModal
        isOpen={showPriceModal}
        onClose={() => setShowPriceModal(false)}
        items={items.filter(item => selectedItemIds.has(item.id))}
        onUpdatePrices={handleBulkPriceUpdate}
      />

      <BulkStatusModal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        items={items.filter(item => selectedItemIds.has(item.id))}
        onUpdateStatus={handleBulkStatusChange}
      />

      <BulkCloneModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
        items={items.filter(item => selectedItemIds.has(item.id))}
        onCloneItems={handleBulkClone}
      />

      <BulkPromotionsModal
        isOpen={showPromotionsModal}
        onClose={() => setShowPromotionsModal(false)}
        items={items.filter(item => selectedItemIds.has(item.id))}
        onCreatePromotion={handleBulkPromotion}
      />

      <BulkPromotedListingsModal
        isOpen={showPromotedListingsModal}
        onClose={() => setShowPromotedListingsModal(false)}
        items={items.filter(item => selectedItemIds.has(item.id))}
        onUpdatePromotedListings={handlePromotedListings}
      />

      <QRCodePrintModal
        open={showQRPrintModal}
        onClose={() => setShowQRPrintModal(false)}
        items={items.filter(item => selectedItemIds.has(item.id))}
      />

      <ListToDepopModal
        isOpen={showDepopModal}
        onClose={() => {
          setShowDepopModal(false);
          setSelectedItemIds(new Set());
        }}
        items={items.filter(item => selectedItemIds.has(item.id))}
      />

      <StockCheckModal
        open={showStockCheckModal}
        onClose={() => setShowStockCheckModal(false)}
      />

      <StockReconciliationModal
        open={showReconciliation}
        onClose={() => setShowReconciliation(false)}
        result={reconciliationResult}
      />

      <SyncStockModal
        open={showSyncStockModal}
        onClose={() => setShowSyncStockModal(false)}
        mode={syncStockMode}
        onRunReconciliation={handleReconciliationFromSyncData}
        onCalibrate={handleCalibrateBaseline}
      />

      <MatchSuggestionsModal
        open={showMatchSuggestions}
        suggestions={matchSuggestions}
        onAccept={handleAcceptSuggestion}
        onReject={handleRejectSuggestion}
        onSkip={handleSkipSuggestion}
        onClose={() => setShowMatchSuggestions(false)}
      />

      {aiMatchRunId && (
        <AIMatchProgressModal
          runId={aiMatchRunId}
          open={showAiMatchProgress}
          onClose={() => setShowAiMatchProgress(false)}
        />
      )}

      <AIMatchConfirmModal
        open={showAiConfirm}
        matches={aiProposedMatches}
        onConfirm={handleApplyAiMatches}
        onCancel={() => { if (!isApplyingAiConfirm && !isRedoingMatches) { setShowAiConfirm(false); setAiProposedMatches([]); } }}
        isApplying={isApplyingAiConfirm}
        onRedoUnchecked={handleRedoMatches}
        isRedoing={isRedoingMatches}
      />


      <CheckQuantityModal
        open={showCheckQuantity}
        onClose={() => setShowCheckQuantity(false)}
        onCriticalCountChange={(count) => {
          setCriticalAlertCount(count);
          // Build mismatch alert summary for the banner
          if (count > 0) {
            setMismatchAlerts({
              criticalCount: count,
              warningCount: 0,
              criticalMessage: `${count} item${count !== 1 ? 's' : ''} sold but still listed on other platforms`,
              warningMessage: '',
            });
          }
        }}
      />

      {/* Unified Check Quantity — one corner widget, all sites per item */}
      {unifiedItems && (
        <UnifiedCheckPanel
          items={unifiedItems}
          onClose={() => setUnifiedItems(null)}
          onDone={onUnifiedDone}
          onEbayCheck={handleCheckEbayQuantities}
        />
      )}

      {/* eBay delist-confirm: items with eBay stock but real stock ≤ 0 */}
      <EbayDelistConfirmModal
        open={showEbayDelist}
        items={ebayDelistCandidates}
        onCancel={() => { setShowEbayDelist(false); setEbayDelistCandidates([]); }}
        onConfirm={confirmEbayDelist}
      />

      {historyItem && (
        <ItemHistoryPanel
          item={historyItem}
          open={true}
          onClose={() => setHistoryItem(null)}
        />
      )}

      <SoldActivityFeed
        open={showSoldFeed}
        onClose={() => setShowSoldFeed(false)}
        onEntryClick={(itemId) => {
          // Scroll to the item card in the grid
          const el = document.getElementById(`item-${itemId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-green-400');
            setTimeout(() => el.classList.remove('ring-2', 'ring-green-400'), 2000);
          }
          setShowSoldFeed(false);
        }}
      />

      <SoldDelistModal
        item={delistItem}
        open={!!delistItem}
        onClose={() => setDelistItem(null)}
        ebayAutoDelisted={ebayAutoDelisted}
        depopAutoDelisted={depopAutoDelisted}
      />

      {showQuantityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Update Quantity</h3>
            <input
              type="number"
              min="0"
              placeholder="Quantity"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white mb-4"
            />
            <div className="flex gap-3">
              <Button
                onClick={() => setShowQuantityModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const qtyValue = parseInt(newQuantity);
                  if (isNaN(qtyValue) || qtyValue < 0) {
                    toast.error('Invalid quantity');
                    return;
                  }

                  const db = getFirestore(app);
                  let ebayUpdated = 0;
                  let ebayFailed = 0;
                  for (const itemId of selectedItemIds) {
                    try {
                      await updateDoc(doc(db, 'Item', itemId), {
                        quantity: qtyValue,
                        status: qtyValue === 0 ? 'SOLD' : 'IN_STOCK',
                        updatedAt: serverTimestamp()
                      });
                      const item = items.find(i => i.id === itemId);

                      // Record sale when quantity goes to 0
                      if (qtyValue === 0 && item && user) {
                        await recordSale({
                          userId: user.id,
                          itemId: itemId,
                          itemName: item.name,
                          itemImageUrl: item.imageUrl,
                          salePrice: item.manualPriceCents || item.sellingPrice || 0,
                          costPrice: item.costPrice || 0,
                          marketplace: 'in_person',
                          saleSource: 'quantity_zero',
                        });
                      }
                      const ebayId = item?.ebayListingId || (item as any)?.ebayItemId;
                      if (ebayId) {
                        try {
                          await ebayService.reviseItemQuantity(ebayId, qtyValue);
                          ebayUpdated++;
                        } catch (ebayErr) {
                          console.error(`eBay quantity update failed for ${ebayId}:`, ebayErr);
                          ebayFailed++;
                        }
                      }
                    } catch (error) {
                      console.error(`Failed to update item ${itemId}:`, error);
                    }
                  }

                  const ebayMsg = ebayUpdated > 0 ? ` (${ebayUpdated} eBay listing${ebayUpdated > 1 ? 's' : ''} updated${ebayFailed > 0 ? `, ${ebayFailed} failed` : ''})` : '';
                  toast.success(`Updated quantity!${ebayMsg}`);
                  setShowQuantityModal(false);
                  setSelectedItemIds(new Set());
                  window.location.reload();
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Update
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
