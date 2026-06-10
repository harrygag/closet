import React from 'react';
import { X, AlertCircle, DollarSign, Package, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from './ui/Button';

interface PriceChange {
  itemId: string;
  itemName: string;
  oldPrice: number;
  newPrice: number;
  change: number;
}

interface RelistItem {
  itemId: string;
  success: boolean;
  message?: string;
  listingData?: {
    sku: string;
    title: string;
    description?: string;
    imageUrls?: string[];
    price: number;
    categoryId: string;
    condition: string;
    itemSpecifics?: Record<string, string | string[]>;
  };
  estimatedPrice?: number;
}

export interface AIActionData {
  type: 'price_update' | 'relist';
  priceChanges?: PriceChange[];
  relistItems?: RelistItem[];
  message?: string;
}

interface AIActionConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (alsoRelist?: boolean) => void;
  actionData: AIActionData | null;
  isProcessing?: boolean;
}

export const AIActionConfirmationModal: React.FC<AIActionConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  actionData,
  isProcessing = false,
}) => {
  const [alsoRelist, setAlsoRelist] = React.useState(false);

  if (!isOpen || !actionData) return null;

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const renderPriceUpdatePreview = () => {
    if (!actionData.priceChanges) return null;

    const totalChange = actionData.priceChanges.reduce((sum, item) => sum + item.change, 0);
    const avgChange = totalChange / actionData.priceChanges.length;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-blue-400">
          <DollarSign className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Price Update Confirmation</h3>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total items:</span>
            <span className="text-white font-semibold">{actionData.priceChanges.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Average change:</span>
            <span className={`font-semibold flex items-center gap-1 ${avgChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {avgChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {formatPrice(Math.abs(avgChange))}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total change:</span>
            <span className={`font-semibold ${totalChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalChange >= 0 ? '+' : ''}{formatPrice(totalChange)}
            </span>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-2">
          {actionData.priceChanges.map((item) => (
            <div
              key={item.itemId}
              className="bg-gray-800 rounded-lg p-3 hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.itemName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">
                      {formatPrice(item.oldPrice)}
                    </span>
                    <span className="text-xs text-gray-500">→</span>
                    <span className="text-xs font-semibold text-white">
                      {formatPrice(item.newPrice)}
                    </span>
                  </div>
                </div>
                <div className={`text-xs font-semibold whitespace-nowrap ${item.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {item.change >= 0 ? '+' : ''}{formatPrice(item.change)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3 flex gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-yellow-200">
            <p className="font-semibold mb-1">Note:</p>
            <p>This will update prices in your database only. It will NOT update live eBay listings.</p>
          </div>
        </div>

        <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={alsoRelist}
              onChange={(e) => setAlsoRelist(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-blue-300 group-hover:text-blue-200 transition-colors">
                Also relist to eBay with new prices
              </div>
              <div className="text-xs text-blue-400 mt-1">
                After updating prices, automatically relist these {actionData.priceChanges.length} items to eBay using their stored listing data. This will create new active listings with the updated prices.
              </div>
            </div>
          </label>
        </div>
      </div>
    );
  };

  const renderRelistPreview = () => {
    if (!actionData.relistItems) return null;

    const successItems = actionData.relistItems.filter(item => item.success);
    const totalPrice = successItems.reduce((sum, item) => sum + (item.estimatedPrice || 0), 0);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-orange-400">
          <Package className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Relist to eBay Confirmation</h3>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Items ready to list:</span>
            <span className="text-white font-semibold">{successItems.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total listing value:</span>
            <span className="text-green-400 font-semibold">{formatPrice(totalPrice)}</span>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-2">
          {successItems.map((item) => (
            <div
              key={item.itemId}
              className="bg-gray-800 rounded-lg p-3 hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {item.listingData?.title || 'Untitled Item'}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span>SKU: {item.listingData?.sku}</span>
                    <span>•</span>
                    <span>{item.listingData?.condition}</span>
                  </div>
                </div>
                <div className="text-sm font-semibold text-green-400 whitespace-nowrap">
                  {formatPrice(item.estimatedPrice || 0)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-200">
            <p className="font-semibold mb-1">What happens next:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Items will be created in eBay Inventory</li>
              <li>Offers will be created for each item</li>
              <li>Listings will be published to eBay</li>
              <li>Listing fees may apply</li>
            </ul>
          </div>
        </div>

        {actionData.relistItems.some(item => !item.success) && (
          <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-3">
            <p className="text-xs text-red-200 font-semibold mb-2">
              {actionData.relistItems.filter(item => !item.success).length} item(s) cannot be relisted:
            </p>
            <ul className="text-xs text-red-300 space-y-1">
              {actionData.relistItems
                .filter(item => !item.success)
                .map((item, idx) => (
                  <li key={idx}>• {item.message || 'Unknown error'}</li>
                ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Confirm Action</h2>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {actionData.type === 'price_update' && renderPriceUpdatePreview()}
          {actionData.type === 'relist' && renderRelistPreview()}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-gray-800/50">
          <Button
            onClick={onClose}
            disabled={isProcessing}
            className="bg-gray-700 hover:bg-gray-600 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(actionData.type === 'price_update' ? alsoRelist : false)}
            disabled={isProcessing}
            className={`${
              actionData.type === 'price_update'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-orange-600 hover:bg-orange-700'
            } text-white`}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </span>
            ) : actionData.type === 'price_update' ? (
              alsoRelist ? 'Update Prices & Relist to eBay' : 'Update Prices'
            ) : (
              'Confirm & List to eBay'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
