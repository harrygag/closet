import { useState } from 'react';
import { X, TrendingUp, CheckCircle, ExternalLink } from 'lucide-react';
import type { Item } from '../types/item';

interface ListingSuggestionsPanelProps {
  items: Item[];
  onClose: () => void;
}

const PLATFORMS = [
  { key: 'ebay',     label: 'eBay',     check: (i: Item) => !!(i.ebayListingId || (i as any).ebayItemId), color: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20' },
  { key: 'depop',    label: 'Depop',    check: (i: Item) => !!i.depopUrl,    color: 'bg-red-500/10 text-red-300 border-red-500/20' },
  { key: 'poshmark', label: 'Poshmark', check: (i: Item) => !!i.poshmarkUrl, color: 'bg-pink-500/10 text-pink-300 border-pink-500/20' },
];

function daysListed(item: Item): number {
  // Prefer eBay listing start time, then dateAdded, then dateField
  const date = (item as any).ebayStartTime || item.dateAdded || item.dateField;
  if (!date) return 0;
  return (Date.now() - new Date(date as string).getTime()) / 86400000;
}

function qualifies(item: Item) {
  if (item.status === 'SOLD') return false;
  const qty = (item as any).ebayQuantity || 1;
  return qty > 1 || daysListed(item) > 3;
}

export const ListingSuggestionsPanel: React.FC<ListingSuggestionsPanelProps> = ({ items, onClose }) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const candidates = items.filter(i => qualifies(i) && !dismissed.has(i.id));

  const toggle = (id: string) =>
    setDismissed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="fixed top-4 right-4 w-96 max-h-[90vh] flex flex-col rounded-3xl border border-white/10 bg-[#0d0d0f]/95 backdrop-blur-[40px] shadow-[0_8px_32px_0_rgba(0,0,0,0.6)] z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-purple-400" />
          <h3 className="text-white font-medium">Listing Suggestions</h3>
          {candidates.length > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-300">{candidates.length}</span>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-xl hover:bg-white/[0.06] text-gray-500 hover:text-white transition-all">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Subtitle */}
      <p className="px-5 py-3 text-xs text-gray-500 border-b border-white/[0.04] flex-shrink-0">
        Items with qty &gt; 1 or sitting 3+ days not listed everywhere. Check off when done.
      </p>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
            <CheckCircle className="h-8 w-8 text-green-500/50" />
            <p className="text-gray-500 text-sm">All caught up — no suggestions right now.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {candidates.map(item => {
              const isDismissed = dismissed.has(item.id);
              const missing = PLATFORMS.filter(p => !p.check(item));
              const qty = (item as any).ebayQuantity || 1;
              const daysOld = Math.floor(daysListed(item));

              return (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className={`flex items-start gap-3 px-5 py-4 cursor-pointer transition-all ${isDismissed ? 'opacity-40' : 'hover:bg-white/[0.02]'}`}
                >
                  {/* Checkbox */}
                  <div className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${isDismissed ? 'bg-green-600 border-green-600' : 'border-gray-600'}`}>
                    {isDismissed && <CheckCircle className="h-3 w-3 text-white" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      {(item.imageUrl || (item as any).ebayPrimaryImage) && (
                        <img
                          src={item.imageUrl || (item as any).ebayPrimaryImage}
                          alt=""
                          className="w-9 h-9 rounded-lg object-cover flex-shrink-0 opacity-80"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-gray-200 font-medium truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.size && <span className="text-xs text-gray-500">{item.size}</span>}
                          {qty > 1 && <span className="text-xs text-blue-400">Qty: {qty}</span>}
                          {daysOld > 3 && <span className="text-xs text-orange-400">{daysOld}d listed</span>}
                        </div>
                      </div>
                    </div>

                    {/* Missing platforms */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {missing.map(p => (
                        <span key={p.key} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border ${p.color}`}>
                          <ExternalLink className="h-2.5 w-2.5" />
                          {p.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {dismissed.size > 0 && (
        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-gray-500">{dismissed.size} dismissed</span>
          <button type="button" onClick={() => setDismissed(new Set())} className="text-xs text-gray-400 hover:text-white transition-colors">
            Reset
          </button>
        </div>
      )}
    </div>
  );
};
