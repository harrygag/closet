# ScanStatsWidget Visual Structure

## Component Hierarchy

```
<div className="space-y-4">
  │
  ├─ <Card> (Progress Section)
  │   ├─ <CardHeader>
  │   │   └─ <CardTitle>Daily Scan Progress</CardTitle>
  │   │
  │   └─ <CardContent>
  │       ├─ Progress Text: "45 / 120 items scanned today" (37.5%)
  │       └─ Progress Bar (linear, gradient blue)
  │
  └─ <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      │
      ├─ <Card> (Never Scanned - Yellow)
      │   ├─ <CardHeader>
      │   │   ├─ Title: "Never Scanned"
      │   │   └─ Icon: <AlertTriangle /> (yellow)
      │   │
      │   └─ <CardContent>
      │       ├─ Value: Large number
      │       └─ Description: "Items with no scan history"
      │
      ├─ <Card> (Overdue - Red)
      │   ├─ <CardHeader>
      │   │   ├─ Title: "Overdue"
      │   │   └─ Icon: <Clock /> (red)
      │   │
      │   └─ <CardContent>
      │       ├─ Value: Large number
      │       └─ Description: "Not scanned in 7+ days"
      │
      └─ <Card> (Verified Today - Green)
          ├─ <CardHeader>
          │   ├─ Title: "Verified Today"
          │   └─ Icon: <CheckCircle2 /> (green)
          │
          └─ <CardContent>
              ├─ Value: Large number
              └─ Description: "Scanned within 24 hours"
```

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Daily Scan Progress                                             │
│                                                                 │
│ 45 / 120 items scanned today                          37.5%    │
│ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           │
│   (Progress bar: blue gradient on gray track)                  │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│ Never Scanned      ⚠│ │ Overdue            🕐│ │ Verified Today     ✓│
│                      │ │                      │ │                      │
│        23            │ │        15            │ │        12            │
│ Items with no scan   │ │ Not scanned in 7+    │ │ Scanned within 24    │
│ history              │ │ days                 │ │ hours                │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
   (Yellow badge)          (Red badge)              (Green badge)
```

## Responsive Breakpoints

### Desktop (lg: 1024px+)
```
[Progress Bar - Full Width]

[Never Scanned] [Overdue] [Verified Today]
```

### Tablet (sm: 640px - 1023px)
```
[Progress Bar - Full Width]

[Never Scanned] [Overdue]
[Verified Today]
```

### Mobile (< 640px)
```
[Progress Bar - Full Width]

[Never Scanned]
[Overdue]
[Verified Today]
```

## Color Scheme

### Progress Section
- Background: `#1F2937` (gray-800)
- Border: `#374151` (gray-700)
- Text: `#FFFFFF` (white)
- Progress Track: `#374151` (gray-700)
- Progress Fill: `#3B82F6` → `#2563EB` (blue gradient)
- Percentage: `#60A5FA` (blue-400)

### Stats Cards
- Background: `#1F293750` (gray-800/50)
- Border: `#374151` (gray-700)
- Hover Border: Dynamic per card type

#### Never Scanned (Yellow)
- Badge Background: `#EAB30820` (yellow-500/20)
- Badge Text: `#FACC15` (yellow-400)
- Icon: `#FACC15` (yellow-400)
- Hover Border: `#EAB308` (yellow-500)

#### Overdue (Red)
- Badge Background: `#EF444420` (red-500/20)
- Badge Text: `#F87171` (red-400)
- Icon: `#F87171` (red-400)
- Hover Border: `#EF4444` (red-500)

#### Verified Today (Green)
- Badge Background: `#22C55E20` (green-500/20)
- Badge Text: `#4ADE80` (green-400)
- Icon: `#4ADE80` (green-400)
- Hover Border: `#22C55E` (green-500)

## Interactive States

### Default (No Filter Callback)
- Cards are not clickable
- No hover effects
- Static display

### With Filter Callback
- Cards show `cursor-pointer`
- Hover effects:
  - Border color changes to card theme color
  - Smooth transition
- Click triggers `onFilterClick(filterType)`

## Data Flow Diagram

```
useInventoryScanStore
│
├─ getTodayScanCount() ──────────┐
├─ getScanProgress(goal) ────────┤
├─ getItemsNeedingScan(items, 7) ┤
├─ getNeverScannedItems(items) ──┤
└─ dailyScanGoal ────────────────┤
                                 │
                                 ├──> ScanStatsWidget
                                 │
useItemStore                     │
│                                │
└─ items[] ──────────────────────┘

User Interaction
│
└─ onClick(card) ──> onFilterClick(filterType) ──> Parent Component
                                                      │
                                                      └──> setFilterConfig()
                                                            │
                                                            └──> Spreadsheet Updates
```

## Component Props

```typescript
interface ScanStatsWidgetProps {
  onFilterClick?: (
    filterType: 'never-scanned' | 'overdue' | 'verified-today'
  ) => void;
}
```

## Calculations Reference

### Progress Percentage
```typescript
progress.percent = (scannedToday / dailyScanGoal) * 100
// Example: (45 / 120) * 100 = 37.5%
```

### Never Scanned
```typescript
neverScannedItems = items.filter(item => !item.lastScannedDate)
```

### Overdue (7+ days)
```typescript
overdueItems = items.filter(item => {
  if (!item.lastScannedDate) return true;
  const daysSince = (now - lastScan) / (1000 * 60 * 60 * 24);
  return daysSince > 7;
})
```

### Verified Today (< 24 hours)
```typescript
const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
verifiedTodayItems = items.filter(item => {
  if (!item.lastScannedDate) return false;
  const lastScan = new Date(item.lastScannedDate);
  return lastScan >= oneDayAgo;
})
```
