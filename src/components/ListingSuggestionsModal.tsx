import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { TrendingUp, CheckCircle, ExternalLink } from 'lucide-react';
import type { Item } from '../types/item';

interface ListingSuggestionsModalProps {
  items: Item[];
  open: boolean;
  onClose: () => void;
}

const PLATFORMS = [
  { key: 'ebay',     label: 'eBay',     check: (i: Item) => !!(i.ebayListingId || (i as any).ebayItemId), color: 'bg-blue-600/20 border-blue-600/30 text-blue-400' },
  { key: 'poshmark', label: 'Poshmark', check: (i: Item) => !!i.poshmarkUrl, color: 'bg-red-600/20 border-red-600/30 text-red-400' },
  { key: 'depop',    label: 'Depop',    check: (i: Item) => !!(i.depopUrl || i.depopListingId), color: 'bg-orange-600/20 border-orange-600/30 text-orange-400' },
];

function daysListed(item: Item): number {
  const date = (item as any).ebayStartTime || item.dateAdded || item.dateField || (item as any).createdAt || (item as any).purchaseDate;
  if (!date) return 0;
  return (Date.now() - new Date(date as string).getTime()) / 86400000;
}

function qualifies(item: Item) {
  if (item.status === 'SOLD') return false;
  const qty = item.physicalQuantity ?? (item as any).ebayQuantity ?? 1;
  return daysListed(item) >= 3 || qty > 1;
}

function getDaysBadge(days: number): { className: string; label: string } | null {
  if (days < 3) return null;
  if (days >= 30) return { className: 'bg-red-900/40 border-red-900/50 text-red-300', label: `${days}d \u{1F525}` };
  if (days >= 14) return { className: 'bg-red-600/20 border-red-600/30 text-red-400', label: `${days}d` };
  if (days >= 7)  return { className: 'bg-orange-600/20 border-orange-600/30 text-orange-400', label: `${days}d` };
  return { className: 'bg-yellow-600/20 border-yellow-600/30 text-yellow-400', label: `${days}d` };
}

export function getListingSuggestionCount(items: Item[]): number {
  return items.filter(qualifies).length;
}

export const ListingSuggestionsModal: React.FC<ListingSuggestionsModalProps> = ({ items, open, onClose }) => {
  const [checkedOff, setCheckedOff] = useState<Set<string>>(new Set());

  const candidates = items
    .filter(qualifies)
    .sort((a, b) => daysListed(b) - daysListed(a));

  const sittingThreePlus = candidates.length;
  const sittingThirtyPlus = candidates.filter(item => daysListed(item) >= 30).length;

  const toggle = (id: string) => {
    setCheckedOff(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Modal open={open} onOpenChange={o => { if (!o) onClose(); }} title="" size="lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <TrendingUp className="h-6 w-6 text-purple-400 flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Listing Suggestions</h2>
            <p className="text-sm text-gray-400">
              {sittingThreePlus} item{sittingThreePlus !== 1 ? 's' : ''} sitting 3+ days
              {sittingThirtyPlus > 0 && (
                <> &middot; <span className="text-red-400">{sittingThirtyPlus} item{sittingThirtyPlus !== 1 ? 's' : ''} 30+ days</span></>
              )}
            </p>
          </div>
        </div>

        {/* Items List */}
        <div className="max-h-[400px] overflow-y-auto space-y-2 border border-gray-700 rounded-lg p-3 bg-gray-800/50">
          {candidates.length === 0 ? (
            <div className="py-10 text-center text-gray-500 text-sm">All caught up!</div>
          ) : candidates.map(item => {
            const isChecked = checkedOff.has(item.id);
            const missing = PLATFORMS.filter(p => !p.check(item));
            const qty = item.physicalQuantity ?? (item as any).ebayQuantity ?? 1;
            const days = Math.floor(daysListed(item));
            const badge = getDaysBadge(days);

            return (
              <div
                key={item.id}
                onClick={() => toggle(item.id)}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  isChecked ? 'bg-green-900/20 border-green-700' : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                {/* Checkbox */}
                <div className="flex-shrink-0 mt-1">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-green-600 border-green-600' : 'border-gray-600'}`}>
                    {isChecked && <CheckCircle className="h-4 w-4 text-white" />}
                  </div>
                </div>

                {/* Item info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white truncate">{item.name}</h3>
                        {badge && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 border rounded text-xs font-semibold whitespace-nowrap ${badge.className}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.size && <span className="text-xs text-gray-400">{item.size}</span>}
                        {qty > 1 && <span className="text-xs text-blue-400">Qty: {qty}</span>}
                      </div>
                    </div>
                    {(item.imageUrl || (item as any).ebayPrimaryImage) && (
                      <img
                        src={item.imageUrl || (item as any).ebayPrimaryImage}
                        alt={item.name}
                        className="w-12 h-12 object-cover rounded flex-shrink-0"
                      />
                    )}
                  </div>

                  {/* Missing platform badges */}
                  {missing.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {missing.map(p => (
                        <span key={p.key} className={`inline-flex items-center gap-1 px-2 py-1 border rounded text-xs ${p.color}`}>
                          <ExternalLink className="h-3 w-3" />
                          Not on {p.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            {checkedOff.size} of {candidates.length} handled
          </div>
          <Button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};
