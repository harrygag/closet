import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

interface BarcodeImageProps {
  value: string;
  width?: number;
  height?: number;
  className?: string;
  useQR?: boolean; // QR codes are easier to scan from screens
}

export const BarcodeImage: React.FC<BarcodeImageProps> = ({
  value,
  width = 100,
  height = 100,
  className = '',
  useQR = true, // Default to QR for better screen scanning
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    const renderCode = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        if (useQR) {
          // Use dedicated QR code library - much more reliable
          await QRCode.toCanvas(canvas, value, {
            width: 80,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
        } else {
          // Code 128 - for printed labels
          bwipjs.toCanvas(canvas, {
            bcid: 'code128',
            text: value,
            scale: 3,
            height: 12,
            includetext: true,
            textxalign: 'center',
            textsize: 10,
            textfont: 'monospace',
            backgroundcolor: 'ffffff',
            barcolor: '000000',
          });
        }
      } catch (err) {
        console.error('Failed to generate code:', err);
      }
    };

    renderCode();
  }, [value, useQR]);

  if (!value) {
    return (
      <div className={`flex items-center justify-center bg-gray-800 rounded ${className}`}
           style={{ width, height }}>
        <span className="text-xs text-gray-500">No barcode</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`bg-white rounded p-1 ${className}`}
      style={{ maxWidth: width, height: 'auto' }}
    />
  );
};

// Print-friendly barcode label component
export const PrintableBarcode: React.FC<{
  value: string;
  itemName: string;
  size?: string;
}> = ({ value, itemName, size }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: 'code128',
        text: value,
        scale: 3,
        height: 12,
        includetext: true,
        textxalign: 'center',
        textsize: 10,
        textfont: 'monospace',
      });
    } catch (err) {
      console.error('Failed to generate barcode:', err);
    }
  }, [value]);

  return (
    <div className="print-label bg-white p-3 rounded-lg" style={{ width: '2in', pageBreakInside: 'avoid' }}>
      <div className="text-xs font-bold text-black truncate mb-1">{itemName}</div>
      {size && <div className="text-xs text-gray-600 mb-1">Size: {size}</div>}
      <canvas ref={canvasRef} className="mx-auto" />
    </div>
  );
};
