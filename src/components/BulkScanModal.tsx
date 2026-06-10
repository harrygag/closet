import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, CheckCircle, Package } from 'lucide-react';
import { Button } from './ui/Button';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { toast } from 'sonner';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase/client';
import { useAuthStore } from '../store/useAuthStore';
import { useInventoryScanStore } from '../store/useInventoryScanStore';
import type { Item } from '../types/item';

interface BulkScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ScannedItemRecord {
  itemId: string;
  itemName: string;
  timestamp: Date;
}

export const BulkScanModal: React.FC<BulkScanModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const {
    enableBatchScanMode,
    disableBatchScanMode,
    addToBatchQueue,
    clearBatchQueue,
  } = useInventoryScanStore();

  const [_isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItemRecord[]>([]);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [sessionStats, setSessionStats] = useState({ count: 0, duration: 0 });

  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasScannedRef = useRef(false);
  const beepAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize beep sound using Web Audio API
  useEffect(() => {
    // Create a beep sound for scan feedback
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playBeep = () => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Frequency in Hz
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    };

    beepAudioRef.current = { play: playBeep } as any;
  }, []);

  // Enable batch scan mode when modal opens
  useEffect(() => {
    if (isOpen) {
      enableBatchScanMode();
      setStartTime(new Date());
      setScannedItems([]);
      startScanning();
    } else {
      stopScanning();
    }

    return () => {
      stopScanning();
    };
  }, [isOpen]);

  // Update session stats
  useEffect(() => {
    if (startTime) {
      const interval = setInterval(() => {
        const now = new Date();
        const durationSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        setSessionStats({
          count: scannedItems.length,
          duration: durationSeconds
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [startTime, scannedItems]);

  // Transform Firestore data to Item type
  const transformDbItem = (docId: string, dbItem: any): Item => {
    const notesStr = dbItem.notes || '';
    const hangerMatch = notesStr.match(/Hanger:\s*([^\.\s]+)/);
    const hangerId = hangerMatch ? hangerMatch[1] : '';
    const cleanedNotes = notesStr.replace(/Hanger:\s*[^\.\s]+\.\s*/, '').trim();

    const imageUrl = dbItem.imageUrls?.[0]
      || dbItem.ebayPhotos?.[0]?.firebaseStorageUrl
      || dbItem.ebayPhotos?.[0]?.ebayUrl
      || undefined;

    const ebayUrl = dbItem.ebayUrl
      || (dbItem.ebayListingId ? `https://www.ebay.com/itm/${dbItem.ebayListingId}` : undefined);

    return {
      id: docId,
      name: dbItem.title || '',
      size: dbItem.size || '',
      status: dbItem.status === 'SOLD' ? 'SOLD' : dbItem.status === 'IN_STOCK' ? 'Active' : 'Inactive',
      hangerStatus: hangerId !== 'None' && hangerId ? 'assigned' : '',
      hangerId: hangerId !== 'None' ? hangerId : '',
      tags: (dbItem.normalizedTags || []).slice(0, 5),
      ebayUrl: ebayUrl,
      ebayListingId: dbItem.ebayListingId || undefined,
      poshmarkUrl: dbItem.poshmarkUrl || undefined,
      depopUrl: dbItem.depopUrl || undefined,
      imageUrl: imageUrl,
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

  const searchItemByBarcode = async (scannedValue: string) => {
    if (!user) {
      toast.error('User not authenticated');
      return null;
    }

    try {
      const itemsRef = collection(db, 'Item');

      // Check if the scanned value is an item detail page URL (from QR code)
      const itemUrlMatch = scannedValue.match(/\/items\/([a-zA-Z0-9]+)/);
      if (itemUrlMatch) {
        const itemId = itemUrlMatch[1];

        try {
          const docSnap = await getDoc(doc(db, 'Item', itemId));

          if (docSnap.exists()) {
            const itemDoc = docSnap.data();
            if (itemDoc.user_uuid === user.id) {
              const itemData = transformDbItem(docSnap.id, itemDoc);
              return itemData;
            }
          }
        } catch (urlErr) {
          console.error('Failed to fetch by URL:', urlErr);
        }
      }

      // Check if the scanned value is an eBay URL
      const isEbayUrl = scannedValue.includes('ebay.com/itm/') || scannedValue.includes('ebay.');

      let q;
      if (isEbayUrl) {
        q = query(
          itemsRef,
          where('ebayUrl', '==', scannedValue),
          where('user_uuid', '==', user.id)
        );
      } else {
        q = query(
          itemsRef,
          where('barcode', '==', scannedValue),
          where('user_uuid', '==', user.id)
        );
      }

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return null;
      }

      const itemDoc = querySnapshot.docs[0];
      const itemData = transformDbItem(itemDoc.id, itemDoc.data());
      return itemData;
    } catch (err) {
      console.error('Error searching for item:', err);
      return null;
    }
  };

  const startScanning = async () => {
    try {
      setError(null);
      setIsScanning(true);

      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserMultiFormatReader();
      }

      const codeReader = codeReaderRef.current;
      const videoInputDevices = await codeReader.listVideoInputDevices();

      if (videoInputDevices.length === 0) {
        throw new Error('No camera found on this device');
      }

      const selectedDeviceId = videoInputDevices.find(device =>
        device.label.toLowerCase().includes('back')
      )?.deviceId || videoInputDevices[0].deviceId;

      await codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current!,
        async (result, error) => {
          if (result && !hasScannedRef.current) {
            hasScannedRef.current = true;

            const barcode = result.getText();
            console.log('Batch scan - barcode scanned:', barcode);

            // Play beep sound
            try {
              beepAudioRef.current?.play();
            } catch (audioErr) {
              console.log('Could not play beep sound:', audioErr);
            }

            // Search for item
            const item = await searchItemByBarcode(barcode);

            if (item) {
              // Add to batch queue
              addToBatchQueue(item.id);

              // Add to scanned items list
              const newRecord: ScannedItemRecord = {
                itemId: item.id,
                itemName: item.name,
                timestamp: new Date()
              };
              setScannedItems(prev => [...prev, newRecord]);

              // No toast or modal - just visual feedback in the list
              console.log('Item added to batch queue:', item.name);
            } else {
              // Item not found - show brief toast
              toast.error('Item not found');
            }

            // Reset for next scan
            setTimeout(() => {
              hasScannedRef.current = false;
            }, 500);
          }

          if (error && !(error instanceof NotFoundException)) {
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

  const handleFinishBatch = async () => {
    await stopScanning();
    disableBatchScanMode();
    clearBatchQueue();

    toast.success(`Batch complete: ${scannedItems.length} items scanned`);
    onClose();
  };

  const handleClose = async () => {
    await stopScanning();
    disableBatchScanMode();
    clearBatchQueue();
    onClose();
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl bg-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gradient-to-r from-purple-900/50 to-blue-900/50 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Camera className="h-6 w-6 text-purple-400" />
              Batch Scan Mode
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Scanned {sessionStats.count} items in {formatDuration(sessionStats.duration)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close batch scan"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Scanner Area */}
        <div className="p-4 border-b border-gray-700 flex-shrink-0">
          {error ? (
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
              <p className="text-sm text-red-300">{error}</p>
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
            <div className="rounded-lg overflow-hidden bg-black relative">
              <video
                ref={videoRef}
                className="w-full h-auto"
                style={{ minHeight: '200px', maxHeight: '300px' }}
              />
              {/* Scanning overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-purple-500 rounded-lg shadow-lg">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-purple-400 rounded-tl-lg"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-purple-400 rounded-tr-lg"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-purple-400 rounded-bl-lg"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-purple-400 rounded-br-lg"></div>
                </div>
              </div>
              {/* Scan count overlay */}
              <div className="absolute top-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg">
                {scannedItems.length}
              </div>
            </div>
          )}
        </div>

        {/* Scanned Items List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Scanned Items ({scannedItems.length})
            </h3>
          </div>

          {scannedItems.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No items scanned yet</p>
              <p className="text-sm text-gray-500 mt-1">Start scanning to add items to this batch</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scannedItems.map((record, index) => (
                <div
                  key={`${record.itemId}-${index}`}
                  className="bg-gray-800 rounded-lg p-3 flex items-center gap-3 hover:bg-gray-750 transition-colors"
                >
                  <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {record.itemName}
                    </p>
                    <p className="text-xs text-gray-400">
                      {record.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500 flex-shrink-0">
                    #{scannedItems.length - index}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer - Finish Button */}
        <div className="p-4 border-t border-gray-700 bg-gray-800/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleClose}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleFinishBatch}
              variant="primary"
              className="flex-1 bg-purple-600 hover:bg-purple-700"
              disabled={scannedItems.length === 0}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Finish Batch ({scannedItems.length})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
