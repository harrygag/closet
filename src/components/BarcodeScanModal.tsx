import React, { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, Eye, CheckCircle, Camera } from 'lucide-react';
import { Button } from './ui/Button';
import type { Item } from '../types/item';
import { BrowserMultiFormatReader } from '@zxing/library';

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
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const [manualInput, setManualInput] = useState('');
  const [useManualMode, setUseManualMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // Initialize camera and barcode reader
  useEffect(() => {
    if (!open) {
      // Cleanup when modal closes
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
      setScannedBarcode('');
      setFoundItem(null);
      setIsScanning(false);
      setError('');
      return;
    }

    // Start camera and scanning
    startScanning();

    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
    };
  }, [open]);

  const startScanning = async () => {
    try {
      setError('');
      setIsScanning(true);

      // Initialize the barcode reader
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;

      // Get available video devices
      const videoInputDevices = await codeReader.listVideoInputDevices();
      
      if (videoInputDevices.length === 0) {
        setError('No camera found. Please check camera permissions.');
        setIsScanning(false);
        return;
      }

      // Prefer back camera on mobile devices
      const backCamera = videoInputDevices.find(device => 
        device.label.toLowerCase().includes('back') || 
        device.label.toLowerCase().includes('rear')
      );
      const selectedDeviceId = backCamera ? backCamera.deviceId : videoInputDevices[0].deviceId;

      // Start decoding from video device
      await codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current!,
        (result, error) => {
          if (result) {
            const barcode = result.getText();
            handleBarcodeScanned(barcode);
          }
          // Ignore errors during scanning (they're continuous)
        }
      );
    } catch (err) {
      console.error('Error starting camera:', err);
      setError('Failed to access camera. Please allow camera permissions.');
      setIsScanning(false);
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    console.log('🔍 Scanning for barcode:', barcode);
    console.log('📦 Total items to search:', items.length);
    console.log('📋 First 3 items barcodes:', items.slice(0, 3).map(i => ({ name: i.name, barcode: i.barcode, id: i.id })));
    
    // Search for item with this barcode
    const item = items.find(
      (item) => item.barcode === barcode || item.id === barcode
    );
    
    console.log('✅ Found item:', item ? item.name : 'NOT FOUND');
    
    if (item) {
      setFoundItem(item);
      setScannedBarcode(barcode);
      setIsScanning(false);
      
      // Stop scanning when item found
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
    } else {
      // Show error briefly then continue scanning
      setScannedBarcode(barcode);
      setFoundItem(null);
      setTimeout(() => {
        setScannedBarcode('');
      }, 2000);
    }
  };

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
    return `https://www.vendoo.co/inventory?search=${encodeURIComponent(foundItem.name)}`;
  };

  const resetScanning = () => {
    setFoundItem(null);
    setScannedBarcode('');
    setError('');
    setManualInput('');
    if (!useManualMode) {
      startScanning();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleBarcodeScanned(manualInput.trim());
    }
  };

  const toggleMode = () => {
    setUseManualMode(!useManualMode);
    setFoundItem(null);
    setScannedBarcode('');
    setError('');
    setManualInput('');
    
    if (useManualMode) {
      // Switching back to camera mode
      startScanning();
    } else {
      // Switching to manual mode, stop camera
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
      setIsScanning(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-lg bg-gray-800 p-6 shadow-xl mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <h2 className="mb-4 text-2xl font-bold text-white flex items-center gap-2">
          <Camera className="h-6 w-6" />
          Scan Barcode
        </h2>

        {/* Mode Toggle */}
        <div className="mb-6 flex justify-center">
          <button
            onClick={toggleMode}
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            {useManualMode ? 'Switch to Camera' : 'Enter Barcode Manually'}
          </button>
        </div>

        {/* Manual Input Mode */}
        {useManualMode && !foundItem && (
          <form onSubmit={handleManualSubmit} className="mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter Barcode or Item ID
                </label>
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Type barcode or item ID..."
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={!manualInput.trim()}
              >
                Search
              </Button>
            </div>
          </form>
        )}

        {/* Camera View */}
        {isScanning && !foundItem && !useManualMode && (
          <div className="mb-6">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                autoPlay
                playsInline
                muted
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-48 w-48 border-4 border-green-500 rounded-lg animate-pulse" />
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-gray-400">
              Point your camera at a barcode to scan
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-500/20 border border-red-500 p-4">
            <p className="text-lg font-semibold text-red-400">Camera Error</p>
            <p className="text-sm text-gray-300 mt-2">{error}</p>
            <Button
              onClick={startScanning}
              className="mt-4"
              size="sm"
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Not Found State */}
        {scannedBarcode && !foundItem && !isScanning && (
          <div className="mb-6 text-center">
            <div className="rounded-lg bg-red-500/20 border border-red-500 p-4">
              <p className="text-lg font-semibold text-red-400">Item Not Found</p>
              <p className="text-sm text-gray-300 mt-2">
                Barcode: <code className="bg-gray-900 px-2 py-1 rounded">{scannedBarcode}</code>
              </p>
            </div>
          </div>
        )}

        {/* Found Item */}
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
              onClick={resetScanning}
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
