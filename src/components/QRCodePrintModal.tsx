import { useState, useMemo, useRef, useEffect } from 'react';
import type { Item } from '../types/item';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { logQRPrint } from '../services/activityLog';
import { useAuthStore } from '../store/useAuthStore';
import { getItemDetailUrl } from '../utils/qrcode';
import { displaySize } from '../services/ebay/import';

interface QRCodePrintModalProps {
  items: Item[];
  open: boolean;
  onClose: () => void;
}

const LABEL_PRESETS = [
  { id: 'tiny', label: '1" × 1"', widthIn: 1, heightIn: 1, qrSize: 80, columns: 6 },
  { id: 'small', label: '2" × 2"', widthIn: 2, heightIn: 2, qrSize: 130, columns: 4 },
  { id: 'medium', label: '3" × 3"', widthIn: 3, heightIn: 3, qrSize: 220, columns: 3 },
  { id: 'large', label: '4" × 4"', widthIn: 4, heightIn: 4, qrSize: 300, columns: 2 },
  // 6 per 4"×6" sheet (2 cols × 3 rows) — 2"×2" labels filling a shipping label sheet
  { id: 'label4x6', label: '6/sheet 4"×6"', widthIn: 2, heightIn: 2, qrSize: 90, columns: 2 },
];

// Extended Item type for QR labels with unit-specific barcodes
interface QRLabelItem extends Item {
  unitBarcode?: string; // For multi-quantity items
  unitNumber?: number; // Unit number (1, 2, 3, etc.)
}

// QR Code Label Component using canvas
const QRCodeLabel: React.FC<{ item: QRLabelItem; preset: typeof LABEL_PRESETS[0] }> = ({ item, preset }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const renderQRCode = async () => {
      try {
        // Use unit-specific barcode if available, otherwise use item barcode or URL
        const qrContent = item.unitBarcode || item.barcode || getItemDetailUrl(item.id);

        console.log('🔲 Generating QR for item:', item.name, '| Barcode:', qrContent, '| Unit:', item.unitNumber || 'N/A');

        await QRCode.toCanvas(canvasRef.current!, qrContent, {
          width: preset.qrSize,
          margin: 0,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
      } catch (error) {
        console.error('Failed to generate QR code for item:', item.name, error);
      }
    };

    renderQRCode();
  }, [item.id, item.name, item.barcode, item.unitBarcode, item.unitNumber, preset.qrSize]);

  const isCutout = preset.id === 'label4x6';

  if (isCutout) {
    return (
      <div
        style={{
          width: '2in',
          height: '2in',
          border: '1px dashed #aaa',
          display: 'flex',
          flexDirection: 'column',
          pageBreakInside: 'avoid',
          background: 'white',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* Branding bar across full top */}
        <div
          style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '2px',
            textAlign: 'center',
            color: '#000',
            fontSize: '9px',
            padding: '2px 0',
            width: '100%',
          }}
        >
          RETROTHRIFTCO
        </div>
        <div style={{ borderTop: '1px solid #000', margin: '0 0 2px 0', width: '100%' }} />

        {/* Content row: QR left, text right */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
          {/* Left: QR Code */}
          <div style={{ flexShrink: 0, padding: '4px' }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
          </div>

          {/* Right: Text */}
          <div style={{ flex: 1, padding: '4px 6px', minWidth: 0, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#000',
                lineHeight: '1.3',
                wordBreak: 'break-word',
                display: '-webkit-box',
                WebkitLineClamp: 5,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                marginBottom: '4px',
              } as React.CSSProperties}
            >
              {item.name || 'Untitled Item'}
            </div>
            {item.size && (
              <div style={{ fontSize: '8px', color: '#555', fontWeight: 700 }}>Size: {displaySize(item.size)}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: `${preset.widthIn}in`,
        height: `${preset.heightIn}in`,
        border: '1px solid #ddd',
        padding: preset.widthIn === 1 ? '2px' : '6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pageBreakInside: 'avoid',
        background: 'white',
        boxSizing: 'border-box'
      }}
    >
      {/* Store branding - shown on all presets except 1"×1" */}
      {preset.widthIn > 1 && (
        <>
          <div
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '2px',
              textAlign: 'center',
              color: '#000',
              fontSize: '9px',
              width: '100%',
            }}
          >
            RETROTHRIFTCO
          </div>
          <div style={{ borderTop: '1px solid #000', margin: '2px 0', width: '100%' }} />
        </>
      )}

      {/* Item Name - Top */}
      {preset.widthIn > 1 && (
        <div
          style={{
            fontSize: preset.widthIn === 2 ? '8px' : '10px',
            fontWeight: 600,
            textAlign: 'center',
            marginBottom: '2px',
            maxHeight: preset.widthIn === 2 ? '32px' : '36px',
            overflow: 'hidden',
            lineHeight: preset.widthIn === 2 ? '10px' : '12px',
            color: '#000',
            width: '100%',
            wordWrap: 'break-word',
            display: '-webkit-box',
            WebkitLineClamp: preset.widthIn === 2 ? 3 : 3,
            WebkitBoxOrient: 'vertical'
          } as React.CSSProperties}
        >
          {item.name || 'Untitled Item'}
        </div>
      )}

      {/* QR Code - Centered */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: preset.widthIn === 1 ? '1px 0' : '2px 0',
          flex: '0 0 auto'
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block'
          }}
        />
      </div>

      {/* Item Title - Under QR Code */}
      <div
        style={{
          fontSize: preset.widthIn === 1 ? '7px' : preset.widthIn === 2 ? '8px' : '10px',
          fontWeight: 700,
          textAlign: 'center',
          marginTop: preset.widthIn === 1 ? '1px' : '2px',
          maxHeight: preset.widthIn === 1 ? '14px' : '24px',
          overflow: 'hidden',
          lineHeight: preset.widthIn === 1 ? '7px' : '8px',
          color: '#000',
          width: '100%',
          wordWrap: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: preset.widthIn === 2 ? 3 : 2,
          WebkitBoxOrient: 'vertical'
        } as React.CSSProperties}
      >
        {item.name || 'Untitled'}
        {item.unitNumber && ` #${item.unitNumber}`}
      </div>

      {/* Item Details - Compact */}
      {preset.widthIn >= 2 && (
        <div
          style={{
            fontSize: '7px',
            color: '#666',
            textAlign: 'center',
            marginTop: '2px',
            width: '100%',
            lineHeight: '1.3'
          }}
        >
          {item.size && <div style={{ fontWeight: 700 }}>Size: {displaySize(item.size)}</div>}
          {item.hangerId && <div style={{ fontSize: '6px', color: '#999' }}>ID: {item.hangerId}</div>}
          {item.unitNumber && <div style={{ fontSize: '6px', color: '#999', fontWeight: 600 }}>Unit {item.unitNumber}</div>}
        </div>
      )}
    </div>
  );
};

export const QRCodePrintModal = ({ items, open, onClose }: QRCodePrintModalProps) => {
  const { user } = useAuthStore();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [preset, setPreset] = useState(LABEL_PRESETS[4]); // Default to 4x6 label
  const [isPrinting, setIsPrinting] = useState(false);
  const labelsRef = useRef<HTMLDivElement>(null);

  // Initialize quantities from inventory quantity when items change
  useEffect(() => {
    setQuantities(Object.fromEntries(items.map(i => [i.id, i.ebayQuantity ?? 1])));
  }, [items]);

  const setQty = (id: string, val: number) => {
    setQuantities(prev => ({ ...prev, [id]: Math.max(1, Math.min(99, val)) }));
  };

  // Expand items by their quantity for preview and printing
  const expandedItems = useMemo(() => {
    const result: QRLabelItem[] = [];
    for (const item of items) {
      const qty = quantities[item.id] ?? 1;
      for (let u = 1; u <= qty; u++) {
        result.push({ ...item, unitNumber: qty > 1 ? u : undefined });
      }
    }
    return result;
  }, [items, quantities]);

  const totalLabels = expandedItems.length;

  // Keep these for compat with handlePrint
  const selectedIds = useMemo(() => new Set(items.map(i => i.id)), [items]);
  const selectedItems = expandedItems;

  const handlePrint = async () => {
    if (selectedItems.length === 0) {
      toast.error('No items selected');
      return;
    }

    try {
      setIsPrinting(true);

      // Generate QR codes as data URLs directly — no canvas timing issues
      const isCutout = preset.id === 'label4x6';
      const labelHtmlParts = await Promise.all(selectedItems.map(async (item) => {
        const qrContent = item.unitBarcode || item.barcode || getItemDetailUrl(item.id);
        const qrDataUrl = await QRCode.toDataURL(qrContent, {
          width: preset.qrSize,
          margin: 0,
          color: { dark: '#000000', light: '#FFFFFF' }
        });

        if (isCutout) {
          return `<div style="width:2in;height:2in;border:1px dashed #aaa;display:flex;flex-direction:column;page-break-inside:avoid;background:white;box-sizing:border-box;overflow:hidden;">
            <div style="font-family:monospace;font-weight:700;letter-spacing:2px;text-align:center;color:#000;font-size:9px;padding:2px 0;width:100%;">RETROTHRIFTCO</div>
            <div style="border-top:1px solid #000;margin:0 0 2px 0;width:100%;"></div>
            <div style="display:flex;flex-direction:row;align-items:center;flex:1;overflow:hidden;">
              <img src="${qrDataUrl}" style="display:block;width:${preset.qrSize}px;height:${preset.qrSize}px;flex-shrink:0;padding:4px;" />
              <div style="flex:1;padding:4px 6px;min-width:0;overflow:hidden;">
                <div style="font-size:9px;font-weight:700;color:#000;line-height:1.3;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;margin-bottom:4px;">${item.name || 'Untitled Item'}</div>
                ${item.size ? `<div style="font-size:8px;color:#555;font-weight:700;">Size: ${displaySize(item.size)}</div>` : ''}
              </div>
            </div>
          </div>`;
        } else {
          return `<div style="width:${preset.widthIn}in;height:${preset.heightIn}in;border:1px solid #ddd;padding:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;page-break-inside:avoid;background:white;box-sizing:border-box;">
            <div style="font-family:monospace;font-weight:700;letter-spacing:2px;text-align:center;color:#000;font-size:9px;width:100%;">RETROTHRIFTCO</div>
            <div style="border-top:1px solid #000;margin:2px 0;width:100%;"></div>
            <div style="font-size:9px;font-weight:600;text-align:center;color:#000;margin-bottom:2px;overflow:hidden;max-height:30px;">${item.name || 'Untitled Item'}</div>
            <img src="${qrDataUrl}" style="display:block;width:${preset.qrSize}px;height:${preset.qrSize}px;" />
            ${item.size ? `<div style="font-size:8px;color:#666;text-align:center;margin-top:2px;font-weight:700;">Size: ${displaySize(item.size)}</div>` : ''}
          </div>`;
        }
      }));

      const pageSize = isCutout ? '4in 6in' : 'letter portrait';
      // Chunk into explicit page divs — most reliable for cross-browser print pagination
      const labelsPerPage = isCutout ? 6 : preset.columns * Math.floor(11 / preset.heightIn);
      const pages: string[] = [];
      for (let i = 0; i < labelHtmlParts.length; i += labelsPerPage) {
        const chunk = labelHtmlParts.slice(i, i + labelsPerPage);
        const isLast = i + labelsPerPage >= labelHtmlParts.length;
        pages.push(
          `<div style="width:${isCutout ? '4in' : '8.5in'};display:flex;flex-wrap:wrap;page-break-after:${isLast ? 'auto' : 'always'};break-after:${isLast ? 'auto' : 'page'};">${chunk.join('')}</div>`
        );
      }
      const gridHtml = pages.join('');

      const htmlContent = `<!DOCTYPE html><html><head><title>Print QR Labels</title>
        <style>
          @page { size: ${pageSize}; margin: 0; }
          body { margin: 0; font-family: Arial, sans-serif; background: white; }
          .no-print { background:#1a1a2e;color:white;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;font-family:Arial;font-size:14px; }
          @media print { .no-print { display: none !important; } body { margin: 0; } }
        </style>
      </head><body>
        <div class="no-print">
          <span>Review your labels, then click Print when ready.</span>
          <button onclick="window.print()" style="background:#7c3aed;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700;">Print Now</button>
        </div>
        ${gridHtml}
      </body></html>`;

      // Use blob URL so inline images (data:) load correctly in the popup
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const printWindow = window.open(blobUrl, '_blank', 'width=900,height=700');
      if (!printWindow) throw new Error('Unable to open print window. Please allow popups.');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      printWindow.focus();

      // Log the print event
      if (user) {
        await logQRPrint(
          user.id,
          selectedItems.map(item => item.id),
          preset.label
        );
      }

      toast.success(`Sent ${selectedItems.length} QR code label(s) to printer`);
      onClose();
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print QR codes');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Print QR Code Labels"
      size="xl"
    >
      <div className="space-y-4">
        {/* Label Size Presets */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Label Size</label>
          <div className="flex flex-wrap gap-2">
            {LABEL_PRESETS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPreset(option)}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  preset.id === option.id
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border-gray-600 text-gray-300 hover:border-gray-500'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Items + Quantity */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">
              Items &amp; Quantities
            </label>
            <span className="text-xs text-gray-400">{totalLabels} label{totalLabels !== 1 ? 's' : ''} total</span>
          </div>

          <div className="max-h-56 overflow-y-auto border border-gray-700 rounded-lg divide-y divide-gray-700/50">
            {items.map(item => {
              const qty = quantities[item.id] ?? 1;
              return (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-800/40">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt="" className="w-9 h-9 object-cover rounded flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{item.name || 'Untitled'}</div>
                    {item.size && <div className="text-xs text-gray-400">Size: {displaySize(item.size)}</div>}
                  </div>
                  {/* Quantity stepper */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setQty(item.id, qty - 1)}
                      className="w-7 h-7 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-base font-bold flex items-center justify-center transition-colors"
                    >−</button>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={qty}
                      aria-label={`Quantity for ${item.name || 'item'}`}
                      onChange={e => setQty(item.id, parseInt(e.target.value) || 1)}
                      className="w-10 text-center text-sm bg-gray-900 border border-gray-600 rounded-md text-white py-1 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => setQty(item.id, qty + 1)}
                      className="w-7 h-7 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-base font-bold flex items-center justify-center transition-colors"
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Preview - Hidden div that will be copied for printing */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">
              Preview ({selectedItems.length} items)
              {selectedItems.length > 0 && (
                <span className="text-xs text-gray-400 ml-2">
                  Scan to view item details
                </span>
              )}
            </label>
          </div>
          <div className="max-h-48 overflow-y-auto border border-gray-700 rounded-lg">
            <div ref={labelsRef} className="bg-white rounded-lg p-4">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${preset.columns}, 1fr)`,
                  gap: '4px',
                  width: '100%',
                  alignItems: 'start'
                }}
              >
                {selectedItems.map((item, idx) => (
                  <QRCodeLabel key={`${item.id}-${idx}`} item={item} preset={preset} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
          <Button variant="secondary" onClick={onClose} disabled={isPrinting}>
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={isPrinting || selectedIds.size === 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isPrinting ? 'Printing…' : `Print ${selectedIds.size} QR Code${selectedIds.size !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
