import React, { useState, useMemo, useCallback } from 'react';
// TODO: Add virtual scrolling with react-window for 1000+ items performance
// import { FixedSizeList as List } from 'react-window';
import { ArrowUpDown, CheckSquare, Square } from 'lucide-react';
import type { Item, ItemStatus } from '../../types/item';
import { useInventoryScanStore } from '../../store/useInventoryScanStore';
import { useItemStore } from '../../store/useItemStore';
import { Button } from '../ui/Button';
import { toast } from 'sonner';

interface InventorySpreadsheetProps {
  items: Item[];
  onBulkAction?: (selectedIds: string[]) => void;
}

export const InventorySpreadsheet: React.FC<InventorySpreadsheetProps> = ({ items, onBulkAction }) => {
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);

  const {
    columnVisibility,
    sortConfig,
    selectedRows,
    toggleRowSelection,
    selectAllRows,
    clearRowSelection,
    setSortConfig,
  } = useInventoryScanStore();

  const { updateItem } = useItemStore();

  // Calculate row background color based on scan status
  const getRowColor = useCallback((item: Item): string => {
    const now = new Date();
    if (!item.lastScannedDate) {
      return 'bg-yellow-900/20'; // Never scanned - yellow
    }
    const lastScan = new Date(item.lastScannedDate);
    const daysSince = (now.getTime() - lastScan.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince < 1) {
      return 'bg-green-900/20'; // Scanned today - green
    } else if (daysSince > 7) {
      return 'bg-red-900/20'; // Overdue - red
    }
    return ''; // Default
  }, []);

  // Format date for display
  const formatLastScanned = useCallback((dateString?: string): string => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) return 'Today';
    if (daysDiff === 1) return '1 day ago';
    if (daysDiff < 7) return `${daysDiff} days ago`;
    if (daysDiff < 30) return `${Math.floor(daysDiff / 7)} weeks ago`;
    return `${Math.floor(daysDiff / 30)} months ago`;
  }, []);

  // Sort items based on sortConfig
  const sortedItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    if (!sortConfig || !sortConfig.field) return items;

    const sorted = [...items];
    sorted.sort((a, b) => {
      const aValue = a[sortConfig.field];
      const bValue = b[sortConfig.field];

      // Handle undefined/null values
      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      return 0;
    });
    return sorted;
  }, [items, sortConfig]);

  // Handle sort
  const handleSort = useCallback((field: keyof Item) => {
    setSortConfig({
      field,
      direction: sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    });
  }, [sortConfig, setSortConfig]);

  // Sortable Header Component
  const SortableHeader: React.FC<{ field: keyof Item; children: React.ReactNode }> = ({ field, children }) => {
    const isActive = sortConfig.field === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors border-r border-gray-700"
      >
        <div className="flex items-center gap-2">
          {children}
          <ArrowUpDown className={`h-3 w-3 ${isActive ? 'text-blue-400' : 'text-gray-600'}`} />
        </div>
      </th>
    );
  };

  // Editable Cell Component
  const EditableCell: React.FC<{
    item: Item;
    field: string;
    value: string | number;
    type: 'text' | 'number';
    onSave: (value: any) => void;
  }> = ({ item, field, value, type, onSave }) => {
    const isEditing = editingCell?.itemId === item.id && editingCell?.field === field;
    const [tempValue, setTempValue] = useState(value);

    const handleBlur = async () => {
      if (isEditing) {
        try {
          await onSave(tempValue);
          setEditingCell(null);
        } catch (error) {
          console.error('Failed to save:', error);
          toast.error('Failed to save changes');
        }
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
          setEditingCell({ itemId: item.id, field });
        }}
        className="cursor-text hover:bg-gray-700/50 px-2 py-1 rounded min-h-[32px] flex items-center"
      >
        {value}
      </div>
    );
  };

  // Update item field
  const handleUpdateField = async (item: Item, field: keyof Item, value: any) => {
    await updateItem({ ...item, [field]: value });
  };

  // Row renderer for virtual scrolling
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = sortedItems[index];
    const isSelected = selectedRows.has(item.id);
    const rowColor = getRowColor(item);

    return (
      <div
        style={style}
        className={`flex items-stretch border-b border-gray-700 ${rowColor} hover:bg-gray-700/50 transition-colors`}
      >
        {/* Checkbox */}
        <div className="flex-shrink-0 w-12 flex items-center justify-center border-r border-gray-700">
          <button
            onClick={() => toggleRowSelection(item.id)}
            className="text-gray-400 hover:text-white"
          >
            {isSelected ? (
              <CheckSquare className="h-5 w-5 text-blue-400" />
            ) : (
              <Square className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Name */}
        {columnVisibility.name && (
          <div className="flex-1 min-w-[200px] px-4 py-2 border-r border-gray-700 flex items-center">
            <EditableCell
              item={item}
              field="name"
              value={item.name}
              type="text"
              onSave={(value) => handleUpdateField(item, 'name', value)}
            />
          </div>
        )}

        {/* Size */}
        {columnVisibility.size && (
          <div className="flex-shrink-0 w-24 px-4 py-2 border-r border-gray-700 flex items-center">
            <EditableCell
              item={item}
              field="size"
              value={item.size}
              type="text"
              onSave={(value) => handleUpdateField(item, 'size', value)}
            />
          </div>
        )}

        {/* Status */}
        {columnVisibility.status && (
          <div className="flex-shrink-0 w-32 px-4 py-2 border-r border-gray-700 flex items-center">
            <select
              value={item.status}
              onChange={async (e) => {
                try {
                  await handleUpdateField(item, 'status', e.target.value as ItemStatus);
                } catch (error) {
                  toast.error('Failed to update status');
                }
              }}
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="SOLD">SOLD</option>
            </select>
          </div>
        )}

        {/* Tags */}
        {columnVisibility.tags && (
          <div className="flex-1 min-w-[150px] px-4 py-2 border-r border-gray-700 flex items-center">
            <div className="flex flex-wrap gap-1">
              {item.tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-blue-900/30 border border-blue-700/50 rounded text-xs text-blue-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Price */}
        {columnVisibility.price && (
          <div className="flex-shrink-0 w-28 px-4 py-2 border-r border-gray-700 flex items-center">
            <EditableCell
              item={item}
              field="sellingPrice"
              value={(item.sellingPrice).toFixed(2)}
              type="number"
              onSave={(value) => handleUpdateField(item, 'sellingPrice', parseFloat(value))}
            />
          </div>
        )}

        {/* eBay SKU */}
        {columnVisibility.ebaySku && (
          <div className="flex-shrink-0 w-32 px-4 py-2 border-r border-gray-700 flex items-center">
            <span className="text-sm text-gray-300">{item.ebaySku || '-'}</span>
          </div>
        )}

        {/* Last Scanned */}
        {columnVisibility.lastScanned && (
          <div className="flex-shrink-0 w-32 px-4 py-2 border-r border-gray-700 flex items-center">
            <span className="text-sm text-gray-300">{formatLastScanned(item.lastScannedDate)}</span>
          </div>
        )}

        {/* Scan Count */}
        <div className="flex-shrink-0 w-24 px-4 py-2 border-r border-gray-700 flex items-center justify-center">
          <span className="text-sm text-gray-300">{item.scanCount || 0}</span>
        </div>

        {/* Location */}
        {columnVisibility.location && (
          <div className="flex-shrink-0 w-40 px-4 py-2 border-r border-gray-700 flex items-center">
            <span className="text-sm text-gray-300">
              {item.physicalLocation
                ? `${item.physicalLocation.zone}-${item.physicalLocation.shelf}${
                    item.physicalLocation.bin ? `-${item.physicalLocation.bin}` : ''
                  }`
                : '-'}
            </span>
          </div>
        )}

        {/* Notes */}
        {columnVisibility.notes && (
          <div className="flex-1 min-w-[200px] px-4 py-2 border-r border-gray-700 flex items-center">
            <EditableCell
              item={item}
              field="notes"
              value={item.notes}
              type="text"
              onSave={(value) => handleUpdateField(item, 'notes', value)}
            />
          </div>
        )}
      </div>
    );
  };

  // Calculate total width based on visible columns
  const calculateTotalWidth = () => {
    let width = 48; // Checkbox column
    if (columnVisibility.name) width += 200;
    if (columnVisibility.size) width += 96;
    if (columnVisibility.status) width += 128;
    if (columnVisibility.tags) width += 150;
    if (columnVisibility.price) width += 112;
    if (columnVisibility.ebaySku) width += 128;
    if (columnVisibility.lastScanned) width += 128;
    width += 96; // Scan Count (always visible)
    if (columnVisibility.location) width += 160;
    if (columnVisibility.notes) width += 200;
    return Math.max(width, 1200); // Minimum width
  };

  const allSelected = sortedItems.length > 0 && selectedRows.size === sortedItems.length;

  if (sortedItems.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">No items found</p>
        <p className="text-sm mt-2">Add items to your inventory to see them here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Bulk Actions Bar */}
      {selectedRows.size > 0 && (
        <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg flex items-center justify-between">
          <span className="text-sm text-blue-300">
            {selectedRows.size} item(s) selected
          </span>
          <div className="flex gap-2">
            <Button
              onClick={clearRowSelection}
              variant="ghost"
              size="sm"
              className="text-gray-300 hover:text-white"
            >
              Clear
            </Button>
            {onBulkAction && (
              <Button
                onClick={() => onBulkAction(Array.from(selectedRows))}
                variant="primary"
                size="sm"
              >
                Bulk Action
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Spreadsheet Container */}
      <div className="flex-1 bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700">
        {/* Header Row */}
        <div className="bg-gray-800 border-b border-gray-700 flex" style={{ width: calculateTotalWidth() }}>
          {/* Checkbox Header */}
          <div className="flex-shrink-0 w-12 px-4 py-3 border-r border-gray-700 flex items-center justify-center">
            <button
              onClick={allSelected ? clearRowSelection : () => selectAllRows(sortedItems.map(i => i.id))}
              className="text-gray-400 hover:text-white"
            >
              {allSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
            </button>
          </div>

          {/* Column Headers */}
          {columnVisibility.name && <SortableHeader field="name">Name</SortableHeader>}
          {columnVisibility.size && (
            <th className="flex-shrink-0 w-24 px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase border-r border-gray-700">
              Size
            </th>
          )}
          {columnVisibility.status && <SortableHeader field="status">Status</SortableHeader>}
          {columnVisibility.tags && (
            <th className="flex-1 min-w-[150px] px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase border-r border-gray-700">
              Tags
            </th>
          )}
          {columnVisibility.price && <SortableHeader field="sellingPrice">Price</SortableHeader>}
          {columnVisibility.ebaySku && (
            <th className="flex-shrink-0 w-32 px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase border-r border-gray-700">
              eBay SKU
            </th>
          )}
          {columnVisibility.lastScanned && <SortableHeader field="lastScannedDate">Last Scanned</SortableHeader>}
          <SortableHeader field="scanCount">Scans</SortableHeader>
          {columnVisibility.location && (
            <th className="flex-shrink-0 w-40 px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase border-r border-gray-700">
              Location
            </th>
          )}
          {columnVisibility.notes && (
            <th className="flex-1 min-w-[200px] px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase border-r border-gray-700">
              Notes
            </th>
          )}
        </div>

        {/* Scrollable Items List (TODO: Add virtual scrolling for 1000+ items) */}
        <div className="overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
          {sortedItems.map((item, index) => (
            <Row key={item.id} index={index} style={{}} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-900/20 border border-green-700/50 rounded"></div>
          <span>Scanned today</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-900/20 border border-red-700/50 rounded"></div>
          <span>Overdue (7+ days)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-900/20 border border-yellow-700/50 rounded"></div>
          <span>Never scanned</span>
        </div>
      </div>
    </div>
  );
};
