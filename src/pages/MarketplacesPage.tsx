/**
 * eBay Buyer Offers Page
 * Send promotional offers to buyers watching your items
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, RefreshCw, Send, CheckSquare, Square, Clock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { toast } from 'sonner';
import { useEbayAuth } from '../hooks/useEbayAuth';
import { ebayService } from '../services/ebayService';
import { collection, getDocs, query, where, getFirestore, addDoc, Timestamp } from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import { Item } from '../types/item';
import { useAuthStore } from '../store/useAuthStore';

const db = getFirestore(app);

interface ItemWithEngagement extends Item {
  watchCount?: number;
  suggestedDiscount?: number;
  isLoading?: boolean;
  isSelected?: boolean;
  customOfferPrice?: number; // Custom offer price in cents
  liveCurrentPrice?: number; // ACTUAL live eBay price in cents
  currentOfferPrice?: number; // Current Best Offer auto-accept price in cents
  bestOfferEnabled?: boolean; // Is Best Offer currently enabled?
  ebayFullTitle?: string; // eBay full title for fallback
  lastOfferSent?: Date; // Last time offer was sent to this item
  canSendOffer?: boolean; // Can send offer (not sent recently)
}

interface OfferLog {
  id?: string;
  timestamp: Date;
  itemId: string;
  itemName: string;
  itemImage?: string;
  originalPrice?: number; // In cents
  offerPrice: number; // In cents
  discount?: number;
  recipientCount?: number;
  watchersReached?: number;
  discountPercent?: number;
  success: boolean;
  error?: string;
  errorMessage?: string;
  // eBay-specific fields
  buyerUserId?: string;
  buyerMessage?: string;
  expirationTime?: string;
  status?: string;
}

const formatCurrency = (cents: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
};

export default function MarketplacesPage() {
  const { isConnected, isLoading: authLoading } = useEbayAuth();
  const { user } = useAuthStore();
  const [items, setItems] = useState<ItemWithEngagement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(10);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'send' | 'logs'>('send');
  const [offerLogs, setOfferLogs] = useState<OfferLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (isConnected && user) {
      loadItemsWithBuyers();
      loadOfferLogs();
    }
  }, [isConnected, user]);

  const loadOfferLogs = async () => {
    if (!user) return;

    setLogsLoading(true);
    try {
      // Get all eBay items for this user to get item IDs
      const itemsRef = collection(db, 'Item');
      const itemsQuery = query(
        itemsRef,
        where('user_uuid', '==', user.id),
        where('ebayListingId', '!=', null)
      );
      const itemsSnapshot = await getDocs(itemsQuery);

      const ebayItemIds = itemsSnapshot.docs
        .map(doc => {
          const data = doc.data();
          return data.ebayListingId || data.ebayItemId;
        })
        .filter(id => id) as string[];

      if (ebayItemIds.length === 0) {
        setOfferLogs([]);
        toast.info('No eBay items found');
        return;
      }

      // Get actual buyer offers from eBay
      const result = await ebayService.getBuyerOffers(ebayItemIds);

      // Transform eBay offers to OfferLog format
      const logs: OfferLog[] = result.offers.map((offer: any) => ({
        id: offer.offerId,
        timestamp: offer.expirationTime ? new Date(offer.expirationTime) : new Date(),
        itemId: offer.itemId,
        itemName: offer.itemTitle || 'eBay Item',
        itemImage: undefined,
        originalPrice: 0, // We don't have the original price from GetBestOffers
        offerPrice: Math.round(offer.price * 100), // Convert to cents
        discount: 0, // Calculate if needed
        recipientCount: 1,
        success: offer.status === 'Active',
        error: offer.status !== 'Active' ? offer.status : undefined,
        buyerUserId: offer.buyerUserId,
        buyerMessage: offer.buyerMessage,
        expirationTime: offer.expirationTime,
        status: offer.status
      }));

      setOfferLogs(logs);
      toast.success(`Loaded ${logs.length} active buyer offer(s) from eBay`);
    } catch (error: any) {
      console.error('Failed to load buyer offers from eBay:', error);
      toast.error('Failed to load buyer offers');
    } finally {
      setLogsLoading(false);
    }
  };

  const loadItemsWithBuyers = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Step 1: Fetch all eBay items from Firestore
      const itemsRef = collection(db, 'Item');
      const q = query(itemsRef, where('user_uuid', '==', user.id));
      const snapshot = await getDocs(q);
      const fetchedItems = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Item));

      const ebayItems = fetchedItems.filter(item => item.ebayListingId || item.ebayItemId);

      if (ebayItems.length === 0) {
        setItems([]);
        toast.info('No eBay items found. Import eBay items first.');
        setIsLoading(false);
        return;
      }

      toast.info(`🚀 Loading buyer data for ${ebayItems.length} items...`);

      // Step 2: Get all item IDs and fetch watcher counts
      const itemIds = ebayItems
        .map(item => item.ebayListingId || item.ebayItemId)
        .filter(id => id) as string[];

      if (itemIds.length === 0) {
        toast.error('No valid eBay item IDs found');
        setIsLoading(false);
        return;
      }

      // Step 2a: Check for recent offers (last 24 hours) to prevent duplicates
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const recentOffersRef = collection(db, 'OfferLog');
      const recentOffersQuery = query(
        recentOffersRef,
        where('user_uuid', '==', user.id),
        where('timestamp', '>=', Timestamp.fromDate(twentyFourHoursAgo)),
        where('success', '==', true)
      );
      const recentOffersSnapshot = await getDocs(recentOffersQuery);

      // Map item IDs to their last offer timestamp
      const recentOffersMap = new Map<string, Date>();
      recentOffersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const itemId = data.itemId;
        const timestamp = data.timestamp?.toDate();
        if (itemId && timestamp) {
          const existing = recentOffersMap.get(itemId);
          if (!existing || timestamp > existing) {
            recentOffersMap.set(itemId, timestamp);
          }
        }
      });

      // BULK LOAD - 10x FASTER!
      const result = await ebayService.getBulkWatchers(itemIds);

      // Step 3: Map results back to items
      const resultMap = new Map(result.results.map((r: any) => [r.itemId, r]));

      const updatedItems = ebayItems.map(item => {
        const itemId = item.ebayListingId || item.ebayItemId;
        const data = itemId ? resultMap.get(itemId) : null;
        const lastOfferSent = itemId ? recentOffersMap.get(itemId) : undefined;
        const canSendOffer = !lastOfferSent; // Can only send if no offer in last 24 hours

        if (data && typeof data === 'object') {
          const ebayData = data as any;
          return {
            ...item,
            watchCount: ebayData.watchCount || 0,
            suggestedDiscount: ebayData.suggestedDiscount || 10,
            liveCurrentPrice: ebayData.currentPrice ? Math.round(ebayData.currentPrice * 100) : item.sellingPrice,
            currentOfferPrice: ebayData.currentOfferPrice != null ? Math.round(ebayData.currentOfferPrice * 100) : undefined,
            bestOfferEnabled: ebayData.bestOfferEnabled || false,
            lastOfferSent,
            canSendOffer,
            isSelected: false,
          };
        }
        return {
          ...item,
          watchCount: 0,
          suggestedDiscount: 10,
          liveCurrentPrice: item.sellingPrice,
          currentOfferPrice: undefined,
          bestOfferEnabled: false,
          lastOfferSent,
          canSendOffer,
          isSelected: false
        };
      });

      // Step 4: Show ALL eBay items (Best Offer works even without watchers!)
      setItems(updatedItems);

      const itemsWithWatchers = updatedItems.filter(i => (i.watchCount || 0) > 0).length;
      toast.success(`✅ Loaded ${updatedItems.length} items (${itemsWithWatchers} have watchers, ${result.totalWatchers} total watchers)`);
    } catch (error: any) {
      console.error('Failed to load items with buyers:', error);
      toast.error(error.message || 'Failed to load items with buyers');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelectAll = () => {
    const allSelected = items.every(i => i.isSelected);
    setItems(items.map(item => ({ ...item, isSelected: !allSelected })));
  };

  const toggleItem = (itemId: string) => {
    setItems(items.map(item =>
      item.id === itemId ? { ...item, isSelected: !item.isSelected } : item
    ));
  };

  const getOfferPrice = (item: ItemWithEngagement): number => {
    // Priority: 1. Custom price, 2. Current offer price, 3. Calculate from discount
    if (item.customOfferPrice && item.customOfferPrice > 0) {
      return item.customOfferPrice / 100; // Convert cents to dollars
    }
    if (item.currentOfferPrice && item.currentOfferPrice > 0) {
      return item.currentOfferPrice / 100; // Use existing Best Offer price
    }
    const discountToUse = item.suggestedDiscount || discountPercent;
    const priceToUse = item.liveCurrentPrice || item.sellingPrice; // Use LIVE eBay price
    return (priceToUse / 100) * (1 - discountToUse / 100);
  };

  const sendOffersToWatchers = async () => {
    const selectedItems = items.filter(i => i.isSelected);

    if (selectedItems.length === 0) {
      toast.error('Please select at least one item');
      return;
    }

    // Check if any selected items have watchers AND can send offers (not sent recently)
    const itemsWithWatchers = selectedItems.filter(i => (i.watchCount || 0) > 0 && i.canSendOffer);

    if (itemsWithWatchers.length === 0) {
      const hasWatchersButCantSend = selectedItems.some(i => (i.watchCount || 0) > 0 && !i.canSendOffer);
      if (hasWatchersButCantSend) {
        toast.error('Selected items already received offers in the last 24 hours. Cannot send duplicate offers.');
      } else {
        toast.error('None of the selected items have watchers! Offers can only be sent to watchers.');
      }
      return;
    }

    const selectedWatchers = itemsWithWatchers.reduce((sum, i) => sum + (i.watchCount || 0), 0);

    setIsBulkLoading(true);
    toast.info(`📧 Sending promotional offers directly to ${selectedWatchers} watchers...`);

    try {
      // Prepare items for sending to watchers
      const bulkItems = itemsWithWatchers
        .map(item => ({
          itemId: item.ebayListingId || item.ebayItemId,
          offerPrice: getOfferPrice(item),
          message: undefined // Uses default message
        }))
        .filter(item => item.itemId) as Array<{itemId: string, offerPrice: number, message?: string}>;

      // Send promotional offers to watchers
      const result = await ebayService.sendOffersToWatchers(bulkItems);

      // Save logs to Firestore
      const logsRef = collection(db, 'OfferLog');
      const logPromises = itemsWithWatchers.map(async (item) => {
        const itemResult = result.results?.find((r: any) => r.itemId === (item.ebayListingId || item.ebayItemId));
        const offerPrice = getOfferPrice(item);
        const originalPrice = item.liveCurrentPrice || item.sellingPrice;

        const logData: any = {
          user_uuid: user!.id,
          timestamp: Timestamp.now(),
          itemId: item.ebayListingId || item.ebayItemId || '',
          itemName: item.name || item.ebayFullTitle || `Item ${item.ebayListingId || item.ebayItemId || item.id}`,
          itemImage: item.imageUrl || '',
          originalPrice: originalPrice,
          offerPrice: Math.round(offerPrice * 100),
          watchersReached: itemResult?.watchersReached || item.watchCount || 0,
          discountPercent: Math.round(((originalPrice - offerPrice * 100) / originalPrice) * 100),
          success: itemResult?.success || false,
        };

        // Only add errorMessage if it exists
        if (itemResult?.error) {
          logData.errorMessage = itemResult.error;
        }

        return addDoc(logsRef, logData);
      });

      await Promise.all(logPromises);
      await loadOfferLogs(); // Refresh logs

      setIsBulkLoading(false);

      toast.success(
        `🎉 OFFERS SENT! Promotional offers delivered to ${result.totalWatchersReached} buyers!\n` +
        `✅ ${result.successCount} items\n` +
        (result.failCount > 0 ? `❌ ${result.failCount} failed` : ''),
        { duration: 8000 }
      );
    } catch (error: any) {
      console.error('Failed to send offers to watchers:', error);
      toast.error(error.message || 'Failed to send offers to watchers');
      setIsBulkLoading(false);
    }
  };

  const enableBestOffer = async () => {
    const selectedItems = items.filter(i => i.isSelected);

    if (selectedItems.length === 0) {
      toast.error('Please select at least one item');
      return;
    }

    setIsBulkLoading(true);
    toast.info(`🔧 Enabling Best Offer on ${selectedItems.length} items...`);

    try {
      // Prepare items for bulk sending with custom prices
      const bulkItems = selectedItems
        .map(item => ({
          itemId: item.ebayListingId || item.ebayItemId,
          offerPrice: getOfferPrice(item),
          originalPrice: (item.liveCurrentPrice || item.sellingPrice) / 100
        }))
        .filter(item => item.itemId) as Array<{itemId: string, offerPrice: number, originalPrice: number}>;

      // Enable Best Offer with custom auto-accept prices
      const result = await ebayService.sendBulkOffersWithPrices(bulkItems);

      // Save logs to Firestore
      const logsRef = collection(db, 'OfferLog');
      const logPromises = selectedItems.map(async (item) => {
        const itemResult = result.results?.find((r: any) => r.itemId === (item.ebayListingId || item.ebayItemId));
        const offerPrice = getOfferPrice(item);
        const originalPrice = item.liveCurrentPrice || item.sellingPrice;

        const logData: any = {
          user_uuid: user!.id,
          timestamp: Timestamp.now(),
          itemId: item.ebayListingId || item.ebayItemId || '',
          itemName: item.name || item.ebayFullTitle || `Item ${item.ebayListingId || item.ebayItemId || item.id}`,
          itemImage: item.imageUrl || '',
          originalPrice: originalPrice,
          offerPrice: Math.round(offerPrice * 100),
          watchersReached: 0, // Best Offer doesn't send to anyone
          discountPercent: Math.round(((originalPrice - offerPrice * 100) / originalPrice) * 100),
          success: itemResult?.success || false,
        };

        // Only add errorMessage if it exists
        if (itemResult?.error) {
          logData.errorMessage = itemResult.error;
        }

        return addDoc(logsRef, logData);
      });

      await Promise.all(logPromises);
      await loadOfferLogs(); // Refresh logs

      setIsBulkLoading(false);

      toast.success(
        `🎉 SUCCESS! Best Offer enabled on ${result.successCount} items!\n` +
        `Buyers can now make offers (auto-accept at your prices)\n` +
        (result.failCount > 0 ? `❌ ${result.failCount} failed` : ''),
        { duration: 8000 }
      );
    } catch (error: any) {
      console.error('Failed to enable Best Offer:', error);
      toast.error(error.message || 'Failed to enable Best Offer');
      setIsBulkLoading(false);
    }
  };

  const selectedCount = items.filter(i => i.isSelected).length;
  const selectedWatchers = items
    .filter(i => i.isSelected)
    .reduce((sum, i) => sum + (i.watchCount || 0), 0);

  if (!isConnected && !authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Connect Your eBay Account</h2>
              <p className="text-gray-400 mb-6">
                You need to connect your eBay account to send offers.
              </p>
              <Button
                onClick={() => window.location.href = '/ebay'}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Go to eBay Integration
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              >
                📧
              </motion.span>
              eBay Offers
            </h1>
            <p className="text-gray-400">
              Send promotional offers to buyers watching your eBay items
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={loadItemsWithBuyers}
              disabled={isLoading || isBulkLoading}
              variant="secondary"
              className="bg-gray-800 border-gray-600 text-white hover:bg-gray-700"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-700">
          <button
            type="button"
            onClick={() => setActiveTab('send')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'send'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Send className="inline-block mr-2 h-4 w-4" />
            Send Offers
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'logs'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Clock className="inline-block mr-2 h-4 w-4" />
            Offer Logs ({offerLogs.length})
          </button>
        </div>

        {/* Send Offers Tab */}
        {activeTab === 'send' && (
          <>
        {/* Action Bar */}
        {items.length > 0 && (
          <Card className="bg-gray-800 border-gray-700 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="discount-input" className="text-sm text-gray-300">Discount %:</label>
                  <input
                    id="discount-input"
                    type="number"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value))}
                    min="5"
                    max="50"
                    className="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    aria-label="Discount percentage"
                  />
                </div>

                <div className="flex items-center gap-4">
                  {selectedCount > 0 && (
                    <span className="text-sm text-gray-300">
                      {selectedCount} selected ({selectedWatchers} watchers)
                    </span>
                  )}
                  <Button
                    onClick={sendOffersToWatchers}
                    disabled={selectedCount === 0 || isBulkLoading || selectedWatchers === 0}
                    className="bg-green-600 hover:bg-green-700"
                    title="Send promotional offers directly to buyers watching your items"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    📧 Send to Watchers ({selectedWatchers})
                  </Button>
                  <Button
                    onClick={enableBestOffer}
                    disabled={selectedCount === 0 || isBulkLoading}
                    className="bg-blue-600 hover:bg-blue-700"
                    title="Enable Best Offer feature (allows buyers to make offers)"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Enable Best Offer ({selectedCount})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items Table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading items...</p>
          </div>
        ) : items.length === 0 ? (
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">No eBay Items Found</h2>
              <p className="text-gray-400 mb-4">
                Import your eBay items first to send offers.
              </p>
              <Button
                onClick={() => window.location.href = '/ebay'}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Go to eBay Integration
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900/50 border-b border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="text-gray-400 hover:text-white"
                        >
                          {items.every(i => i.isSelected) ? (
                            <CheckSquare className="h-5 w-5" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Image</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Item</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Current Price</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Your Offer Price</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Watchers</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Potential Buyers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {items.map((item) => {
                      const hasRecentOffer = !item.canSendOffer;
                      const canSelect = item.canSendOffer;

                      return (
                      <tr
                        key={item.id}
                        className={`hover:bg-gray-700/50 ${item.isSelected ? 'bg-blue-900/20' : ''} ${hasRecentOffer ? 'opacity-60' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => canSelect && toggleItem(item.id)}
                            className={`text-gray-400 ${canSelect ? 'hover:text-white cursor-pointer' : 'cursor-not-allowed'}`}
                            disabled={!canSelect}
                            title={hasRecentOffer ? 'Offer already sent in last 24 hours' : 'Select item'}
                          >
                            {item.isSelected ? (
                              <CheckSquare className="h-5 w-5 text-blue-400" />
                            ) : (
                              <Square className="h-5 w-5" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-12 h-12 object-cover rounded"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-white font-medium">{item.name}</div>
                          <div className="text-xs text-gray-400">{item.size}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="text-green-400 font-semibold">
                              {formatCurrency(item.liveCurrentPrice || item.sellingPrice)}
                            </div>
                            {item.liveCurrentPrice && item.liveCurrentPrice !== item.sellingPrice && (
                              <div className="text-xs text-gray-500 line-through">
                                {formatCurrency(item.sellingPrice)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="1"
                              value={(getOfferPrice(item)).toFixed(2)}
                              onChange={(e) => {
                                const price = parseFloat(e.target.value);
                                if (!isNaN(price) && price > 0) {
                                  setItems(items.map(i =>
                                    i.id === item.id ? { ...i, customOfferPrice: Math.round(price * 100) } : i
                                  ));
                                }
                              }}
                              className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                              aria-label={`Offer price for ${item.name}`}
                            />
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-400">
                                ({item.suggestedDiscount}% off)
                              </span>
                              {item.bestOfferEnabled && (
                                <span className="text-xs text-blue-400">
                                  ✓ Active
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{item.watchCount}</span>
                            {hasRecentOffer && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/50 text-orange-400 border border-orange-600/30">
                                Offer sent {item.lastOfferSent ? new Date(item.lastOfferSent).toLocaleDateString() : 'recently'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {hasRecentOffer ? (
                            <span className="text-gray-500 text-sm">
                              Must wait 24 hours between offers
                            </span>
                          ) : (
                            <span className="text-blue-400 font-medium">
                              {item.watchCount} watchers + all Best Offer buyers
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
          </>
        )}

        {/* Offer Logs Tab */}
        {activeTab === 'logs' && (
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-0">
              {logsLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Loading offer logs...</p>
                </div>
              ) : offerLogs.length === 0 ? (
                <div className="p-12 text-center">
                  <Clock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-white mb-2">No Offer Logs Yet</h2>
                  <p className="text-gray-400">
                    Send some offers and they'll appear here!
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-900/50 border-b border-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Expiration</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Item</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Buyer Offer</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Buyer</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Message</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {offerLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-700/50">
                          <td className="px-4 py-3">
                            <div className="text-white text-sm">
                              {log.expirationTime ? new Date(log.expirationTime).toLocaleDateString() : 'N/A'}
                            </div>
                            <div className="text-xs text-gray-400">
                              {log.expirationTime ? new Date(log.expirationTime).toLocaleTimeString() : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {log.itemImage && (
                                <img
                                  src={log.itemImage}
                                  alt={log.itemName}
                                  className="w-10 h-10 object-cover rounded"
                                />
                              )}
                              <div>
                                <div className="text-white font-medium text-sm">{log.itemName}</div>
                                <div className="text-xs text-gray-400">ID: {log.itemId}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-green-400 font-semibold text-lg">
                            {formatCurrency(log.offerPrice)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-white text-sm">
                              {log.buyerUserId || 'Anonymous'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-gray-300 text-sm max-w-xs truncate" title={log.buyerMessage}>
                              {log.buyerMessage || 'No message'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {log.status === 'Active' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900 text-green-300">
                                ✓ Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
                                {log.status || 'Unknown'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
