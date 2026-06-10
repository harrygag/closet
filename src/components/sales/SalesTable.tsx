import React, { useState } from 'react';
import { ArrowUpDown, Trash2, CheckSquare, Square } from 'lucide-react';
import type { Sale, SaleSortField, SaleSortOption, MarketplaceType } from '../../types/sale';
import { Button } from '../ui/Button';

interface SalesTableProps {
  sales: Sale[];
  selectedSales: Set<string>;
  sortOption: SaleSortOption;
  onSort: (field: SaleSortField) => void;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onUpdateSale: (id: string, updates: Partial<Sale>) => void;
  onDeleteSale: (id: string) => void;
}

export const SalesTable: React.FC<SalesTableProps> = ({
  sales,
  selectedSales,
  sortOption,
  onSort,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onUpdateSale,
  onDeleteSale,
}) => {
  const [editingCell, setEditingCell] = useState<{ saleId: string; field: string } | null>(null);

  const formatCurrency = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const SortableHeader: React.FC<{ field: SaleSortField; children: React.ReactNode }> = ({ field, children }) => {
    const isActive = sortOption.field === field;
    return (
      <th
        onClick={() => onSort(field)}
        className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
      >
        <div className="flex items-center gap-2">
          {children}
          <ArrowUpDown className={`h-3 w-3 ${isActive ? 'text-blue-400' : 'text-gray-600'}`} />
        </div>
      </th>
    );
  };

  const EditableCell: React.FC<{
    sale: Sale;
    field: string;
    value: string | number;
    type: 'text' | 'number' | 'date';
    onSave: (value: any) => void;
  }> = ({ sale, field, value, type, onSave }) => {
    const isEditing = editingCell?.saleId === sale.id && editingCell?.field === field;
    const [tempValue, setTempValue] = useState(value);

    const handleBlur = () => {
      if (isEditing) {
        onSave(tempValue);
        setEditingCell(null);
      }
    };

    if (isEditing) {
      return (
        <input
          type={type}
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleBlur();
            if (e.key === 'Escape') {
              setTempValue(value);
              setEditingCell(null);
            }
          }}
          autoFocus
          className="w-full px-2 py-1 bg-gray-700 border border-blue-500 rounded text-white text-sm focus:outline-none"
        />
      );
    }

    return (
      <div
        onClick={() => {
          setTempValue(value);
          setEditingCell({ saleId: sale.id, field });
        }}
        className="cursor-text hover:bg-gray-700/50 px-2 py-1 rounded"
      >
        {value}
      </div>
    );
  };

  if (sales.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">No sales recorded yet</p>
        <p className="text-sm mt-2">Record your first sale by marking an item as SOLD</p>
      </div>
    );
  }

  const allSelected = sales.length > 0 && selectedSales.size === sales.length;

  return (
    <div className="overflow-x-auto">
      {/* Bulk Actions Bar */}
      {selectedSales.size > 0 && (
        <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg flex items-center justify-between">
          <span className="text-sm text-blue-300">
            {selectedSales.size} sale(s) selected
          </span>
          <div className="flex gap-2">
            <Button
              onClick={onClearSelection}
              variant="ghost"
              size="sm"
              className="text-gray-300 hover:text-white"
            >
              Clear
            </Button>
            <Button
              onClick={() => {
                if (confirm(`Delete ${selectedSales.size} selected sale(s)?`)) {
                  Array.from(selectedSales).forEach(onDeleteSale);
                }
              }}
              variant="danger"
              size="sm"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      <table className="min-w-full divide-y divide-gray-700">
        <thead className="bg-gray-800">
          <tr>
            <th className="px-4 py-3 w-12">
              <button
                onClick={allSelected ? onClearSelection : onSelectAll}
                className="text-gray-400 hover:text-white"
              >
                {allSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
              </button>
            </th>
            <SortableHeader field="saleDate">Date</SortableHeader>
            <SortableHeader field="itemName">Item</SortableHeader>
            <SortableHeader field="salePrice">Sale Price</SortableHeader>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Cost</th>
            <SortableHeader field="profit">Profit</SortableHeader>
            <SortableHeader field="profitMargin">Profit %</SortableHeader>
            <SortableHeader field="marketplace">Marketplace</SortableHeader>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Delisted</th>
            <th className="px-4 py-3 w-12"></th>
          </tr>
        </thead>
        <tbody className="bg-gray-800/50 divide-y divide-gray-700">
          {sales.map((sale) => (
            <tr key={sale.id} className="hover:bg-gray-700/50 transition-colors">
              {/* Checkbox */}
              <td className="px-4 py-3">
                <button
                  onClick={() => onToggleSelection(sale.id)}
                  className="text-gray-400 hover:text-white"
                >
                  {selectedSales.has(sale.id) ? (
                    <CheckSquare className="h-5 w-5 text-blue-400" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                </button>
              </td>

              {/* Date - Editable */}
              <td className="px-4 py-3 text-sm text-gray-300">
                <EditableCell
                  sale={sale}
                  field="saleDate"
                  value={sale.saleDate.split('T')[0]}
                  type="date"
                  onSave={(value) => onUpdateSale(sale.id, { saleDate: new Date(value).toISOString() })}
                />
              </td>

              {/* Item Name with Image */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {sale.itemImageUrl && (
                    <img
                      src={sale.itemImageUrl}
                      alt={sale.itemName}
                      className="h-8 w-8 object-cover rounded"
                    />
                  )}
                  <span className="text-sm text-white">{sale.itemName}</span>
                </div>
              </td>

              {/* Sale Price - Editable */}
              <td className="px-4 py-3 text-sm text-green-400 font-medium">
                <EditableCell
                  sale={sale}
                  field="salePrice"
                  value={(sale.salePrice / 100).toFixed(2)}
                  type="number"
                  onSave={(value) => onUpdateSale(sale.id, { salePrice: Math.round(parseFloat(value) * 100) })}
                />
              </td>

              {/* Cost - Editable */}
              <td className="px-4 py-3 text-sm text-gray-400">
                <EditableCell
                  sale={sale}
                  field="costPrice"
                  value={(sale.costPrice / 100).toFixed(2)}
                  type="number"
                  onSave={(value) => onUpdateSale(sale.id, { costPrice: Math.round(parseFloat(value) * 100) })}
                />
              </td>

              {/* Profit - Calculated */}
              <td className={`px-4 py-3 text-sm font-medium ${sale.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(sale.profit)}
              </td>

              {/* Profit % - Calculated */}
              <td className={`px-4 py-3 text-sm ${sale.profitMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {sale.profitMargin.toFixed(1)}%
              </td>

              {/* Marketplace - Editable Select */}
              <td className="px-4 py-3 text-sm">
                <select
                  value={sale.marketplace}
                  onChange={(e) => onUpdateSale(sale.id, { marketplace: e.target.value as MarketplaceType })}
                  className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="ebay">eBay</option>
                  <option value="poshmark">Poshmark</option>
                  <option value="depop">Depop</option>
                </select>
              </td>

              {/* Delist Checkboxes */}
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <label className="flex items-center gap-1 cursor-pointer" title="eBay">
                    <input
                      type="checkbox"
                      checked={sale.delistStatus.ebay}
                      onChange={(e) =>
                        onUpdateSale(sale.id, {
                          delistStatus: { ...sale.delistStatus, ebay: e.target.checked },
                        })
                      }
                      className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">E</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer" title="Poshmark">
                    <input
                      type="checkbox"
                      checked={sale.delistStatus.poshmark}
                      onChange={(e) =>
                        onUpdateSale(sale.id, {
                          delistStatus: { ...sale.delistStatus, poshmark: e.target.checked },
                        })
                      }
                      className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">P</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer" title="Depop">
                    <input
                      type="checkbox"
                      checked={sale.delistStatus.depop}
                      onChange={(e) =>
                        onUpdateSale(sale.id, {
                          delistStatus: { ...sale.delistStatus, depop: e.target.checked },
                        })
                      }
                      className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">D</span>
                  </label>
                </div>
              </td>

              {/* Delete Button */}
              <td className="px-4 py-3">
                <button
                  onClick={() => {
                    if (confirm(`Delete sale of ${sale.itemName}?`)) {
                      onDeleteSale(sale.id);
                    }
                  }}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
