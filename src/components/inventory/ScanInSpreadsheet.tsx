import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Camera, Download, Trash2, Clock, Package, X, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { toast } from 'sonner';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/client';
import { useAuthStore } from '../../store/useAuthStore';
import type { Item } from '../../types/item';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

interface ScannedItemEntry {
  itemId: string;
  itemName: string;
  size: string;
  sku?: string;
  barcode?: string;
  imageUrl?: string;
  quantity: number;
  firstScannedAt: Date;
  lastScannedAt: Date;
  scanTimestamps: Date[];
}

export const ScanInSpreadsheet: React.FC = () => {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedItems, setScannedItems] = useState<Map<string, ScannedItemEntry>>(new Map());
  const [_isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const hasScannedRef = useRef(false);
  const { user } = useAuthStore();

  // Convert map to array for display
  const scannedItemsArray = useMemo(() => {
    return Array.from(scannedItems.values()).sort((a, b) =>
      b.lastScannedAt.getTime() - a.lastScannedAt.getTime()
    );
  }, [scannedItems]);

  // Format relative time
  const formatRelativeTime = (date: Date): string => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  // Clear session
  const handleClearSession = () => {
    if (scannedItems.size === 0) return;

    if (confirm(`Clear all ${scannedItems.size} scanned items?`)) {
      setScannedItems(new Map());
      toast.success('Session cleared');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (scannedItemsArray.length === 0) {
      toast.error('No items to export');
      return;
    }

    const headers = ['Item Name', 'Size', 'SKU', 'Barcode', 'Quantity', 'First Scanned', 'Last Scanned'];
    const rows = scannedItemsArray.map(entry => [
      entry.itemName,
      entry.size,
      entry.sku || '',
      entry.barcode || '',
      entry.quantity.toString(),
      entry.firstScannedAt.toLocaleString(),
      entry.lastScannedAt.toLocaleString(),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(field => `"${field}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-session-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('CSV exported');
  };

  // Remove item from session
  const handleRemoveItem = (key: string) => {
    setScannedItems(prev => {
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
    toast.success('Item removed from session');
  };

  const totalQuantity = scannedItemsArray.reduce((sum, entry) => sum + entry.quantity, 0);

  // Transform Firestore data to Item type (reuse from BarcodeScanner)
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
      ebaySku: dbItem.ebaySku || undefined,
    };
  };

  // Search item by barcode (reuse from BarcodeScanner)
  const searchItemByBarcode = async (scannedValue: string): Promise<Item | null> => {
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
        const docSnap = await getDoc(doc(db, 'Item', itemId));

        if (docSnap.exists()) {
          const itemDoc = docSnap.data();
          if (itemDoc.user_uuid === user.id) {
            return transformDbItem(docSnap.id, itemDoc);
          }
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
      return transformDbItem(itemDoc.id, itemDoc.data());
    } catch (err) {
      console.error('Error searching for item:', err);
      return null;
    }
  };

  // Start scanner
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
        throw new Error('No camera found');
      }

      const selectedDeviceId = videoInputDevices.find(device =>
        device.label.toLowerCase().includes('back')
      )?.deviceId || videoInputDevices[0].deviceId;

      await codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current!,
        async (result, err) => {
          if (result && !hasScannedRef.current) {
            hasScannedRef.current = true;

            const barcode = result.getText();
            const item = await searchItemByBarcode(barcode);

            if (item) {
              const key = item.barcode || item.ebaySku || item.id;
              const now = new Date();

              setScannedItems(prev => {
                const newMap = new Map(prev);
                const existing = newMap.get(key);

                if (existing) {
                  newMap.set(key, {
                    ...existing,
                    quantity: existing.quantity + 1,
                    lastScannedAt: now,
                    scanTimestamps: [...existing.scanTimestamps, now],
                  });
                  toast.success(`${item.name} - Qty: ${existing.quantity + 1}`);
                } else {
                  newMap.set(key, {
                    itemId: item.id,
                    itemName: item.name,
                    size: item.size,
                    sku: item.ebaySku,
                    barcode: item.barcode,
                    imageUrl: item.imageUrl,
                    quantity: 1,
                    firstScannedAt: now,
                    lastScannedAt: now,
                    scanTimestamps: [now],
                  });
                  toast.success(`${item.name} added`);
                }

                return newMap;
              });
            } else {
              toast.error('Item not found');
            }

            setTimeout(() => {
              hasScannedRef.current = false;
            }, 500);
          }

          if (err && !(err instanceof NotFoundException)) {
            console.error('Scan error:', err);
          }
        }
      );
    } catch (err: any) {
      console.error('Failed to start scanner:', err);
      setError('Failed to start camera');
      toast.error('Failed to start camera');
      setIsScanning(false);
    }
  };

  // Stop scanner
  const stopScanning = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
    }
    setIsScanning(false);
  };

  // Start/stop scanner when modal opens/closes
  useEffect(() => {
    if (isScannerOpen) {
      startScanning();
    } else {
      stopScanning();
    }

    return () => {
      stopScanning();
    };
  }, [isScannerOpen]);

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setIsScannerOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-sm py-1.5 px-3"
          >
            <Camera className="w-3 h-3 mr-1.5" />
            Scan In
          </Button>

          {scannedItems.size > 0 && (
            <div className="text-xs text-gray-400">
              <span className="font-medium text-white">{scannedItemsArray.length}</span> unique items ·
              <span className="font-medium text-white ml-1">{totalQuantity}</span> total scanned
            </div>
          )}
        </div>

        <div className="flex gap-1.5">
          {scannedItems.size > 0 && (
            <>
              <Button
                onClick={handleExportCSV}
                variant="ghost"
                size="sm"
                className="text-xs py-1 px-2"
              >
                <Download className="w-3 h-3 mr-1" />
                Export CSV
              </Button>
              <Button
                onClick={handleClearSession}
                variant="ghost"
                size="sm"
                className="text-red-400 border-red-400 hover:bg-red-500/10 text-xs py-1 px-2"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear Session
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Empty State */}
      {scannedItems.size === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-3">
            <Package className="w-6 h-6 text-gray-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-300 mb-1">
            No items scanned yet
          </h3>
          <p className="text-gray-500 text-sm mb-4 max-w-md">
            Click "Scan In" to start scanning items. Each scan will be added to the table below with quantity tracking.
          </p>
          <Button
            onClick={() => setIsScannerOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-sm py-1.5"
          >
            <Camera className="w-3 h-3 mr-1.5" />
            Start Scanning
          </Button>
        </div>
      ) : (
        /* Scanned Items Table */
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50 border-b border-gray-700">
                <tr>
                  <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-400 uppercase">Item</th>
                  <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-400 uppercase">Size</th>
                  <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-400 uppercase">SKU</th>
                  <th className="px-2 py-1.5 text-center text-[10px] font-medium text-gray-400 uppercase">Quantity</th>
                  <th className="px-2 py-1.5 text-left text-[10px] font-medium text-gray-400 uppercase">Last Scanned</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {scannedItemsArray.map((entry) => {
                  const key = entry.barcode || entry.sku || entry.itemId;
                  return (
                    <tr key={key} className="hover:bg-gray-700/30 transition-colors">
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          {entry.imageUrl && (
                            <img
                              src={entry.imageUrl}
                              alt={entry.itemName}
                              className="w-6 h-6 object-cover rounded"
                            />
                          )}
                          <span className="font-medium text-white text-sm">{entry.itemName}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs">{entry.size}</td>
                      <td className="px-2 py-1.5 text-gray-400 font-mono text-xs">
                        {entry.sku || entry.barcode || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400">
                          {entry.quantity}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1 text-gray-400 text-xs">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(entry.lastScannedAt)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => handleRemoveItem(key)}
                          className="text-red-400 hover:text-red-300 p-0.5 rounded hover:bg-red-500/10 transition-colors"
                          title="Remove from session"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg border border-gray-700 max-w-sm w-full">
            <div className="p-2 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Camera className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Scan Item</h3>
              </div>
              <button
                onClick={() => setIsScannerOpen(false)}
                className="text-gray-400 hover:text-white p-1 hover:bg-gray-800 rounded transition-colors"
                aria-label="Close scanner"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              {error ? (
                <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-red-400 mb-1.5">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-semibold text-sm">Camera Error</span>
                  </div>
                  <p className="text-xs text-gray-300">{error}</p>
                  <Button
                    onClick={startScanning}
                    variant="primary"
                    size="sm"
                    className="mt-2 w-full text-xs"
                  >
                    Try Again
                  </Button>
                </div>
              ) : (
                <>
                  <div className="rounded-lg overflow-hidden bg-black relative min-h-[200px] max-h-[280px]">
                    <video
                      ref={videoRef}
                      className="w-full h-auto"
                    />
                    {/* Scanning overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-48 border-2 border-blue-500 rounded-lg shadow-lg">
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg"></div>
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg"></div>
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg"></div>
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg"></div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-400 text-center">
                      Position barcode within the frame
                    </p>
                    <p className="text-[10px] text-gray-500 text-center">
                      Scanner will continue after each successful scan
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
