import { useState, useEffect } from 'react';
import { X, Check, ExternalLink } from 'lucide-react';
import type { Item } from '../types/item';

interface SoldDelistModalProps {
  item: Item | null;
  open: boolean;
  onClose: () => void;
  ebayAutoDelisted?: boolean;
  depopAutoDelisted?: boolean;
}

export function SoldDelistModal({ item, open, onClose, ebayAutoDelisted, depopAutoDelisted }: SoldDelistModalProps) {
  const [ebayChecked, setEbayChecked] = useState(false);
  const [poshChecked, setPoshChecked] = useState(false);
  const [depopChecked, setDepopChecked] = useState(false);

  useEffect(() => {
    setEbayChecked(!!ebayAutoDelisted);
    setDepopChecked(!!depopAutoDelisted);
    setPoshChecked(false);
  }, [item, ebayAutoDelisted, depopAutoDelisted]);

  if (!open || !item) return null;

  const hasEbay = !!(item.ebayListingId || item.ebayItemId);
  const hasPosh = !!item.poshmarkUrl;
  const hasDepop = !!(item.depopUrl || item.depopListingId);
  const platforms = [
    hasEbay && { name: 'eBay', checked: ebayChecked, auto: ebayAutoDelisted, toggle: () => setEbayChecked(!ebayChecked), color: '#3b82f6', url: item.ebayUrl },
    hasPosh && { name: 'Poshmark', checked: poshChecked, auto: false, toggle: () => setPoshChecked(!poshChecked), color: '#7B2E8E', url: item.poshmarkUrl },
    hasDepop && { name: 'Depop', checked: depopChecked, auto: depopAutoDelisted, toggle: () => setDepopChecked(!depopChecked), color: '#FF2300', url: item.depopUrl },
  ].filter(Boolean);

  const allChecked = platforms.every(p => p && p.checked);
  const noPlatforms = platforms.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-red-900/30 border-b border-red-500/20 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-red-400">OUT OF STOCK</h3>
            <p className="text-sm text-gray-400 mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Image */}
        {(item.imageUrl || (item as any).imageUrls?.[0]) && (
          <div className="px-6 pt-4">
            <img src={item.imageUrl || (item as any).imageUrls?.[0]} alt={item.name} className="w-full h-32 object-cover rounded-lg" />
          </div>
        )}

        {/* Platform checklist */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-gray-300 font-medium mb-3">Confirm delisted from all platforms:</p>
          {noPlatforms && <p className="text-sm text-gray-500">No marketplace listings found for this item.</p>}
          {platforms.map((p: any) => (
            <label key={p.name} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] cursor-pointer hover:bg-white/[0.06] transition-all">
              <div
                onClick={(e) => { e.preventDefault(); if (!p.auto) p.toggle(); }}
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                  p.checked ? 'bg-green-500 border-green-500' : 'border-gray-500'
                }`}
              >
                {p.checked && <Check className="h-4 w-4 text-white" />}
              </div>
              <div className="flex-1">
                <span className="font-medium" style={{ color: p.color }}>{p.name}</span>
                {p.auto && p.checked && <span className="text-xs text-green-400 ml-2">Auto-delisted</span>}
                {!p.auto && !p.checked && <span className="text-xs text-gray-500 ml-2">Check after manual delist</span>}
              </div>
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-gray-500 hover:text-white">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            disabled={!allChecked && !noPlatforms}
            className={`px-6 py-2.5 rounded-xl font-medium transition-all ${
              allChecked || noPlatforms
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            {allChecked || noPlatforms ? 'All Done' : 'Check all platforms first'}
          </button>
        </div>
      </div>
    </div>
  );
}
