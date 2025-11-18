import { useMemo, useRef, useState } from 'react';
import type { Item } from '../types/item';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { buildCode128Segments } from '../utils/code128';
import { logBarcodePrintEvent } from '../services/barcodes';
import { toast } from 'sonner';

interface LabelPrintModalProps {
  item: Item | null;
  open: boolean;
  onClose: () => void;
  userId?: string;
}

const LABEL_PRESETS = [
  { id: 'small', label: '1" × 2"', widthIn: 2, heightIn: 1 },
  { id: 'medium', label: '2" × 3"', widthIn: 3, heightIn: 2 },
];

const PX_PER_INCH = 96;

export const LabelPrintModal = ({ item, open, onClose, userId }: LabelPrintModalProps) => {
  const [preset, setPreset] = useState(LABEL_PRESETS[0]);
  const [isPrinting, setIsPrinting] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(() => {
    if (!item?.barcode) return [];
    try {
      return buildCode128Segments(item.barcode);
    } catch (error) {
      console.error('Barcode render error', error);
      return [];
    }
  }, [item?.barcode]);

  const previewWidth = preset.widthIn * PX_PER_INCH;
  const previewHeight = preset.heightIn * PX_PER_INCH;
  const totalUnits = segments.reduce((sum, segment) => sum + segment.width, 0);
  const moduleWidth = totalUnits ? previewWidth / totalUnits : 2;

  const handlePrint = async () => {
    if (!labelRef.current || !item?.barcode) return;

    try {
      setIsPrinting(true);
      const content = labelRef.current.innerHTML;
      const printWindow = window.open('', 'PRINT', 'width=600,height=400');
      if (!printWindow) throw new Error('Unable to open print window');

      printWindow.document.write(`<!DOCTYPE html><html><head><title>Print Label</title>
        <style>
          body { margin: 0; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; }
          .label-wrapper { padding: 16px; }
        </style>
      </head><body><div class="label-wrapper">${content}</div></body></html>`);
      printWindow.document.close();
      printWindow.focus();
      await new Promise((resolve) => setTimeout(resolve, 250));
      printWindow.print();
      printWindow.close();

      if (userId) {
        await logBarcodePrintEvent(item.id, userId, { preset: preset.id });
      }

      toast.success('Label sent to printer');
      onClose();
    } catch (error) {
      console.error('Print error', error);
      toast.error('Failed to print label');
    } finally {
      setIsPrinting(false);
    }
  };

  if (!item) return null;

  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title="Print Barcode Label" size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {LABEL_PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPreset(option)}
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                preset.id === option.id ? 'border-purple-500 bg-purple-500/10' : 'border-gray-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div ref={labelRef} className="rounded-lg border border-gray-600 bg-white p-4 text-black">
          <div className="flex justify-between text-xs font-semibold">
            <span>{item.name}</span>
            <span>
              Size {item.size || '—'} • Hanger {item.hangerId || '—'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-center bg-white p-2">
            {item.barcode && segments.length > 0 ? (
              <svg width={previewWidth} height={previewHeight} viewBox={`0 0 ${previewWidth} ${previewHeight}`}>
                {segments.reduce<{ x: number; elements: JSX.Element[] }>((acc, segment, index) => {
                  if (segment.isBar) {
                    acc.elements.push(
                      <rect
                        key={`bar-${index}`}
                        x={acc.x}
                        y={0}
                        width={segment.width * moduleWidth}
                        height={previewHeight}
                        fill="#000"
                      />
                    );
                  }
                  acc.x += segment.width * moduleWidth;
                  return acc;
                }, { x: 0, elements: [] }).elements}
              </svg>
            ) : (
              <p className="text-sm text-gray-500">Unable to render barcode</p>
            )}
          </div>
          <div className="mt-2 text-center text-sm font-mono">{item.barcode || 'Barcode pending'}</div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPrinting}>
            Close
          </Button>
          <Button onClick={handlePrint} disabled={isPrinting || !item.barcode}>
            {isPrinting ? 'Printing…' : 'Print Label'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
