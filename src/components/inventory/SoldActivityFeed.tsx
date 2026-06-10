/**
 * SoldActivityFeed — Real-time panel showing recently sold items
 * Listens to Firestore Item collection via onSnapshot, flattens unitSales,
 * and displays the most recent 20 sales in chronological order (newest first).
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../lib/firebase/client';
import { useAuthStore } from '../../store/useAuthStore';
import { X, Receipt, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SoldEntry {
  itemId: string;
  itemName: string;
  imageUrl: string;
  soldAt: string;
  platform: string;
  priceCents: number;
  note?: string;
}

interface SoldActivityFeedProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user clicks an entry — parent can scroll-to / highlight */
  onEntryClick?: (itemId: string) => void;
}

// ---------------------------------------------------------------------------
// Platform badge config (matches ItemHistoryPanel colours)
// ---------------------------------------------------------------------------

const PLATFORM_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  ebay:      { label: 'eBay',      bg: 'bg-blue-600/30',   text: 'text-blue-300'   },
  poshmark:  { label: 'Poshmark',  bg: 'bg-red-600/30',    text: 'text-red-300'    },
  depop:     { label: 'Depop',     bg: 'bg-orange-600/30', text: 'text-orange-300' },
  in_person: { label: 'In Person', bg: 'bg-gray-600/30',   text: 'text-gray-300'   },
  other:     { label: 'Other',     bg: 'bg-gray-600/30',   text: 'text-gray-300'   },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '\u2026';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SoldActivityFeed: React.FC<SoldActivityFeedProps> = ({
  open,
  onClose,
  onEntryClick,
}) => {
  const { user } = useAuthStore();
  const [entries, setEntries] = useState<SoldEntry[]>([]);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const prevCountRef = useRef<number>(0);

  // Real-time listener
  useEffect(() => {
    if (!user) return;

    const db = getFirestore(app);
    const q = query(
      collection(db, 'Item'),
      where('user_uuid', '==', user.id),
    );

    const toISO = (v: unknown): string => {
      if (!v) return new Date().toISOString();
      if (v instanceof Timestamp) return v.toDate().toISOString();
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && v !== null && 'toDate' in v) return (v as { toDate: () => Date }).toDate().toISOString();
      return new Date().toISOString();
    };

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allSales: SoldEntry[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const itemName = data.title || data.name || data.description || 'Unknown';
        const imageUrl = data.imageUrl || (data.imageUrls && data.imageUrls[0]) || data.ebayPrimaryImage || '';

        // Source 1: unitSales array (best data)
        const sales: Array<{ soldAt?: unknown; platform?: string; priceCents?: number; note?: string }> = data.unitSales || [];
        sales.forEach((sale) => {
          allSales.push({
            itemId: docSnap.id,
            itemName,
            imageUrl,
            soldAt: toISO(sale.soldAt),
            platform: sale.platform || 'unknown',
            priceCents: sale.priceCents || data.manualPriceCents || 0,
            note: sale.note,
          });
        });

        // Only real sales from unitSales — no synthetic entries
      });

      // Sort newest first, keep top 20
      allSales.sort(
        (a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime(),
      );

      setEntries(allSales.slice(0, 20));
      prevCountRef.current = allSales.length;
    });

    return () => unsubscribe();
  }, [user]);

  if (!open) return null;

  return (
    <div className="fixed right-0 top-16 w-80 h-[calc(100vh-4rem)] bg-gray-900 border-l border-white/10 z-40 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-green-400" />
          <span className="text-sm font-semibold text-white">Recent Sales</span>
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          aria-label="Close sales feed"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 px-6 text-center">
            <Receipt className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No sales recorded yet</p>
            <p className="text-xs mt-1 opacity-60">Click dots to mark sales, or pull eBay history</p>
            <button
              onClick={async () => {
                setIsBackfilling(true);
                try {
                  const fns = getFunctions(app);
                  const backfill = httpsCallable(fns, 'ebayBackfillSoldHistory', { timeout: 300000 });
                  const result = await backfill({});
                  const data = result.data as any;
                  alert(`Backfill complete: ${data.salesAdded || 0} sales added from ${data.ordersProcessed || 0} eBay orders`);
                } catch (e: any) {
                  alert('Backfill failed: ' + (e.message || 'Unknown error'));
                } finally {
                  setIsBackfilling(false);
                }
              }}
              disabled={isBackfilling}
              className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-2"
            >
              <RefreshCw className={`h-3 w-3 ${isBackfilling ? 'animate-spin' : ''}`} />
              {isBackfilling ? 'Pulling eBay orders...' : 'Pull eBay Sold History'}
            </button>
          </div>
        ) : (
          entries.map((entry, idx) => {
            const badge = PLATFORM_BADGE[entry.platform] || PLATFORM_BADGE.other;
            return (
              <button
                key={`${entry.itemId}-${entry.soldAt}-${idx}`}
                onClick={() => onEntryClick?.(entry.itemId)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] transition-colors text-left"
              >
                {/* Thumbnail */}
                {entry.imageUrl ? (
                  <img
                    src={entry.imageUrl}
                    alt=""
                    className="w-9 h-9 rounded-md object-cover flex-shrink-0 bg-gray-800"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-md bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <Receipt className="h-4 w-4 text-gray-600" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate leading-tight">
                    {truncate(entry.itemName, 40)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {timeAgo(entry.soldAt)}
                    </span>
                  </div>
                </div>

                {/* Price */}
                <span className="text-sm font-semibold text-green-400 flex-shrink-0">
                  {formatPrice(entry.priceCents)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
