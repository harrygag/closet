import { useMemo, useState } from 'react';
import type { Item } from '../types/item';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { buildCode128Segments } from '../utils/code128';
import { toast } from 'sonner';
import { Printer, Check, Loader2 } from 'lucide-react';

interface BatchPrintModalProps {
  items: Item[];
  open: boolean;
  onClose: () => void;
}

const LABEL_PRESETS = [
  { id: 'small', label: '1" x 2"', widthIn: 2, heightIn: 1, cols: 4 },
  { id: 'medium', label: '2" x 3"', widthIn: 3, heightIn: 2, cols: 3 },
  { id: 'large', label: '4" x 3"', widthIn: 4, heightIn: 3, cols: 2 },
];

const PX_PER_INCH = 96;

export const BatchPrintModal = ({ items, open, onClose }: BatchPrintModalProps) => {
  const [preset, setPreset] = useState(LABEL_PRESETS[0]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(items.map(i => i.id)));

  // Filter items with valid barcodes
  const itemsWithBarcodes = useMemo(() => {
    return items.filter(item => item.barcode && item.barcode.length > 0);
  }, [items]);

  const selectedItems = useMemo(() => {
    return itemsWithBarcodes.filter(item => selectedIds.has(item.id));
  }, [itemsWithBarcodes, selectedIds]);

  const previewWidth = preset.widthIn * PX_PER_INCH;
  const previewHeight = preset.heightIn * PX_PER_INCH;

  const toggleItem = (itemId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedIds(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === itemsWithBarcodes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(itemsWithBarcodes.map(i => i.id)));
    }
  };

  const handlePrint = async () => {
    if (selectedItems.length === 0) {
      toast.error('No items selected');
      return;
    }

    try {
      setIsPrinting(true);

      const printWindow = window.open('', 'PRINT', 'width=800,height=600');
      if (!printWindow) throw new Error('Unable to open print window');

      // Generate HTML for all labels
      const labelsHtml = selectedItems.map(item => {
        const segments = item.barcode ? buildCode128Segments(item.barcode) : [];
        const totalUnits = segments.reduce((sum, segment) => sum + segment.width, 0);
        const moduleWidth = totalUnits ? previewWidth / totalUnits : 2;

        const barsSvg = segments.map((segment, index) => {
          if (segment.isBar) {
            return `<rect x="${segments.slice(0, index).reduce((sum, s) => sum + s.width * moduleWidth, 0)}" y="0" width="${segment.width * moduleWidth}" height="${previewHeight}" fill="#000"/>`;
          }
          return '';
        }).join('');

        return `
          <div class="label" style="width: ${preset.widthIn}in; height: ${preset.heightIn}in; page-break-inside: avoid; border: 1px solid #ddd; padding: 8px; box-sizing: border-box; background: white;">
            <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 600;">
              <span style="max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</span>
              <span>Size ${item.size || '-'}</span>
            </div>
            <div style="margin-top: 4px; display: flex; justify-content: center;">
              <svg width="${previewWidth}" height="${previewHeight * 0.6}" viewBox="0 0 ${previewWidth} ${previewHeight}">
                ${barsSvg}
              </svg>
            </div>
            <div style="text-align: center; font-size: 11px; font-family: monospace;">${item.barcode}</div>
          </div>
        `;
      }).join('');

      printWindow.document.write(`<!DOCTYPE html>
        <html>
        <head>
          <title>Print All Barcodes</title>
          <style>
            @page { margin: 0.25in; }
            body { margin: 0; font-family: 'Segoe UI', sans-serif; }
            .grid {
              display: grid;
              grid-template-columns: repeat(${preset.cols}, 1fr);
              gap: 4px;
            }
            .label { margin: 2px; }
            @media print {
              .label { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="grid">${labelsHtml}</div>
        </body>
        </html>`);

      printWindow.document.close();
      printWindow.focus();
      await new Promise((resolve) => setTimeout(resolve, 500));
      printWindow.print();
      printWindow.close();

      toast.success(`Printed ${selectedItems.length} barcode labels`);
      onClose();
    } catch (error) {
      console.error('Print error', error);
      toast.error('Failed to print labels');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title="Print All Barcodes" size="xl">
      <div className="space-y-4">
        {/* Label Size Selection */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-400 mr-2">Label Size:</span>
          {LABEL_PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPreset(option)}
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                preset.id === option.id ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-gray-600 text-gray-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Selection Controls */}
        <div className="flex items-center justify-between rounded-lg bg-gray-800/50 p-3">
          <div>
            <p className="text-sm text-gray-400">
              {itemsWithBarcodes.length} items with barcodes
            </p>
            <p className="text-xs text-gray-500">
              {selectedIds.size} selected for printing
            </p>
          </div>
          <Button onClick={toggleAll} variant="secondary" size="sm">
            {selectedIds.size === itemsWithBarcodes.length ? 'Deselect All' : 'Select All'}
          </Button>
        </div>

        {/* Items List */}
        <div className="max-h-[400px] space-y-1 overflow-y-auto pr-2">
          {itemsWithBarcodes.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No items with barcodes found</p>
          ) : (
            itemsWithBarcodes.map((item) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                  }`}
                >
                  <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                    isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-600'
                  }`}>
                    {isSelected && <Check className="h-4 w-4 text-white" />}
                  </div>

                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-gray-700">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-500 text-xs">
                        No img
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.barcode}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-purple-400">${item.sellingPrice?.toFixed(2) || '0.00'}</p>
                    <p className="text-xs text-gray-500">Size {item.size || '-'}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 border-t border-gray-700 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={isPrinting}>
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={isPrinting || selectedIds.size === 0}>
            {isPrinting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Printing...
              </>
            ) : (
              <>
                <Printer className="mr-2 h-4 w-4" />
                Print {selectedIds.size} Labels
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
