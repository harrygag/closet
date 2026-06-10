/**
 * Example Usage: InventorySpreadsheet Component
 *
 * This file demonstrates how to integrate the InventorySpreadsheet component
 * into a page or parent component.
 */

import React from 'react';
import { InventorySpreadsheet } from './InventorySpreadsheet';
import { useItemStore } from '../../store/useItemStore';
import { useInventoryScanStore } from '../../store/useInventoryScanStore';
import { Button } from '../ui/Button';
import { Download, Settings, Filter } from 'lucide-react';
import { toast } from 'sonner';

export const InventorySpreadsheetExample: React.FC = () => {
  const { items } = useItemStore();
  const {
    selectedRows,
    exportToCSV,
    columnVisibility,
    setColumnVisibility
  } = useInventoryScanStore();

  // Handle bulk operations
  const handleBulkAction = (selectedIds: string[]) => {
    console.log('Selected items:', selectedIds);
    toast.success(`${selectedIds.length} items selected`);

    // Example bulk operations:
    // - Bulk update location
    // - Bulk check-in
    // - Bulk delete
    // - Bulk export
  };

  // Export to CSV
  const handleExportCSV = () => {
    const selectedItems = items.filter(item => selectedRows.has(item.id));
    const itemsToExport = selectedItems.length > 0 ? selectedItems : items;

    const csv = exportToCSV(itemsToExport);

    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success(`Exported ${itemsToExport.length} items to CSV`);
  };

  // Toggle column visibility
  const toggleColumn = (column: keyof typeof columnVisibility) => {
    setColumnVisibility({ [column]: !columnVisibility[column] });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Inventory Spreadsheet</h1>
        <p className="text-gray-400">
          View and edit all inventory items in an Excel-like interface
        </p>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        {/* Left: Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>Total Items: <strong className="text-white">{items.length}</strong></span>
          {selectedRows.size > 0 && (
            <span>Selected: <strong className="text-blue-400">{selectedRows.size}</strong></span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Export CSV */}
          <Button
            onClick={handleExportCSV}
            variant="secondary"
            size="sm"
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>

          {/* Column Settings */}
          <div className="relative group">
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Columns
            </Button>

            {/* Dropdown (example - implement with proper dropdown component) */}
            <div className="hidden group-hover:block absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-2 z-10">
              <div className="space-y-1">
                {Object.entries(columnVisibility).map(([key, visible]) => (
                  <label key={key} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-700 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleColumn(key as keyof typeof columnVisibility)}
                      className="rounded border-gray-600"
                    />
                    <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spreadsheet */}
      <InventorySpreadsheet
        items={items}
        onBulkAction={handleBulkAction}
      />

      {/* Help Text */}
      <div className="mt-6 p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Quick Tips
        </h3>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• Click column headers to sort</li>
          <li>• Click cells to edit inline (Name, Size, Price, Notes)</li>
          <li>• Use Tab, Enter, Escape for keyboard navigation</li>
          <li>• Select rows for bulk operations</li>
          <li>• Row colors indicate scan status (green=today, red=overdue, yellow=never)</li>
        </ul>
      </div>
    </div>
  );
};

// Alternative: Integration into existing ScanPage
export const ScanPageIntegration: React.FC = () => {
  const { items } = useItemStore();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Inventory Spreadsheet View</h2>
        <p className="text-gray-400">
          All items with real-time scan status tracking
        </p>
      </div>

      <InventorySpreadsheet items={items} />
    </div>
  );
};

/**
 * Integration Notes:
 *
 * 1. Add to existing page:
 *    - Import the component: `import { InventorySpreadsheet } from './components/inventory'`
 *    - Pass items: `<InventorySpreadsheet items={items} />`
 *
 * 2. Add as new route in App.tsx:
 *    ```tsx
 *    <Route path="/inventory/spreadsheet" element={<InventorySpreadsheetExample />} />
 *    ```
 *
 * 3. Add to navigation (Navigation.tsx):
 *    ```tsx
 *    <Link to="/inventory/spreadsheet">
 *      <Table className="h-5 w-5" />
 *      Spreadsheet
 *    </Link>
 *    ```
 *
 * 4. Bulk operations example:
 *    ```tsx
 *    const handleBulkAction = async (selectedIds: string[]) => {
 *      // Bulk update location
 *      await bulkUpdateLocation(selectedIds, { zone: 'A', shelf: '1' });
 *
 *      // Bulk check-in
 *      await bulkCheckIn(selectedIds, userId, items);
 *
 *      // Clear selection
 *      clearRowSelection();
 *    };
 *    ```
 */
