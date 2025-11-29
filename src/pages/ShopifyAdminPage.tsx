import { useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, RefreshCw, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useItemStore } from '../store/useItemStore';
import { useAuthStore } from '../store/useAuthStore';

interface SyncResult {
  itemId: string;
  title: string;
  shopifyUrl?: string;
  error?: string;
}

export default function ShopifyAdminPage() {
  const { items } = useItemStore();
  const { user } = useAuthStore();
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingItems, setSyncingItems] = useState<Set<string>>(new Set());
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const activeItems = items.filter(item => item.status === 'Active');
  const syncedItems = items.filter(item => (item as any).shopify_product_id);
  const unsyncedItems = activeItems.filter(item => !(item as any).shopify_product_id);

  const syncItem = async (itemId: string) => {
    if (!user) return;

    setSyncingItems(prev => new Set(prev).add(itemId));

    try {
      const response = await fetch('/api/shopify/sync-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, userId: user.id })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Product synced to Shopify!', {
          description: data.shopifyUrl
        });
        
        setSyncResults(prev => [
          ...prev,
          { itemId, title: data.shopifyProduct.title, shopifyUrl: data.shopifyUrl }
        ]);
      } else {
        toast.error('Sync failed', { description: data.error });
        setSyncResults(prev => [
          ...prev,
          { itemId, title: 'Unknown', error: data.error }
        ]);
      }
    } catch (error) {
      toast.error('Sync failed');
      console.error(error);
    } finally {
      setSyncingItems(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const syncAllProducts = async () => {
    if (!user) return;

    setSyncingAll(true);
    setShowResults(true);
    setSyncResults([]);

    try {
      const response = await fetch('/api/shopify/sync-all-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Synced ${data.syncedCount} products to Shopify!`);
        setSyncResults([...(data.results || []), ...(data.errors || [])]);
      } else {
        toast.error('Bulk sync failed');
      }
    } catch (error) {
      toast.error('Bulk sync failed');
      console.error(error);
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            Shopify Store Manager
          </h1>
          <p className="text-gray-600">Sync your inventory to your Shopify storefront</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div
            className="bg-white rounded-2xl p-6 shadow-lg"
            whileHover={{ y: -4 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Active Items</p>
                <p className="text-3xl font-bold text-purple-600">{activeItems.length}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <Upload className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            className="bg-white rounded-2xl p-6 shadow-lg"
            whileHover={{ y: -4 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Synced to Shopify</p>
                <p className="text-3xl font-bold text-green-600">{syncedItems.length}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            className="bg-white rounded-2xl p-6 shadow-lg"
            whileHover={{ y: -4 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Not Synced</p>
                <p className="text-3xl font-bold text-orange-600">{unsyncedItems.length}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <XCircle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-2xl p-6 shadow-lg mb-8">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="flex gap-4">
            <button
              onClick={syncAllProducts}
              disabled={syncingAll || unsyncedItems.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncingAll ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Sync All Unsynced Items ({unsyncedItems.length})
                </>
              )}
            </button>

            <a
              href="/shop"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-purple-500 text-purple-600 rounded-xl font-semibold hover:bg-purple-50 transition-colors"
            >
              <ExternalLink className="w-5 h-5" />
              View Storefront
            </a>
          </div>
        </div>

        {/* Sync Results */}
        {showResults && syncResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-6 shadow-lg mb-8"
          >
            <h2 className="text-xl font-semibold mb-4">Sync Results</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {syncResults.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg flex items-center justify-between ${
                    result.error ? 'bg-red-50' : 'bg-green-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {result.error ? (
                      <XCircle className="w-5 h-5 text-red-500" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                    <span className="font-medium">{result.title}</span>
                  </div>
                  {result.shopifyUrl ? (
                    <a
                      href={result.shopifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-700 flex items-center gap-1"
                    >
                      View <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : result.error ? (
                    <span className="text-red-600 text-sm">{result.error}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Unsynced Items */}
        {unsyncedItems.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Unsynced Items</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {unsyncedItems.map(item => (
                <div
                  key={item.id}
                  className="border border-gray-200 rounded-xl p-4 hover:border-purple-300 transition-colors"
                >
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-32 object-cover rounded-lg mb-3"
                    />
                  )}
                  <h3 className="font-semibold mb-1 line-clamp-2">{item.name}</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    ${item.sellingPrice.toFixed(2)} • {item.size}
                  </p>
                  <button
                    onClick={() => syncItem(item.id)}
                    disabled={syncingItems.has(item.id)}
                    className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncingItems.has(item.id) ? (
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                    ) : (
                      'Sync to Shopify'
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

