/**
 * Example usage of ColumnVisibilitySelector
 *
 * This component should be placed in your toolbar/header area above the InventorySpreadsheet.
 * It automatically syncs with the useInventoryScanStore and persists preferences to localStorage.
 */

import { ColumnVisibilitySelector } from './ColumnVisibilitySelector';

// Example 1: Simple usage in a toolbar
export const InventoryToolbar = () => {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
      <h2 className="text-xl font-bold text-white">Inventory</h2>
      <div className="flex items-center gap-2">
        {/* Other toolbar buttons */}
        <ColumnVisibilitySelector />
      </div>
    </div>
  );
};

// Example 2: Usage with other controls
export const SpreadsheetControls = () => {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg">
      {/* Export button */}
      <button className="px-4 py-2 bg-blue-600 text-white rounded-lg">
        Export CSV
      </button>

      {/* Filter dropdown */}
      <button className="px-4 py-2 bg-gray-800 text-white rounded-lg">
        Filters
      </button>

      {/* Column visibility selector */}
      <ColumnVisibilitySelector />
    </div>
  );
};

/**
 * The component automatically:
 * 1. Loads saved preferences from localStorage on mount
 * 2. Syncs with useInventoryScanStore.columnVisibility
 * 3. Saves changes to localStorage ('inventoryColumnVisibility' key)
 * 4. Updates the store when columns are toggled or presets are applied
 *
 * Available presets:
 * - Essentials: Name, Price, Last Scanned, Location
 * - Full: All columns visible
 * - Scanning Mode: Name, Barcode, Last Scanned, Location
 */
