import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { Button } from './ui/Button';
import { Camera, X, AlertCircle, ExternalLink, Package, CheckCircle, Copy, TrendingDown, TrendingUp, ClipboardCheck, History } from 'lucide-react';
import { toast } from 'sonner';
import { collection, query, where, getDocs, doc, updateDoc, Timestamp, getDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase/client';
import { useAuthStore } from '../store/useAuthStore';
import type { Item } from '../types/item';
import { ebayService } from '../services/ebayService';
import { logCheckIn, logPriceIncrease, logPriceDecrease, logScan } from '../services/activityLog';
import { recordSale } from '../services/saleService';
import { parseUnitBarcode } from '../services/barcodes';

interface BarcodeScannerProps {
  onClose: () => void;
  isOpen: boolean;
  onItemScanned?: (item: Item) => void;
  sessionMode?: boolean;
  inline?: boolean;
  cameraHeight?: number;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onClose,
  isOpen,
  onItemScanned,
  sessionMode = false,
  inline = false,
  cameraHeight = 300,
}) => {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedItem, setScannedItem] = useState<Item | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastCheckIn, setLastCheckIn] = useState<Date | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [checkInHistory, setCheckInHistory] = useState<any[]>([]);

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

    // Get image from multiple possible sources
    const imageUrl = dbItem.imageUrls?.[0]
      || dbItem.ebayPhotos?.[0]?.firebaseStorageUrl
      || dbItem.ebayPhotos?.[0]?.ebayUrl
      || undefined;

    // Construct eBay URL if not present but we have listing ID
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
      console.log('🔍 Searching for item with scanned value:', scannedValue, 'user:', user.id);

      const itemsRef = collection(db, 'Item');

      // Check if the scanned value is an item detail page URL (from QR code)
      const itemUrlMatch = scannedValue.match(/\/items\/([a-zA-Z0-9]+)/);
      if (itemUrlMatch) {
        const itemId = itemUrlMatch[1];
        console.log('🔍 Detected item URL from QR code, looking up item ID:', itemId);

        // Fetch the item directly by document ID
        try {
          const docSnap = await getDoc(doc(db, 'Item', itemId));

          if (docSnap.exists()) {
            const itemDoc = docSnap.data();
            // Verify this item belongs to the current user
            if (itemDoc.user_uuid === user.id) {
              const itemData = transformDbItem(docSnap.id, itemDoc);
              console.log('✅ Found item by QR code URL:', itemData.name);
              return itemData;
            }
          }
        } catch (urlErr) {
          console.error('Failed to fetch by URL, trying other methods:', urlErr);
        }
      }

      // Check if the scanned value is an eBay URL
      const isEbayUrl = scannedValue.includes('ebay.com/itm/') || scannedValue.includes('ebay.');

      // Parse unit barcode if it's a unit-specific code
      const unitInfo = parseUnitBarcode(scannedValue);
      const searchBarcode = unitInfo?.baseBarcode || scannedValue;

      if (unitInfo && unitInfo.unitNumber > 1) {
        console.log(`🔍 Detected unit barcode: Unit ${unitInfo.unitNumber} of base barcode ${searchBarcode}`);
        toast.info(`Scanned Unit ${unitInfo.unitNumber}`);
      }

      let q;
      if (isEbayUrl) {
        // Search by eBay URL
        console.log('🔍 Detected eBay URL, searching by ebayUrl field');
        q = query(
          itemsRef,
          where('ebayUrl', '==', scannedValue),
          where('user_uuid', '==', user.id)
        );
      } else {
        // Search by barcode (using base barcode for unit-specific codes)
        console.log('🔍 Searching by barcode field:', searchBarcode);
        q = query(
          itemsRef,
          where('barcode', '==', searchBarcode),
          where('user_uuid', '==', user.id)
        );
      }

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.log('❌ No item found with scanned value:', scannedValue);
        return null;
      }

      const itemDoc = querySnapshot.docs[0];
      const itemData = transformDbItem(itemDoc.id, itemDoc.data());
      console.log('✅ Found item:', itemData.name, 'ebayUrl:', itemData.ebayUrl);
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

            // Stop scanning after successful scan
            await stopScanning();

            if (item) {
              // Determine scan method
              const scanMethod: 'QR' | 'BARCODE' | 'URL' = barcode.includes('http') || barcode.includes('/items/')
                ? 'QR'
                : 'BARCODE';

              // Log the scan activity
              if (user) {
                logScan(user.id, item.id, item.name, scanMethod, item.barcode, item.ebayUrl, item.ebayListingId);
              }

              // Notify parent
              onItemScanned?.(item);

              if (sessionMode) {
                // Session mode: increment scanCount, show brief flash, auto-restart
                try {
                  await updateDoc(doc(db, 'Item', item.id), {
                    lastScannedDate: new Date().toISOString(),
                    scanCount: increment(1),
                    updatedAt: Timestamp.now(),
                  });
                } catch (e) {
                  console.error('Failed to update scanCount:', e);
                }
                setScannedItem(item);
                setShowResultModal(true);
                setTimeout(() => {
                  setShowResultModal(false);
                  setScannedItem(null);
                  setNotFound(false);
                  hasScannedRef.current = false;
                  startScanning();
                }, 1500);
              } else {
                // Normal mode: show full result modal
                setScannedItem(item);
                setShowResultModal(true);
                if (user) fetchLastCheckIn(item.id);
              }
            } else {
              // Show not found modal
              setNotFound(true);
              setShowResultModal(true);
            }
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

    // Navigate to item detail page with Quick Actions
    handleClose();
    navigate(`/items/${scannedItem.id}`);
  };

  const handleGoToEbay = () => {
    if (!scannedItem?.ebayUrl) {
      toast.error('No eBay listing URL found');
      return;
    }

    window.open(scannedItem.ebayUrl, '_blank', 'noopener,noreferrer');
    toast.success('Opening eBay listing');
  };

  const handleMarkAsSold = async () => {
    if (!scannedItem) return;

    setIsUpdating(true);
    try {
      const itemRef = doc(db, 'Item', scannedItem.id);
      await updateDoc(itemRef, {
        status: 'SOLD',
      });

      // Record sale so it shows up on Sales page
      const { user } = useAuthStore.getState();
      if (user) {
        await recordSale({
          userId: user.id,
          itemId: scannedItem.id,
          itemName: scannedItem.name,
          itemImageUrl: scannedItem.imageUrl,
          salePrice: (scannedItem as any).manualPriceCents || scannedItem.sellingPrice || 0,
          costPrice: scannedItem.costPrice || 0,
          marketplace: 'in_person',
          saleSource: 'scan_detail',
        });
      }

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

  const handleCopyUrl = async () => {
    if (!scannedItem?.ebayUrl) {
      toast.error('No eBay URL to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(scannedItem.ebayUrl);
      toast.success('eBay URL copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy URL');
    }
  };

  const handleChangePriceAndRelist = async (percentChange: number) => {
    if (!scannedItem || !scannedItem.sellingPrice) {
      toast.error('No price information available');
      return;
    }

    if (!scannedItem.ebayListingId) {
      toast.error('No eBay listing ID found');
      return;
    }

    setIsUpdating(true);
    try {
      // Calculate new price
      const currentPriceCents = Math.round(scannedItem.sellingPrice * 100);
      const newPriceCents = Math.round(currentPriceCents * (1 + percentChange / 100));
      const newPrice = newPriceCents / 100;

      const action = percentChange < 0 ? 'Decreasing' : 'Increasing';
      toast.info(`${action} price and relisting...`);

      // Step 1: End the current eBay listing
      await ebayService.endItem(scannedItem.ebayListingId, 'NotAvailable');
      toast.success('eBay listing ended');

      // Step 2: Relist with new price
      toast.info('Relisting with new price...');
      const relistResult = await ebayService.relistItem(scannedItem.ebayListingId, newPriceCents);

      if (!relistResult.success) {
        throw new Error('Failed to relist item');
      }

      const newEbayUrl = relistResult.listingUrl;
      const newItemId = relistResult.itemId;

      toast.success(`Relisted at $${newPrice.toFixed(2)} (was $${scannedItem.sellingPrice.toFixed(2)})`);

      // Step 3: Update Firestore with new eBay data
      const itemRef = doc(db, 'Item', scannedItem.id);
      await updateDoc(itemRef, {
        manualPriceCents: newPriceCents,
        ebayListingId: newItemId,
        ebayUrl: newEbayUrl,
        updatedAt: new Date().toISOString(),
      });

      // Update local state
      setScannedItem({
        ...scannedItem,
        sellingPrice: newPrice,
        ebayListingId: newItemId,
        ebayUrl: newEbayUrl
      });

      // Copy new eBay URL to clipboard
      await navigator.clipboard.writeText(newEbayUrl);
      toast.info('New eBay URL copied to clipboard');

      // Close modal and navigate to item detail
      setTimeout(() => {
        handleClose();
        navigate(`/items/${scannedItem.id}`);
      }, 2000);
    } catch (err: any) {
      console.error('Failed to change price and relist:', err);
      toast.error(`Failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDecreasePriceAndRelist = async () => {
    await handleChangePriceAndRelist(-10);
    // Log price decrease
    if (user && scannedItem) {
      await logPriceDecrease(
        user.id,
        scannedItem.id,
        scannedItem.name,
        Math.round(scannedItem.sellingPrice * 100),
        Math.round(scannedItem.sellingPrice * 0.9 * 100),
        10
      );
    }
  };

  const handleIncreasePriceAndRelist = async () => {
    await handleChangePriceAndRelist(10);
    // Log price increase
    if (user && scannedItem) {
      await logPriceIncrease(
        user.id,
        scannedItem.id,
        scannedItem.name,
        Math.round(scannedItem.sellingPrice * 100),
        Math.round(scannedItem.sellingPrice * 1.1 * 100),
        10
      );
    }
  };

  const fetchLastCheckIn = async (itemId: string) => {
    if (!user) return;

    try {
      const activityQuery = query(
        collection(db, 'ActivityLog'),
        where('userId', '==', user.id),
        where('itemId', '==', itemId),
        where('activityType', '==', 'CHECK_IN')
      );

      const querySnapshot = await getDocs(activityQuery);

      if (!querySnapshot.empty) {
        // Get the most recent check-in
        const logs = querySnapshot.docs
          .map(doc => ({
            timestamp: doc.data().timestamp
          }))
          .sort((a, b) => {
            const aTime = a.timestamp instanceof Timestamp ? a.timestamp.toDate() : new Date(a.timestamp);
            const bTime = b.timestamp instanceof Timestamp ? b.timestamp.toDate() : new Date(b.timestamp);
            return bTime.getTime() - aTime.getTime();
          });

        if (logs[0]) {
          const lastLog = logs[0].timestamp instanceof Timestamp
            ? logs[0].timestamp.toDate()
            : new Date(logs[0].timestamp);
          setLastCheckIn(lastLog);
        }
      } else {
        setLastCheckIn(null);
      }
    } catch (err) {
      console.error('Failed to fetch last check-in:', err);
      setLastCheckIn(null);
    }
  };

  const fetchCheckInHistory = async (itemId: string) => {
    if (!user) return;

    try {
      const activityQuery = query(
        collection(db, 'ActivityLog'),
        where('userId', '==', user.id),
        where('itemId', '==', itemId),
        where('activityType', '==', 'CHECK_IN')
      );

      const querySnapshot = await getDocs(activityQuery);
      const history = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp instanceof Timestamp
            ? doc.data().timestamp.toDate()
            : new Date(doc.data().timestamp)
        }))
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      setCheckInHistory(history);
    } catch (err) {
      console.error('Failed to fetch check-in history:', err);
    }
  };

  const handleFlipCard = async () => {
    if (!isFlipped && scannedItem) {
      // Fetch history before flipping
      await fetchCheckInHistory(scannedItem.id);
    }
    setIsFlipped(!isFlipped);
  };

  const handleCheckIn = async () => {
    if (!scannedItem || !user) {
      toast.error('Unable to check in item');
      return;
    }

    setIsCheckingIn(true);
    try {
      // Use stored eBay URL (skip API call for speed)
      const ebayUrl = scannedItem.ebayUrl;

      console.log('🔍 Check-in data:', {
        itemId: scannedItem.id,
        itemName: scannedItem.name,
        barcode: scannedItem.barcode,
        ebayUrl: ebayUrl,
        ebayListingId: scannedItem.ebayListingId,
        hasEbayUrl: !!ebayUrl
      });

      await logCheckIn(
        user.id,
        scannedItem.id,
        scannedItem.name,
        scannedItem.barcode,
        ebayUrl,
        scannedItem.ebayListingId
      );

      const now = new Date();

      // Update item: set lastScannedDate and increment scanCount
      await updateDoc(doc(db, 'Item', scannedItem.id), {
        lastScannedDate: now.toISOString(),
        scanCount: increment(1),
        updatedAt: Timestamp.now(),
      });

      setLastCheckIn(now);

      // Fetch updated history
      await fetchCheckInHistory(scannedItem.id);

      toast.success('Item checked in successfully');
    } catch (err) {
      console.error('Failed to check in item:', err);
      toast.error('Failed to check in item');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleScanAgain = () => {
    setIsFlipped(false);
    setCheckInHistory([]);
    setShowResultModal(false);
    setScannedItem(null);
    setNotFound(false);
    hasScannedRef.current = false;
    startScanning();
  };

  if (!isOpen) return null;

  if (inline) {
    return (
      <div className="w-full flex flex-col">
        {/* Camera */}
        <div className="relative w-full bg-black overflow-hidden" style={{ height: `${cameraHeight}px`, transition: 'height 0.3s ease' }}>
          <div className="absolute inset-0">
            {error ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
                <AlertCircle className="h-8 w-8 text-red-400" />
                <p className="text-sm text-white text-center">{error}</p>
                <Button onClick={startScanning} variant="primary" size="sm">Try Again</Button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  playsInline
                  autoPlay
                  muted
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative border-2 border-purple-400 rounded-lg" style={{ width: '70%', height: '70%' }}>
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-purple-400 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-purple-400 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-purple-400 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-purple-400 rounded-br-lg" />
                    <p className="absolute -bottom-7 left-0 right-0 text-center text-xs text-white">Point at barcode</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {/* Result card shown inline below camera */}
        {showResultModal && !sessionMode && (
          <div className="bg-gray-900 border-t border-gray-700 p-4">
            {/* reuse existing result content via the modal below */}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center bg-black/80 backdrop-blur-sm md:p-4">
      {showResultModal && sessionMode ? (
        // Session mode: brief flash card
        <div className="relative w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            {scannedItem?.imageUrl && (
              <img src={scannedItem.imageUrl} alt="" className="w-20 h-20 object-contain rounded-xl bg-gray-800" />
            )}
            <CheckCircle className="h-10 w-10 text-green-400" />
            <div>
              <p className="text-white font-semibold text-lg">{scannedItem?.name ?? 'Item found'}</p>
              {scannedItem?.size && <p className="text-gray-400 text-sm mt-0.5">Size: {scannedItem.size}</p>}
            </div>
            <p className="text-xs text-gray-500">Scanning next item…</p>
          </div>
        </div>
      ) : showResultModal ? (
        // Normal Result Modal
        <div className="relative w-full max-w-md bg-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-3">
              {notFound ? (
                <AlertCircle className="h-5 w-5 text-yellow-400" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-400" />
              )}
              <h2 className="text-lg font-bold text-white">
                {notFound ? 'Item Not Found' : isFlipped ? 'Scan-In History' : 'Item Found!'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {!notFound && scannedItem && (
                <button
                  type="button"
                  onClick={handleFlipCard}
                  className="p-2 hover:bg-gray-800 rounded-lg transition-all"
                  aria-label="View history"
                  title={isFlipped ? 'View item details' : 'View scan-in history'}
                >
                  {isFlipped ? <Package className="h-5 w-5 text-gray-400" /> : <History className="h-5 w-5 text-gray-400" />}
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                aria-label="Close scanner"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto flex-1">
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
              !isFlipped ? (
              <div className="space-y-4">
                {/* Item Preview - Front of Card */}
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex flex-col gap-4">
                    {/* Item Image - Large Display */}
                    {scannedItem.imageUrl && (
                      <div className="w-full flex justify-center bg-gray-900 rounded-lg p-2">
                        <img
                          src={scannedItem.imageUrl}
                          alt={scannedItem.name}
                          className="max-w-full max-h-48 object-contain rounded"
                        />
                      </div>
                    )}

                    {/* Item Details */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-white text-lg">
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

                      {/* eBay URL Display with Copy Button */}
                      {scannedItem.ebayUrl && (
                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-gray-500">eBay Listing:</p>
                            <button
                              type="button"
                              onClick={handleCopyUrl}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                            >
                              <Copy className="h-3 w-3" />
                              Copy URL
                            </button>
                          </div>
                          <a
                            href={scannedItem.ebayUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 break-all underline"
                          >
                            {scannedItem.ebayUrl}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  {/* Current Price Display */}
                  {scannedItem.sellingPrice && (
                    <div className="bg-gray-900 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400">Current Price</p>
                      <p className="text-2xl font-bold text-green-400">${scannedItem.sellingPrice.toFixed(2)}</p>
                    </div>
                  )}

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
                    disabled={!scannedItem.ebayUrl}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Go to eBay
                  </Button>

                  {/* Scan In Button */}
                  <div className="space-y-2">
                    <Button
                      onClick={handleCheckIn}
                      variant="secondary"
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={isCheckingIn}
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      {isCheckingIn ? 'Scanning In...' : 'Scan In'}
                    </Button>

                    {/* Last Scan In Display */}
                    {lastCheckIn && (
                      <div className="text-center">
                        <p className="text-xs text-gray-400">
                          Last scanned in: {new Date(lastCheckIn).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Price Change Buttons - Side by Side */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={handleDecreasePriceAndRelist}
                      variant="secondary"
                      className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                      disabled={!scannedItem.sellingPrice || !scannedItem.ebayListingId || isUpdating}
                    >
                      <TrendingDown className="h-4 w-4" />
                      {isUpdating ? 'Updating...' : '-10% & Relist'}
                    </Button>

                    <Button
                      onClick={handleIncreasePriceAndRelist}
                      variant="secondary"
                      className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white"
                      disabled={!scannedItem.sellingPrice || !scannedItem.ebayListingId || isUpdating}
                    >
                      <TrendingUp className="h-4 w-4" />
                      {isUpdating ? 'Updating...' : '+10% & Relist'}
                    </Button>
                  </div>

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
              ) : (
                /* Scan-In History - Back of Card */
                <div className="space-y-4">
                  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                      <History className="h-5 w-5 text-blue-400" />
                      <h3 className="text-lg font-semibold text-white">Scan-In History</h3>
                    </div>

                    {checkInHistory.length === 0 ? (
                      <p className="text-gray-400 text-center py-8">
                        No scans yet for this item
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {checkInHistory.map((log, index) => (
                          <div
                            key={log.id}
                            className="bg-gray-900 rounded-lg p-3 border border-gray-700"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-white">
                                  Scan #{checkInHistory.length - index}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {new Date(log.timestamp).toLocaleString()}
                                </p>
                                {log.ebayUrl && (
                                  <a
                                    href={log.ebayUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-2"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    View eBay listing
                                  </a>
                                )}
                              </div>
                              <div className="flex-shrink-0">
                                <CheckCircle className="h-4 w-4 text-green-400" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick Actions on Back */}
                  <div className="space-y-2">
                    <Button
                      onClick={handleFlipCard}
                      variant="secondary"
                      className="w-full flex items-center justify-center gap-2"
                    >
                      <Package className="h-4 w-4" />
                      Back to Item Details
                    </Button>
                  </div>
                </div>
              )
            ) : null}
          </div>

          {/* Footer - Scan Again Button */}
          <div className="p-4 border-t border-gray-700 bg-gray-900 flex-shrink-0">
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
      ) : (
        // Scanner Modal
        <div className="relative w-full flex-1 md:flex-none md:h-auto md:max-w-md bg-gray-900 md:rounded-xl md:border md:border-gray-700 shadow-2xl overflow-hidden flex flex-col">

          {/* Camera — square: 100vw × 100vw on mobile, fixed height on desktop */}
          <div
            className="relative bg-black overflow-hidden shrink-0"
            style={{ width: '100%', paddingBottom: 'min(100%, 400px)', height: 0 }}
          >
            <div className="absolute inset-0">
              {error ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-6 bg-red-900/20">
                  <AlertCircle className="h-8 w-8 text-red-400" />
                  <p className="text-sm text-gray-300 text-center">{error}</p>
                  <Button onClick={startScanning} variant="primary" size="sm">Try Again</Button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    playsInline
                    autoPlay
                    muted
                  />
                  {/* Scanning frame */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative border-2 border-purple-400 rounded-lg" style={{ width: '70%', height: '70%' }}>
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-purple-400 rounded-tl-lg"></div>
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-purple-400 rounded-tr-lg"></div>
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-purple-400 rounded-bl-lg"></div>
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-purple-400 rounded-br-lg"></div>
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              className="absolute top-3 right-3 p-2 bg-black/50 rounded-full z-10"
              aria-label="Close scanner"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* Actions bar — compact */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-900">
            <p className="text-xs text-gray-400">Point at barcode to scan</p>
            <Button onClick={handleClose} variant="secondary" size="sm">Cancel</Button>
          </div>

          {/* Supported Formats — desktop only */}
          <div className="hidden md:block px-4 py-2 bg-gray-800/50 border-t border-gray-700">
            <p className="text-xs text-gray-400 text-center">Supports: UPC, EAN, Code 128, Code 39, QR codes</p>
          </div>
        </div>
      )}
    </div>
  );
};
