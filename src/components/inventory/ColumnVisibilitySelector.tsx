import { useEffect, useState } from 'react';
import { ChevronDown, CheckSquare, Square } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useInventoryScanStore } from '../../store/useInventoryScanStore';
import { clsx } from 'clsx';

interface ColumnVisibility {
  name: boolean;
  size: boolean;
  status: boolean;
  tags: boolean;
  price: boolean;
  costPrice: boolean;
  ebaySku: boolean;
  lastScanned: boolean;
  location: boolean;
  notes: boolean;
  barcode: boolean;
}

const COLUMN_LABELS: Record<keyof ColumnVisibility, string> = {
  name: 'Name',
  size: 'Size',
  status: 'Status',
  tags: 'Tags',
  price: 'Price',
  costPrice: 'Cost',
  ebaySku: 'eBay SKU',
  lastScanned: 'Last Scanned',
  location: 'Location',
  notes: 'Notes',
  barcode: 'Barcode',
};

const PRESETS: Record<string, { label: string; columns: ColumnVisibility }> = {
  essentials: {
    label: 'Essentials',
    columns: {
      name: true,
      price: true,
      lastScanned: true,
      location: true,
      size: false,
      status: false,
      tags: false,
      costPrice: false,
      ebaySku: false,
      notes: false,
      barcode: false,
    },
  },
  full: {
    label: 'Full',
    columns: {
      name: true,
      size: true,
      status: true,
      tags: true,
      price: true,
      costPrice: true,
      ebaySku: true,
      lastScanned: true,
      location: true,
      notes: true,
      barcode: true,
    },
  },
  scanningMode: {
    label: 'Scanning Mode',
    columns: {
      name: true,
      barcode: true,
      lastScanned: true,
      location: true,
      size: false,
      status: false,
      tags: false,
      price: false,
      costPrice: false,
      ebaySku: false,
      notes: false,
    },
  },
};

const STORAGE_KEY = 'inventoryColumnVisibility';

export const ColumnVisibilitySelector: React.FC = () => {
  const { columnVisibility, setColumnVisibility } = useInventoryScanStore();
  const [open, setOpen] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ColumnVisibility;
        setColumnVisibility(parsed);
      } catch (error) {
        console.error('Failed to load column visibility from localStorage:', error);
      }
    }
  }, [setColumnVisibility]);

  // Save to localStorage whenever visibility changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  const handleToggleColumn = (column: keyof ColumnVisibility) => {
    setColumnVisibility({
      ...columnVisibility,
      [column]: !columnVisibility[column],
    });
  };

  const handleApplyPreset = (preset: keyof typeof PRESETS) => {
    setColumnVisibility(PRESETS[preset].columns);
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          className={clsx(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-gray-800 text-white border border-gray-700',
            'hover:bg-gray-750 hover:border-gray-600 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900'
          )}
        >
          <span className="text-sm font-medium">Columns</span>
          <ChevronDown
            className={clsx(
              'h-4 w-4 transition-transform duration-200',
              open && 'transform rotate-180'
            )}
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={clsx(
            'min-w-[240px] bg-gray-900 rounded-lg border border-gray-700 shadow-xl',
            'p-2 z-50',
            'animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2'
          )}
          sideOffset={8}
          align="end"
        >
          {/* Presets Section */}
          <div className="px-2 py-1.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Presets
            </p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => handleApplyPreset(key as keyof typeof PRESETS)}
                  className={clsx(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    'bg-purple-600/20 text-purple-300 border border-purple-600/30',
                    'hover:bg-purple-600/30 hover:border-purple-600/50',
                    'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <DropdownMenu.Separator className="h-px bg-gray-700 my-2" />

          {/* Column Toggles Section */}
          <div className="px-2 py-1.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Columns
            </p>
            <div className="space-y-1">
              {(Object.keys(COLUMN_LABELS) as Array<keyof ColumnVisibility>).map((column) => (
                <DropdownMenu.Item
                  key={column}
                  className={clsx(
                    'flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer',
                    'text-sm text-gray-300',
                    'hover:bg-gray-800 focus:bg-gray-800 outline-none',
                    'transition-colors'
                  )}
                  onSelect={(e) => {
                    e.preventDefault();
                    handleToggleColumn(column);
                  }}
                >
                  {columnVisibility[column] ? (
                    <CheckSquare className="h-4 w-4 text-purple-400 flex-shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  )}
                  <span className="flex-1">{COLUMN_LABELS[column]}</span>
                </DropdownMenu.Item>
              ))}
            </div>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
