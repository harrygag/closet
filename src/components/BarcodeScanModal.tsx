import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Eye, CheckCircle } from 'lucide-react';
import { Button } from './ui/Button';
import type { Item } from '../types/item';

interface BarcodeScanModalProps {
  open: boolean;
  onClose: () => void;
  items: Item[];
  onMarkAsSold: (item: Item) => void;
  onViewCard: (item: Item) => void;
}

export const BarcodeScanModal: React.FC<BarcodeScanModalProps> = ({
  open,
  onClose,
  items,
  onMarkAsSold,
  onViewCard,
}) => {
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [foundItem, setFoundItem] = useState<Item | null>(null);
  const [isScanning, setIsScanning] = useState(true);

  // Listen for barcode scanner input (keyboard events)
  useEffect(() => {
    if (!open) {
      setScannedBarcode('');
      setFoundItem(null);
      setIsScanning(true);
      return;
    }

    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyPress = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      
      // If more than 100ms between keys, reset buffer (not a scanner)
      if (currentTime - lastKeyTime > 100) {
        barcodeBuffer = '';
      }
      lastKeyTime = currentTime;

      // Enter key signals end of barcode scan
      if (e.key === 'Enter' && barcodeBuffer.length > 0) {
        e.preventDefault();
        const barcode = barcodeBuffer;
        barcodeBuffer = '';
        
        // Search for item with this barcode
        const item = items.find(
          (item) => item.barcode === barcode || item.id === barcode
        );
        
        if (item) {
          setFoundItem(item);
          setScannedBarcode(barcode);
          setIsScanning(false);
        } else {
          // Show error briefly then reset
          setScannedBarcode(barcode);
          setFoundItem(null);
          setTimeout(() => {
            setScannedBarcode('');
            setIsScanning(true);
          }, 2000);
        }
      } else if (e.key.length === 1) {
        // Add character to buffer
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [open, items]);

  const handleMarkAsSold = () => {
    if (foundItem) {
      onMarkAsSold(foundItem);
      onClose();
    }
  };

  const handleViewCard = () => {
    if (foundItem) {
      onViewCard(foundItem);
      onClose();
    }
  };

  const getVendooUrl = () => {
    if (!foundItem) return '#';
    // Construct Vendoo URL based on item title or ID
    // You may need to adjust this based on actual Vendoo URL structure
    return `https://www.vendoo.co/inventory?search=${encodeURIComponent(foundItem.name)}`;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-lg bg-gray-800 p-6 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <h2 className="mb-6 text-2xl font-bold text-white">Scan Barcode</h2>

        {isScanning && !foundItem && (
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="h-32 w-32 animate-pulse rounded-lg border-4 border-dashed border-purple-500 bg-purple-500/10 flex items-center justify-center">
                <svg
                  className="h-16 w-16 text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
              </div>
            </div>
            <p className="text-lg text-gray-300">Waiting for barcode scan...</p>
            <p className="mt-2 text-sm text-gray-400">
              Use your barcode scanner to scan an item
            </p>
          </div>
        )}

        {scannedBarcode && !foundItem && (
          <div className="text-center">
            <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500 p-4">
              <p className="text-lg font-semibold text-red-400">Item Not Found</p>
              <p className="text-sm text-gray-300 mt-2">
                Barcode: <code className="bg-gray-900 px-2 py-1 rounded">{scannedBarcode}</code>
              </p>
            </div>
          </div>
        )}

        {foundItem && (
          <div>
            {/* Item Card Preview */}
            <div className="mb-6 rounded-lg border border-gray-700 bg-gray-900 p-4">
              <div className="flex gap-4">
                {foundItem.imageUrl && (
                  <img
                    src={foundItem.imageUrl}
                    alt={foundItem.name}
                    className="h-32 w-32 rounded-lg object-cover"
                  />
                )}
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white">
                    {foundItem.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-400">Size: {foundItem.size}</p>
                  <p className="mt-1 text-sm text-gray-400">
                    Status: {foundItem.status}
                  </p>
                  {foundItem.sellingPrice && (
                    <p className="mt-2 text-lg font-bold text-green-400">
                      ${foundItem.sellingPrice.toFixed(2)}
                    </p>
                  )}
                  {foundItem.barcode && (
                    <p className="mt-1 text-xs text-gray-500">
                      Barcode: {foundItem.barcode}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <Button
                onClick={handleMarkAsSold}
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="mr-2 h-5 w-5" />
                Mark as Sold
              </Button>

              <Button
                onClick={() => window.open(getVendooUrl(), '_blank')}
                variant="secondary"
                size="lg"
                className="w-full"
              >
                <ExternalLink className="mr-2 h-5 w-5" />
                Open Vendoo Page
              </Button>

              <Button
                onClick={handleViewCard}
                variant="secondary"
                size="lg"
                className="w-full"
              >
                <Eye className="mr-2 h-5 w-5" />
                View Card Details
              </Button>
            </div>

            {/* Scan Another */}
            <button
              onClick={() => {
                setFoundItem(null);
                setScannedBarcode('');
                setIsScanning(true);
              }}
              className="mt-4 w-full text-center text-sm text-gray-400 hover:text-white"
            >
              Scan Another Item
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

