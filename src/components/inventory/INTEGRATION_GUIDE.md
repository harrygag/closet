# Quick Integration Guide: ScanStatsWidget

## 5-Minute Setup

### Step 1: Import the Component

```tsx
import { ScanStatsWidget } from '@/components/inventory';
```

### Step 2: Add to Your Page

```tsx
function InventoryPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Inventory Dashboard</h1>

      {/* Add the widget here */}
      <ScanStatsWidget />

      {/* Your existing spreadsheet/table */}
      <InventorySpreadsheet />
    </div>
  );
}
```

### Step 3: Add Filter Integration (Optional)

```tsx
import { ScanStatsWidget } from '@/components/inventory';
import { useInventoryScanStore } from '@/store/useInventoryScanStore';

function InventoryPage() {
  const { setFilterConfig } = useInventoryScanStore();

  const handleFilterClick = (filterType: 'never-scanned' | 'overdue' | 'verified-today') => {
    switch (filterType) {
      case 'never-scanned':
        setFilterConfig({
          verificationStatus: ['needs-verification'],
          lastScanned: 'never'
        });
        break;
      case 'overdue':
        setFilterConfig({
          verificationStatus: ['overdue'],
          lastScanned: '7d'
        });
        break;
      case 'verified-today':
        setFilterConfig({
          verificationStatus: ['verified'],
          lastScanned: '1d'
        });
        break;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <ScanStatsWidget onFilterClick={handleFilterClick} />
      <InventorySpreadsheet />
    </div>
  );
}
```

## Common Integration Patterns

### Pattern 1: With Clear Filters Button

```tsx
const { setFilterConfig, filterConfig } = useInventoryScanStore();

const clearFilters = () => {
  setFilterConfig({
    verificationStatus: [],
    lastScanned: 'all'
  });
};

<div className="space-y-4">
  <div className="flex justify-between items-center">
    <h2 className="text-xl font-bold text-white">Scan Stats</h2>
    {filterConfig.verificationStatus.length > 0 && (
      <button
        onClick={clearFilters}
        className="text-sm text-blue-400 hover:text-blue-300"
      >
        Clear Filters
      </button>
    )}
  </div>
  <ScanStatsWidget onFilterClick={handleFilterClick} />
</div>
```

### Pattern 2: With Active Filter Indicator

```tsx
<ScanStatsWidget onFilterClick={handleFilterClick} />

{filterConfig.lastScanned !== 'all' && (
  <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-3">
    <p className="text-sm text-blue-400">
      Filtering: {filterConfig.lastScanned === 'never' ? 'Never Scanned' :
                  filterConfig.lastScanned === '7d' ? 'Overdue (7+ days)' :
                  'Verified Today'}
    </p>
  </div>
)}
```

### Pattern 3: Side-by-Side Layout

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  {/* Stats take 1 column */}
  <div className="lg:col-span-1">
    <ScanStatsWidget onFilterClick={handleFilterClick} />
  </div>

  {/* Spreadsheet takes 2 columns */}
  <div className="lg:col-span-2">
    <InventorySpreadsheet />
  </div>
</div>
```

## Data Requirements

The widget automatically pulls data from two stores:

1. **useInventoryScanStore** - Provides scan tracking
   - Must have `dailyScanGoal` set (default: 120)
   - Tracks scans in `todayScans` Set
   - Provides helper methods for calculations

2. **useItemStore** - Provides inventory items
   - Must have `items` array populated
   - Items should have `lastScannedDate` field (ISO string or undefined)

## Customizing the Daily Goal

```tsx
import { useInventoryScanStore } from '@/store/useInventoryScanStore';

const { setDailyScanGoal } = useInventoryScanStore();

// Set a custom goal (persisted to localStorage)
setDailyScanGoal(150); // New goal: 150 items per day
```

## Styling Customization

The component uses Tailwind classes. To customize:

```tsx
// Wrap in a container with custom styles
<div className="my-custom-container">
  <ScanStatsWidget onFilterClick={handleFilterClick} />
</div>
```

Or modify the component directly for project-wide changes.

## TypeScript Types

```typescript
interface ScanStatsWidgetProps {
  onFilterClick?: (
    filterType: 'never-scanned' | 'overdue' | 'verified-today'
  ) => void;
}

type FilterType = 'never-scanned' | 'overdue' | 'verified-today';
```

## Troubleshooting

### Widget shows 0 items scanned
- Check that `useInventoryScanStore` is properly initialized
- Verify scans are being recorded with `recordScan(itemId, userId, itemName)`
- Check that `resetDailyScanTracking()` was called on app load

### Stats cards show wrong counts
- Ensure `items` array from `useItemStore` is populated
- Verify `lastScannedDate` fields are in ISO string format
- Check browser console for errors

### Filter integration not working
- Verify `setFilterConfig` is imported from `useInventoryScanStore`
- Check that your spreadsheet component uses the same filter store
- Ensure filter configuration matches your spreadsheet's filter logic

### Progress bar not visible
- Check that `dailyScanGoal` is set (not 0)
- Verify dark theme styles are applied (parent has dark background)
- Ensure Tailwind is configured to include gradient utilities

## Performance Notes

- Component re-renders when store values change
- Calculations run on every render (fast for typical inventory sizes)
- For large inventories (10,000+ items), consider memoization:

```tsx
const verifiedTodayItems = React.useMemo(() => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return items.filter((item) => {
    if (!item.lastScannedDate) return false;
    return new Date(item.lastScannedDate) >= oneDayAgo;
  });
}, [items]);
```

## Testing

Basic test to verify integration:

```tsx
import { render, screen } from '@testing-library/react';
import { ScanStatsWidget } from '@/components/inventory';

test('renders scan stats widget', () => {
  render(<ScanStatsWidget />);
  expect(screen.getByText('Daily Scan Progress')).toBeInTheDocument();
  expect(screen.getByText('Never Scanned')).toBeInTheDocument();
  expect(screen.getByText('Overdue')).toBeInTheDocument();
  expect(screen.getByText('Verified Today')).toBeInTheDocument();
});
```

## Additional Resources

- **Full Documentation:** `src/components/inventory/README.md`
- **Usage Examples:** `src/components/inventory/ScanStatsWidget.example.tsx`
- **Visual Structure:** `src/components/inventory/ScanStatsWidget.structure.md`
- **Implementation Summary:** `SCAN_STATS_WIDGET_IMPLEMENTATION.md`

## Support

For issues or questions:
1. Check the documentation files listed above
2. Review the example implementations
3. Verify store initialization
4. Check browser console for errors
