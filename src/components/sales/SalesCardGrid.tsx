import React, { useState } from 'react';
import { Trash2, CheckSquare, Square, Package, Pencil, X, Check } from 'lucide-react';
import type { Sale, SaleSource, MarketplaceType } from '../../types/sale';

interface SalesCardGridProps {
  sales: Sale[];
  selectedSales: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onUpdateSale: (id: string, updates: Partial<Sale>) => void;
  onDeleteSale: (id: string) => void;
}

// Subtle dark pills with a tiny brand-colored dot. Tone matches the smoky
// theme on /sales; brand is conveyed by the dot, not by flooded backgrounds.
const MARKETPLACE_STYLES: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  ebay:      { bg: 'bg-[#15171C]', text: 'text-gray-200', label: 'eBay',      dot: '#0064D2' },
  poshmark:  { bg: 'bg-[#15171C]', text: 'text-gray-200', label: 'Poshmark',  dot: '#E2A6B5' },
  depop:     { bg: 'bg-[#15171C]', text: 'text-gray-200', label: 'Depop',     dot: '#FFFFFF' },
  whatnot:   { bg: 'bg-[#15171C]', text: 'text-gray-200', label: 'Whatnot',   dot: '#FFB200' },
  in_person: { bg: 'bg-[#15171C]', text: 'text-gray-300', label: 'In-Person', dot: '#9AA0AA' },
};

const SOURCE_LABELS: Record<SaleSource, { label: string; color: string }> = {
  detail_page: { label: 'Manual', color: 'text-green-400 bg-green-900/30' },
  sell_search: { label: 'Search', color: 'text-blue-400 bg-blue-900/30' },
  dot_sold: { label: 'Dot Sold', color: 'text-green-400 bg-green-900/30' },
  auto_ebay_sync: { label: 'Auto', color: 'text-yellow-400 bg-yellow-900/30' },
  scan_sales: { label: 'Scan', color: 'text-cyan-400 bg-cyan-900/30' },
  scan_detail: { label: 'Scan', color: 'text-cyan-400 bg-cyan-900/30' },
  stock_check: { label: 'Stock Check', color: 'text-orange-400 bg-orange-900/30' },
  bulk_status: { label: 'Bulk', color: 'text-orange-400 bg-orange-900/30' },
  quantity_zero: { label: 'Qty Zero', color: 'text-orange-400 bg-orange-900/30' },
};

const formatCurrency = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const SalesCardGrid: React.FC<SalesCardGridProps> = ({
  sales,
  selectedSales,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onUpdateSale,
  onDeleteSale,
}) => {
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editMarketplace, setEditMarketplace] = useState<MarketplaceType>('ebay');

  const startEditing = (sale: Sale) => {
    setEditingSaleId(sale.id);
    setEditPrice((sale.salePrice / 100).toFixed(2));
    setEditCost((sale.costPrice / 100).toFixed(2));
    setEditMarketplace(sale.marketplace);
  };

  const saveEdit = (sale: Sale) => {
    const newPrice = Math.round(parseFloat(editPrice) * 100);
    const newCost = Math.round(parseFloat(editCost) * 100);
    if (isNaN(newPrice) || isNaN(newCost)) return;

    onUpdateSale(sale.id, {
      salePrice: newPrice,
      costPrice: newCost,
      marketplace: editMarketplace,
    });
    setEditingSaleId(null);
  };

  if (sales.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg">No sales recorded yet</p>
        <p className="text-sm mt-2">Record your first sale by marking an item as SOLD</p>
      </div>
    );
  }

  const allSelected = sales.length > 0 && selectedSales.size === sales.length;

  return (
    <div>
      {/* Bulk Actions Bar */}
      {selectedSales.size > 0 && (
        <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg flex items-center justify-between">
          <span className="text-sm text-blue-300">
            {selectedSales.size} sale(s) selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClearSelection}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-gray-700 rounded-lg"
            >
              Clear
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete ${selectedSales.size} selected sale(s)?`)) {
                  Array.from(selectedSales).forEach(onDeleteSale);
                }
              }}
              className="px-3 py-1.5 text-sm text-red-300 hover:text-red-100 bg-red-900/50 rounded-lg flex items-center gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Select All */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={allSelected ? onClearSelection : onSelectAll}
          className="text-gray-400 hover:text-white flex items-center gap-2 text-sm"
        >
          {allSelected ? <CheckSquare className="h-4 w-4 text-blue-400" /> : <Square className="h-4 w-4" />}
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-gray-600 text-sm">({sales.length} sales)</span>
      </div>

      {/* Scrolling feed — one row per sale, image on left. 2-column on wider screens. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {sales.map((sale) => {
          const mp = MARKETPLACE_STYLES[sale.marketplace] || MARKETPLACE_STYLES.in_person;
          const src = SOURCE_LABELS[(sale.saleSource || 'detail_page') as SaleSource] || SOURCE_LABELS.detail_page;
          const isEditing = editingSaleId === sale.id;
          const isSel = selectedSales.has(sale.id);

          return (
            <div
              key={sale.id}
              className={`relative bg-gray-800/60 border rounded-xl transition-all hover:border-gray-600 overflow-hidden ${
                isSel ? 'border-blue-500 bg-blue-900/10' : 'border-gray-700/50'
              }`}
            >
              <div className="flex gap-3 p-3">
                {/* Image on the left */}
                <div className="flex-shrink-0">
                  {sale.itemImageUrl ? (
                    <img
                      src={sale.itemImageUrl}
                      alt={sale.itemName}
                      className="h-20 w-20 object-cover rounded-lg"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-20 w-20 bg-gray-700 rounded-lg flex items-center justify-center">
                      <Package className="h-7 w-7 text-gray-500" />
                    </div>
                  )}
                </div>

                {/* Right column: info + price + actions */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  {/* Top row — title + price + selection checkbox */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate" title={sale.itemName}>
                        {sale.itemName}
                      </p>
                      <p className="text-[11px] text-gray-500">{formatDate(sale.saleDate)}</p>
                    </div>
                    <button
                      onClick={() => onToggleSelection(sale.id)}
                      className="flex-shrink-0 text-gray-500 hover:text-white"
                      title={isSel ? 'Deselect' : 'Select'}
                    >
                      {isSel ? (
                        <CheckSquare className="h-4 w-4 text-blue-400" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Badges row (compact) */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-[#2A2D34] ${mp.bg} ${mp.text}`}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: mp.dot, display: 'inline-block' }} />
                      {mp.label}
                    </span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${src.color}`}>
                      {src.label}
                    </span>
                  </div>

                  {/* Price / profit OR edit form */}
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        <div className="flex-1 min-w-[100px]">
                          <label className="text-xs text-gray-500">Sale $</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                            autoFocus
                          />
                        </div>
                        <div className="flex-1 min-w-[100px]">
                          <label className="text-xs text-gray-500">Cost $</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editCost}
                            onChange={(e) => setEditCost(e.target.value)}
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                          />
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-xs text-gray-500">Marketplace</label>
                          <select
                            value={editMarketplace}
                            onChange={(e) => setEditMarketplace(e.target.value as MarketplaceType)}
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                          >
                            <option value="ebay">eBay</option>
                            <option value="poshmark">Poshmark</option>
                            <option value="depop">Depop</option>
                            <option value="in_person">In-Person</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(sale)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-xs text-white"
                        >
                          <Check className="h-3.5 w-3.5" /> Save
                        </button>
                        <button
                          onClick={() => setEditingSaleId(null)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300"
                        >
                          <X className="h-3.5 w-3.5" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-base font-bold text-green-400">{formatCurrency(sale.salePrice)}</span>
                      <span className={`text-xs font-medium ${sale.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {sale.profit >= 0 ? '+' : ''}{formatCurrency(sale.profit)} ({sale.profitMargin.toFixed(0)}%)
                      </span>
                      <span className="text-[10px] text-gray-500">cost {formatCurrency(sale.costPrice)}</span>
                    </div>
                  )}

                  {/* Bottom row — delist checkboxes + actions, all compact */}
                  {!isEditing && (
                    <div className="flex items-center justify-between gap-2 mt-auto pt-1 flex-wrap">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 cursor-pointer" title="eBay delisted">
                          <input
                            type="checkbox"
                            checked={sale.delistStatus?.ebay || false}
                            onChange={(e) =>
                              onUpdateSale(sale.id, { delistStatus: { ...sale.delistStatus, ebay: e.target.checked } })
                            }
                            className="rounded border-gray-600 bg-gray-700 text-blue-600 h-3 w-3"
                          />
                          <span className="text-[10px] text-gray-500">eBay</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer" title="Poshmark delisted">
                          <input
                            type="checkbox"
                            checked={sale.delistStatus?.poshmark || false}
                            onChange={(e) =>
                              onUpdateSale(sale.id, { delistStatus: { ...sale.delistStatus, poshmark: e.target.checked } })
                            }
                            className="rounded border-gray-600 bg-gray-700 text-purple-600 h-3 w-3"
                          />
                          <span className="text-[10px] text-gray-500">Posh</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer" title="Depop delisted">
                          <input
                            type="checkbox"
                            checked={sale.delistStatus?.depop || false}
                            onChange={(e) =>
                              onUpdateSale(sale.id, { delistStatus: { ...sale.delistStatus, depop: e.target.checked } })
                            }
                            className="rounded border-gray-600 bg-gray-700 text-red-600 h-3 w-3"
                          />
                          <span className="text-[10px] text-gray-500">Depop</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditing(sale)}
                          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete sale of ${sale.itemName}?`)) onDeleteSale(sale.id);
                          }}
                          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
