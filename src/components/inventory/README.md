# ScanStatsWidget Component

Display daily scan progress with visual indicators and clickable stat cards for filtering inventory.

## Features

- Daily scan progress display with percentage
- Visual linear progress bar
- Three stat cards:
  - **Never Scanned** (yellow) - Items with no `lastScannedDate`
  - **Overdue** (red) - Items not scanned in 7+ days
  - **Verified Today** (green) - Items scanned within 24 hours
- Clickable cards for filtering the spreadsheet
- Responsive design (stacks on mobile)
- Dark theme with hover effects

## Usage

### Basic Usage (Display Only)

```tsx
import { ScanStatsWidget } from '@/components/inventory';

function InventoryPage() {
  return (
    <div>
      <ScanStatsWidget />
    </div>
  );
}
```

### With Filter Integration

```tsx
import { ScanStatsWidget } from '@/components/inventory';
import { useInventoryScanStore } from '@/store/useInventoryScanStore';

function InventoryPage() {
  const { setFilterConfig } = useInventoryScanStore();

  const handleFilterClick = (filterType: 'never-scanned' | 'overdue' | 'verified-today') => {
    switch (filterType) {
      case 'never-scanned':
        setFilterConfig({ verificationStatus: ['needs-verification'], lastScanned: 'never' });
        break;
      case 'overdue':
        setFilterConfig({ verificationStatus: ['overdue'], lastScanned: '7d' });
        break;
      case 'verified-today':
        setFilterConfig({ verificationStatus: ['verified'], lastScanned: '1d' });
        break;
    }
  };

  return (
    <div>
      <ScanStatsWidget onFilterClick={handleFilterClick} />
      {/* Your inventory spreadsheet component here */}
    </div>
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `onFilterClick` | `(filterType: 'never-scanned' \| 'overdue' \| 'verified-today') => void` | No | Callback when a stat card is clicked |

## Dependencies

- `useInventoryScanStore` - For scan tracking and progress
- `useItemStore` - For item data
- `Card`, `CardContent`, `CardHeader`, `CardTitle` - UI components
- `lucide-react` - Icons (CheckCircle2, AlertTriangle, Clock)

## Design Tokens

### Colors
- Background: `bg-gray-800`, `bg-gray-800/50`
- Text: `text-white`, `text-gray-400`, `text-gray-500`
- Progress bar: `bg-gray-700` (track), `bg-blue-500` to `bg-blue-600` (fill)
- Badges:
  - Green: `bg-green-500/20`, `text-green-400`
  - Red: `bg-red-500/20`, `text-red-400`
  - Yellow: `bg-yellow-500/20`, `text-yellow-400`

### Layout
- Progress section: Full width card with progress bar
- Stats grid: 3 columns on desktop (lg:grid-cols-3), 2 on tablet (sm:grid-cols-2), 1 on mobile

## Data Flow

```
useInventoryScanStore
├── getTodayScanCount() → scannedToday
├── getScanProgress(dailyScanGoal) → progress { scanned, total, percent }
├── getItemsNeedingScan(items, 7) → overdueItems[]
├── getNeverScannedItems(items) → neverScannedItems[]
└── dailyScanGoal → goal number

useItemStore
└── items[] → all items for filtering
```

## Integration Notes

1. The widget uses the `dailyScanGoal` from the store (default: 120)
2. Progress is calculated as: `scannedToday / dailyScanGoal * 100`
3. "Verified Today" counts items scanned within the last 24 hours
4. "Overdue" uses a 7-day threshold (configurable in `getItemsNeedingScan`)
5. Cards only show hover effects and cursor when `onFilterClick` is provided
