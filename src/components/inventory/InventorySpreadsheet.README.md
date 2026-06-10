# InventorySpreadsheet Component

## Overview
An Excel-like spreadsheet component for viewing and editing inventory items with real-time scan status highlighting and virtual scrolling for optimal performance with 1000+ items.

## Features

### 1. Virtual Scrolling (react-window)
- Uses `FixedSizeList` from `react-window` for efficient rendering
- Handles 1000+ items without performance degradation
- Fixed row height: 60px
- Scrollable container height: 600px

### 2. Sortable Headers
- Click any column header to sort by that field
- Toggle between ascending/descending order
- Active sort column highlighted in blue
- Visual arrow indicator showing sort state

### 3. Inline Editing (EditableCell Pattern)
- Adapted from `SalesTable.tsx` EditableCell pattern
- Click any editable cell to enter edit mode
- Keyboard support:
  - **Enter**: Save changes
  - **Escape**: Cancel changes
  - **Tab**: Move to next field (native)
- Auto-save on blur
- Visual feedback: blue border when editing

### 4. Row Selection
- Individual row checkboxes
- Select all / Clear all in header
- Bulk actions bar appears when rows selected
- Integrates with `useInventoryScanStore.selectedRows`

### 5. Real-Time Scan Status Highlighting
Row backgrounds change based on `lastScannedDate`:
- **Green** (`bg-green-900/20`): Scanned today (within 24 hours)
- **Red** (`bg-red-900/20`): Overdue (more than 7 days ago)
- **Yellow** (`bg-yellow-900/20`): Never scanned (no `lastScannedDate`)

### 6. Column Configuration
Displays columns based on `columnVisibility` from `useInventoryScanStore`:
- **Checkbox** (always visible): Row selection
- **Name** (editable): Item name
- **Size** (editable): Item size
- **Status** (dropdown): Active, Inactive, SOLD
- **Tags** (display): Chip display of tags
- **Price** (editable): Selling price in dollars
- **eBay SKU** (display): eBay SKU if available
- **Last Scanned** (display): Relative time display (e.g., "2 days ago")
- **Scan Count** (always visible): Total number of scans
- **Location** (display): Zone-Shelf-Bin format
- **Notes** (editable): Item notes

### 7. Keyboard Navigation
- **Tab**: Move between editable fields
- **Enter**: Save current cell and exit edit mode
- **Escape**: Cancel editing and revert changes
- Native browser keyboard navigation for dropdown/select

## Usage

```tsx
import { InventorySpreadsheet } from '../components/inventory';
import { useItemStore } from '../store/useItemStore';

function MyInventoryPage() {
  const { items } = useItemStore();

  const handleBulkAction = (selectedIds: string[]) => {
    console.log('Bulk action on:', selectedIds);
    // Implement bulk operations
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Inventory Spreadsheet</h1>
      <InventorySpreadsheet
        items={items}
        onBulkAction={handleBulkAction}
      />
    </div>
  );
}
```

## Props

```typescript
interface InventorySpreadsheetProps {
  items: Item[];                              // Array of inventory items
  onBulkAction?: (selectedIds: string[]) => void; // Optional bulk action callback
}
```

## Store Integration

### useInventoryScanStore
The component reads from and writes to the inventory scan store:

**Read:**
- `columnVisibility`: Controls which columns are displayed
- `sortConfig`: Current sort field and direction
- `selectedRows`: Set of selected item IDs

**Write:**
- `toggleRowSelection(id)`: Toggle single row selection
- `selectAllRows(itemIds)`: Select all visible items
- `clearRowSelection()`: Clear all selections
- `setSortConfig(config)`: Update sort configuration

### useItemStore
Used for item updates:
- `updateItem(item)`: Save changes to an item

## Dependencies

```json
{
  "react-window": "^1.8.10",
  "@types/react-window": "^1.8.8"
}
```

Already available:
- `lucide-react`: Icons (ArrowUpDown, CheckSquare, Square)
- `sonner`: Toast notifications
- `zustand`: State management

## Styling

- Built with **Tailwind CSS**
- Dark theme (`bg-gray-900`, `text-white`)
- Consistent with app design system
- Border styling for table structure
- Hover effects for interactivity
- Custom scrollbar styling (thin, gray)

## Performance Optimizations

1. **Virtual Scrolling**: Only renders visible rows
2. **useMemo**: Memoized sorted items calculation
3. **useCallback**: Memoized event handlers and formatters
4. **Fixed Row Height**: Enables efficient scrolling calculations
5. **Controlled Updates**: Updates only affected rows on state change

## Accessibility

- Semantic table structure (th, td roles via divs)
- Keyboard navigation support
- Focus indicators on editable cells
- ARIA-compatible button elements
- Screen reader friendly labels

## Future Enhancements

Potential features for future iterations:
- Column resizing (drag to resize)
- Column reordering (drag & drop)
- Row height customization
- Export to CSV/Excel
- Filter dropdowns per column
- Inline add new item row
- Multi-column sort
- Context menu (right-click actions)
- Copy/paste from Excel

## Related Components

- `SalesTable.tsx`: Reference implementation for EditableCell pattern
- `PhysicalLocationEditor.tsx`: Location editing modal
- `ScanStatsWidget.tsx`: Scan progress statistics

## Testing Notes

To test the component:
1. Add 100+ items to inventory
2. Test sorting by each column
3. Test inline editing of Name, Size, Price, Notes
4. Test status dropdown changes
5. Test row selection (single, all, clear)
6. Verify scan status colors (green, red, yellow)
7. Test keyboard navigation (Tab, Enter, Escape)
8. Verify virtual scrolling performance

## Component Structure

```
InventorySpreadsheet.tsx
├── State Management
│   ├── editingCell (local state)
│   ├── columnVisibility (store)
│   ├── sortConfig (store)
│   └── selectedRows (store)
├── Computed Values
│   ├── sortedItems (useMemo)
│   ├── getRowColor (useCallback)
│   └── formatLastScanned (useCallback)
├── Sub-Components
│   ├── SortableHeader
│   ├── EditableCell
│   └── Row (virtual list renderer)
└── UI Sections
    ├── Bulk Actions Bar
    ├── Header Row
    ├── Virtual List (react-window)
    └── Legend
```

## File Location

```
src/
└── components/
    └── inventory/
        ├── index.ts
        ├── InventorySpreadsheet.tsx ← This component
        ├── InventorySpreadsheet.README.md
        ├── PhysicalLocationEditor.tsx
        └── ScanStatsWidget.tsx
```
