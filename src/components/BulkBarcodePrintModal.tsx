import { useMemo, useState } from 'react';
import type { Item } from '../types/item';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { buildCode128Segments } from '../utils/code128';
import { toast } from 'sonner';

interface BulkBarcodePrintModalProps {
  items: Item[];
  open: boolean;
  onClose: () => void;
}

const LABEL_PRESETS = [
  { id: 'small', label: '1" × 2"', widthIn: 2, heightIn: 1, perPage: 30 },
  { id: 'medium', label: '2" × 3"', widthIn: 3, heightIn: 2, perPage: 12 },
];

const PX_PER_INCH = 96;

export const BulkBarcodePrintModal = ({ items, open, onClose }: BulkBarcodePrintModalProps) => {
  const [preset, setPreset] = useState(LABEL_PRESETS[0]);
  const [isPrinting, setIsPrinting] = useState(false);

  const itemsWithBarcodes = useMemo(() => {
    return items.filter((item) => !!item.barcode);
  }, [items]);

  const handlePrintAll = async () => {
    if (itemsWithBarcodes.length === 0) {
      toast.error('No items with barcodes to print');
      return;
    }

    try {
      setIsPrinting(true);

      const printWindow = window.open('', 'PRINT', 'width=800,height=600');
      if (!printWindow) throw new Error('Unable to open print window');

      const previewWidth = preset.widthIn * PX_PER_INCH;
      const previewHeight = preset.heightIn * PX_PER_INCH;

      // Generate all labels HTML
      const labelsHTML = itemsWithBarcodes
        .map((item) => {
          try {
            const segments = buildCode128Segments(item.barcode!);
            const totalUnits = segments.reduce((sum, segment) => sum + segment.width, 0);
            const moduleWidth = totalUnits ? previewWidth / totalUnits : 2;

            const barsHTML = segments
              .map((segment, index) => {
                if (!segment.isBar) return '';
                const x = segments
                  .slice(0, index)
                  .reduce((sum, s) => sum + s.width * moduleWidth, 0);
                return `<rect x="${x}" y="0" width="${segment.width * moduleWidth}" height="${previewHeight}" fill="#000"/>`;
              })
              .join('');

            return `
              <div class="label-page" style="
                width: ${previewWidth}px;
                height: ${previewHeight}px;
                padding: 8px;
                border: 1px solid #ddd;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                page-break-inside: avoid;
                break-inside: avoid;
                margin: 4px;
                background: white;
              ">
                <div style="font-size: 10px; font-weight: 600; margin-bottom: 4px; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${item.name || 'Untitled'}
                </div>
                <svg width="${previewWidth - 16}" height="${previewHeight - 40}" viewBox="0 0 ${previewWidth - 16} ${previewHeight - 40}" style="margin-bottom: 4px;">
                  ${barsHTML}
                </svg>
                <div style="font-size: 9px; font-family: monospace; text-align: center;">
                  ${item.barcode}
                </div>
              </div>
            `;
          } catch (error) {
            console.error(`Failed to generate barcode for item ${item.id}:`, error);
            return '';
          }
        })
        .join('');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print Barcodes - ${itemsWithBarcodes.length} Labels</title>
          <style>
            @page {
              size: letter;
              margin: 0.5in;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
              background: #f5f5f5;
            }
            .container {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              padding: 16px;
              justify-content: flex-start;
            }
            @media print {
              body {
                background: white;
              }
              .container {
                padding: 0;
                gap: 0;
              }
              .label-page {
                border: none !important;
                margin: 0 !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${labelsHTML}
          </div>
        </body>
        </html>
      `);

      printWindow.document.close();
      printWindow.focus();

      // Wait for content to load then print
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
        toast.success(`Generated ${itemsWithBarcodes.length} barcode labels`);
        onClose();
      }, 500);
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print labels');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onClose} title="Print All Barcodes">
      <div className="space-y-4">
        <div className="text-sm text-gray-400">
          Print barcode labels for {itemsWithBarcodes.length} items with barcodes
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Label Size
          </label>
          <div className="flex gap-2">
            {LABEL_PRESETS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPreset(option)}
                className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                  preset.id === option.id
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Approximately {preset.perPage} labels per page
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total Items</span>
            <span className="font-medium">{items.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">With Barcodes</span>
            <span className="font-medium text-green-400">{itemsWithBarcodes.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Missing Barcodes</span>
            <span className="font-medium text-yellow-400">
              {items.length - itemsWithBarcodes.length}
            </span>
          </div>
        </div>

        {items.length - itemsWithBarcodes.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-400">
            ⚠️ {items.length - itemsWithBarcodes.length} items don&apos;t have barcodes and will be
            skipped
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4">
          <Button variant="secondary" onClick={onClose} disabled={isPrinting}>
            Cancel
          </Button>
          <Button
            onClick={handlePrintAll}
            disabled={isPrinting || itemsWithBarcodes.length === 0}
            loading={isPrinting}
          >
            Print {itemsWithBarcodes.length} Labels
          </Button>
        </div>
      </div>
    </Modal>
  );
};

