import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { Button } from './ui/Button';
import { Camera, X, AlertCircle, ExternalLink, Package, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase/client';
import { useAuthStore } from '../store/useAuthStore';
import type { Item } from '../types/item';

interface BarcodeScannerProps {
  onClose: () => void;
  isOpen: boolean;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onClose,
  isOpen,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedItem, setScannedItem] = useState<Item | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasScannedRef = useRef(false);
  const { user } = useAuthStore();

  useEffect(() => {
    if (isOpen && !isScanning) {
      hasScannedRef.current = false;
      startScanning();
    }

    return () => {
      stopScanning();
    };
  }, [isOpen]);

  // Transform Firestore data to Item type
  const transformDbItem = (docId: string, dbItem: any): Item => {
    // Extract hangerId from notes if present
    const notesStr = dbItem.notes || '';
    const hangerMatch = notesStr.match(/Hanger:\s*([^\.\s]+)/);
    const hangerId = hangerMatch ? hangerMatch[1] : '';
    const cleanedNotes = notesStr.replace(/Hanger:\s*[^\.\s]+\.\s*/, '').trim();

    return {
      id: docId,
      name: dbItem.title || '',
      size: dbItem.size || '',
      status: dbItem.status === 'SOLD' ? 'SOLD' : dbItem.status === 'IN_STOCK' ? 'Active' : 'Inactive',
      hangerStatus: hangerId !== 'None' && hangerId ? 'assigned' : '',
      hangerId: hangerId !== 'None' ? hangerId : '',
      tags: (dbItem.normalizedTags || []).slice(0, 5),
      ebayUrl: dbItem.ebayUrl || undefined,
      poshmarkUrl: dbItem.poshmarkUrl || undefined,
      depopUrl: dbItem.depopUrl || undefined,
      imageUrl: dbItem.imageUrls?.[0] || undefined,
      costPrice: dbItem.purchasePriceCents ? dbItem.purchasePriceCents / 100 : 0,
      sellingPrice: dbItem.manualPriceCents ? dbItem.manualPriceCents / 100 : 0,
      ebayFees: 0,
      netProfit: dbItem.soldPriceCents && dbItem.purchasePriceCents
        ? (dbItem.soldPriceCents - dbItem.purchasePriceCents) / 100
        : 0,
      dateField: dbItem.soldDate || dbItem.purchaseDate || dbItem.createdAt,
      notes: cleanedNotes || dbItem.conditionNotes || '',
      dateAdded: dbItem.createdAt,
      barcode: dbItem.barcode || undefined,
    };
  };

  const searchItemByBarcode = async (barcode: string) => {
    if (!user) {
      toast.error('User not authenticated');
      return null;
    }

    try {
      console.log('🔍 Searching for item with barcode:', barcode, 'user:', user.id);

      const itemsRef = collection(db, 'Item');
      const q = query(
        itemsRef,
        where('barcode', '==', barcode),
        where('user_uuid', '==', user.id)
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.log('❌ No item found with barcode:', barcode);
        return null;
      }

      const itemDoc = querySnapshot.docs[0];
      const itemData = transformDbItem(itemDoc.id, itemDoc.data());
      console.log('✅ Found item:', itemData.name, 'barcode:', itemData.barcode);
      return itemData;
    } catch (err) {
      console.error('Error searching for item:', err);
      toast.error('Failed to search for item');
      return null;
    }
  };

  const startScanning = async () => {
    try {
      setError(null);
      setIsScanning(true);
      setScannedItem(null);
      setNotFound(false);

      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserMultiFormatReader();
      }

      const codeReader = codeReaderRef.current;

      // Get available video devices
      const videoInputDevices = await codeReader.listVideoInputDevices();

      if (videoInputDevices.length === 0) {
        throw new Error('No camera found on this device');
      }

      // Use the first back camera if available, otherwise use the first camera
      const selectedDeviceId = videoInputDevices.find(device =>
        device.label.toLowerCase().includes('back')
      )?.deviceId || videoInputDevices[0].deviceId;

      console.log('Starting camera with device:', selectedDeviceId);

      // Start decoding from video device
      await codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current!,
        async (result, error) => {
          if (result && !hasScannedRef.current) {
            hasScannedRef.current = true;

            const barcode = result.getText();
            const format = result.getBarcodeFormat();

            console.log('Barcode scanned:', barcode, 'Format:', format);
            setLastScannedCode(barcode);

            toast.success(`Scanned: ${barcode}`);

            // Search for item in Firestore
            const item = await searchItemByBarcode(barcode);

            if (item) {
              setScannedItem(item);
              setNotFound(false);
              setShowResultModal(true);
            } else {
              setNotFound(true);
              setShowResultModal(true);
            }

            // Stop scanning after successful scan
            await stopScanning();
          }

          if (error && !(error instanceof NotFoundException)) {
            // Only log non-NotFoundException errors
            console.error('Scanning error:', error);
          }
        }
      );
    } catch (err: any) {
      console.error('Failed to start barcode scanner:', err);

      let errorMsg = 'Failed to start camera';
      if (err.name === 'NotAllowedError') {
        errorMsg = 'Camera permission denied. Please allow camera access.';
      } else if (err.name === 'NotFoundError' || err.message?.includes('No camera')) {
        errorMsg = 'No camera found on this device.';
      } else if (err.name === 'NotReadableError') {
        errorMsg = 'Camera is already in use by another application.';
      }

      setError(errorMsg);
      toast.error(errorMsg);
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    try {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
      setIsScanning(false);
    } catch (err) {
      console.error('Error stopping scanner:', err);
    }
  };

  const handleClose = async () => {
    await stopScanning();
    setShowResultModal(false);
    setScannedItem(null);
    setNotFound(false);
    onClose();
  };

  const handleViewCard = () => {
    if (!scannedItem) return;

    // You can implement navigation to item detail page here
    // For now, we'll show a detailed modal with item info
    toast.info(`Viewing: ${scannedItem.name}`);

    // Close the scanner and show item details
    handleClose();
  };

  const handleGoToEbay = () => {
    if (!scannedItem) return;

    // Try to find eBay URL from different sources
    let ebayUrl = scannedItem.ebayUrl;

    if (!ebayUrl && scannedItem.marketplaceUrls) {
      const ebayListing = scannedItem.marketplaceUrls.find(
        (m) => m.type === 'ebay'
      );
      ebayUrl = ebayListing?.url;
    }

    if (ebayUrl) {
      window.open(ebayUrl, '_blank', 'noopener,noreferrer');
      toast.success('Opening eBay listing');
    } else {
      toast.error('No eBay listing URL found for this item');
    }
  };

  const handleMarkAsSold = async () => {
    if (!scannedItem) return;

    setIsUpdating(true);
    try {
      const itemRef = doc(db, 'Item', scannedItem.id);
      await updateDoc(itemRef, {
        status: 'SOLD',
      });

      toast.success(`${scannedItem.name} marked as SOLD!`);

      // Update local state
      setScannedItem({ ...scannedItem, status: 'SOLD' });

      // Close after a short delay
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to mark item as sold:', err);
      toast.error('Failed to update item status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleScanAgain = () => {
    setShowResultModal(false);
    setScannedItem(null);
    setNotFound(false);
    hasScannedRef.current = false;
    startScanning();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {showResultModal ? (
        // Result Modal
        <div className="relative w-full max-w-md mx-4 bg-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              {notFound ? (
                <AlertCircle className="h-5 w-5 text-yellow-400" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-400" />
              )}
              <h2 className="text-lg font-bold text-white">
                {notFound ? 'Item Not Found' : 'Item Found!'}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Close scanner"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {notFound ? (
              <div className="space-y-4">
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
                  <p className="text-gray-300 mb-2">
                    No item found with barcode:
                  </p>
                  <code className="block bg-gray-800 px-3 py-2 rounded text-yellow-400 font-mono text-sm">
                    {lastScannedCode}
                  </code>
                </div>
                <p className="text-sm text-gray-400">
                  This barcode is not associated with any items in your closet.
                </p>
              </div>
            ) : scannedItem ? (
              <div className="space-y-4">
                {/* Item Preview */}
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex gap-4">
                    {scannedItem.imageUrl ? (
                      <img
                        src={scannedItem.imageUrl}
                        alt={scannedItem.name}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gray-700 rounded-lg flex items-center justify-center">
                        <Package className="h-8 w-8 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate">
                        {scannedItem.name}
                      </h3>
                      <p className="text-sm text-gray-400">
                        Size: {scannedItem.size}
                      </p>
                      <p className="text-sm text-gray-400">
                        Status: <span className={
                          scannedItem.status === 'SOLD'
                            ? 'text-green-400'
                            : scannedItem.status === 'Active'
                            ? 'text-blue-400'
                            : 'text-gray-400'
                        }>
                          {scannedItem.status}
                        </span>
                      </p>
                      {scannedItem.sellingPrice && (
                        <p className="text-sm font-semibold text-green-400 mt-1">
                          ${scannedItem.sellingPrice.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  <Button
                    onClick={handleViewCard}
                    variant="primary"
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <Package className="h-4 w-4" />
                    View Card
                  </Button>

                  <Button
                    onClick={handleGoToEbay}
                    variant="secondary"
                    className="w-full flex items-center justify-center gap-2"
                    disabled={!scannedItem.ebayUrl && !scannedItem.marketplaceUrls?.some(m => m.type === 'ebay')}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Go to eBay
                  </Button>

                  <Button
                    onClick={handleMarkAsSold}
                    variant="secondary"
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white"
                    disabled={scannedItem.status === 'SOLD' || isUpdating}
                  >
                    <CheckCircle className="h-4 w-4" />
                    {isUpdating ? 'Updating...' : scannedItem.status === 'SOLD' ? 'Already Sold' : 'Mark as Sold'}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Scan Again Button */}
            <div className="mt-4 pt-4 border-t border-gray-700">
              <Button
                onClick={handleScanAgain}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                <Camera className="h-4 w-4 mr-2" />
                Scan Another Item
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // Scanner Modal
        <div className="relative w-full max-w-md mx-4 bg-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <Camera className="h-5 w-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white">Scan Barcode</h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Close scanner"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>

          {/* Scanner Area */}
          <div className="p-4">
            {error ? (
              <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-semibold">Camera Error</span>
                </div>
                <p className="text-sm text-gray-300">{error}</p>
                <Button
                  onClick={startScanning}
                  variant="primary"
                  size="sm"
                  className="mt-3 w-full"
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-lg overflow-hidden bg-black relative">
                  <video
                    ref={videoRef}
                    className="w-full h-auto"
                    style={{ minHeight: '300px', maxHeight: '400px' }}
                  />
                  {/* Scanning overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-64 h-64 border-2 border-purple-500 rounded-lg shadow-lg">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-purple-400 rounded-tl-lg"></div>
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-purple-400 rounded-tr-lg"></div>
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-purple-400 rounded-bl-lg"></div>
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-purple-400 rounded-br-lg"></div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-sm text-gray-400 text-center">
                    Position barcode within the frame
                  </p>
                  <Button
                    onClick={handleClose}
                    variant="secondary"
                    size="sm"
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Supported Formats Info */}
          <div className="p-4 bg-gray-800/50 border-t border-gray-700">
            <p className="text-xs text-gray-400 text-center">
              Supports: UPC, EAN, Code 128, Code 39, QR codes, and more
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
