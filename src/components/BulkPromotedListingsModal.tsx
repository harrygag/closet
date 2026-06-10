/**
 * Bulk Promoted Listings Manager
 * Enable/disable eBay Promoted Listings (ads) and set ad rates
 */

import { useState, useMemo } from 'react';
import { X, TrendingUp, DollarSign, BarChart3, AlertCircle, Info, Zap } from 'lucide-react';
import { Button } from './ui/Button';
import type { Item } from '../types/item';

interface BulkPromotedListingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  onUpdatePromotedListings: (action: 'enable' | 'disable' | 'update_rate', adRate?: number) => Promise<void>;
}

export const BulkPromotedListingsModal: React.FC<BulkPromotedListingsModalProps> = ({
  isOpen,
  onClose,
  items,
  onUpdatePromotedListings
}) => {
  const [action, setAction] = useState<'enable' | 'disable' | 'update_rate'>('enable');
  const [adRate, setAdRate] = useState(5); // Default 5% ad rate
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate estimated ad costs
  const estimatedCosts = useMemo(() => {
    const totalValue = items.reduce((sum, item) => sum + (item.sellingPrice || 0), 0) / 100;
    const estimatedSales = totalValue * 0.3; // Assume 30% sell rate
    const estimatedAdCost = estimatedSales * (adRate / 100);
    const estimatedRevenue = estimatedSales - estimatedAdCost;

    return {
      totalValue,
      estimatedSales,
      estimatedAdCost,
      estimatedRevenue,
      roi: estimatedAdCost > 0 ? ((estimatedSales / estimatedAdCost) - 1) * 100 : 0
    };
  }, [items, adRate]);

  const handleExecute = async () => {
    setIsProcessing(true);
    try {
      await onUpdatePromotedListings(action, action === 'enable' || action === 'update_rate' ? adRate : undefined);
      onClose();
    } catch (error) {
      console.error('Failed to update promoted listings:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gradient-to-r from-blue-900/50 to-purple-900/50">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-blue-400" />
              eBay Promoted Listings Manager
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {items.length} item{items.length !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="p-4 bg-blue-900/20 border-b border-gray-700">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-semibold mb-1">What are Promoted Listings?</p>
              <p className="text-blue-300">
                Promoted Listings are eBay's advertising solution. Your items appear higher in search results and on product pages.
                You only pay when your item sells. The ad rate is a percentage of the final sale price.
              </p>
            </div>
          </div>
        </div>

        {/* Action Selection */}
        <div className="p-6 border-b border-gray-700 bg-gray-800/30">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Select Action</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Enable */}
            <label
              className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                action === 'enable'
                  ? 'border-green-500 bg-green-900/30'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="action"
                value="enable"
                checked={action === 'enable'}
                onChange={(e) => setAction(e.target.value as any)}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-5 w-5 text-green-400" />
                  <span className="font-semibold text-white">Enable Ads</span>
                </div>
                <p className="text-xs text-gray-400">
                  Start promoting selected items
                </p>
              </div>
            </label>

            {/* Update Rate */}
            <label
              className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                action === 'update_rate'
                  ? 'border-blue-500 bg-blue-900/30'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="action"
                value="update_rate"
                checked={action === 'update_rate'}
                onChange={(e) => setAction(e.target.value as any)}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-5 w-5 text-blue-400" />
                  <span className="font-semibold text-white">Update Rate</span>
                </div>
                <p className="text-xs text-gray-400">
                  Change ad rate percentage
                </p>
              </div>
            </label>

            {/* Disable */}
            <label
              className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                action === 'disable'
                  ? 'border-red-500 bg-red-900/30'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="action"
                value="disable"
                checked={action === 'disable'}
                onChange={(e) => setAction(e.target.value as any)}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <X className="h-5 w-5 text-red-400" />
                  <span className="font-semibold text-white">Disable Ads</span>
                </div>
                <p className="text-xs text-gray-400">
                  Stop promoting selected items
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Ad Rate Slider (for enable/update) */}
          {(action === 'enable' || action === 'update_rate') && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Ad Rate (% of sale price)
                  </label>
                  <span className="text-2xl font-bold text-blue-400">{adRate}%</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="20"
                  step="0.5"
                  value={adRate}
                  onChange={(e) => setAdRate(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>2% (Min)</span>
                  <span>10% (Recommended)</span>
                  <span>20% (Max)</span>
                </div>
              </div>

              {/* Rate Recommendations */}
              <div className="bg-gray-800 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Rate Recommendations
                </h4>
                <div className="space-y-1 text-sm">
                  <p className="text-gray-400">
                    <span className="text-green-400 font-semibold">2-5%:</span> Low competition categories, already ranking well
                  </p>
                  <p className="text-gray-400">
                    <span className="text-blue-400 font-semibold">5-10%:</span> Most categories (recommended starting point)
                  </p>
                  <p className="text-gray-400">
                    <span className="text-orange-400 font-semibold">10-15%:</span> High competition, new listings
                  </p>
                  <p className="text-gray-400">
                    <span className="text-red-400 font-semibold">15-20%:</span> Very competitive niches, maximum visibility
                  </p>
                </div>
              </div>

              {/* Cost Estimation */}
              <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/30 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-blue-400" />
                  Estimated Costs & Performance
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Total Listing Value</p>
                    <p className="text-lg font-bold text-white">
                      ${estimatedCosts.totalValue.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Estimated Sales (30%)</p>
                    <p className="text-lg font-bold text-green-400">
                      ${estimatedCosts.estimatedSales.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Estimated Ad Cost</p>
                    <p className="text-lg font-bold text-red-400">
                      ${estimatedCosts.estimatedAdCost.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Net Revenue</p>
                    <p className="text-lg font-bold text-blue-400">
                      ${estimatedCosts.estimatedRevenue.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-blue-700/30">
                  <p className="text-xs text-gray-400">Estimated ROI</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {estimatedCosts.roi.toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Disable Confirmation */}
          {action === 'disable' && (
            <div className="bg-red-900/30 border border-red-600/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-200">
                  <p className="font-semibold mb-1">Disable Promoted Listings</p>
                  <p className="text-red-300">
                    This will stop promoting {items.length} item{items.length !== 1 ? 's' : ''}.
                    Your items will return to organic search positions. You can re-enable at any time.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Items Preview */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Items to {action === 'enable' ? 'Promote' : action === 'disable' ? 'Unpromote' : 'Update'} ({items.length})
            </h3>
            <div className="max-h-64 overflow-y-auto space-y-2 bg-gray-800/50 rounded-lg p-3">
              {items.slice(0, 10).map((item) => {
                const itemPrice = (item.sellingPrice || 0) / 100;
                const itemAdCost = itemPrice * (adRate / 100);

                return (
                  <div
                    key={item.id}
                    className="bg-gray-800 rounded-lg p-3 flex items-center justify-between gap-3 hover:bg-gray-750 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">
                        Price: ${itemPrice.toFixed(2)}
                        {(action === 'enable' || action === 'update_rate') && (
                          <span className="ml-2 text-orange-400">
                            " Ad cost: ${itemAdCost.toFixed(2)} ({adRate}%)
                          </span>
                        )}
                      </p>
                    </div>
                    {(action === 'enable' || action === 'update_rate') && (
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Net after ad</p>
                        <p className="text-sm font-semibold text-green-400">
                          ${(itemPrice - itemAdCost).toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length > 10 && (
                <p className="text-xs text-gray-500 text-center py-2">
                  ... and {items.length - 10} more
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-between">
            <Button
              onClick={onClose}
              disabled={isProcessing}
              className="bg-gray-700 hover:bg-gray-600 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExecute}
              disabled={isProcessing}
              className={`${
                action === 'enable' ? 'bg-green-600 hover:bg-green-700' :
                action === 'disable' ? 'bg-red-600 hover:bg-red-700' :
                'bg-blue-600 hover:bg-blue-700'
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
              ) : (
                <>
                  {action === 'enable' && `Enable Ads (${adRate}%)`}
                  {action === 'disable' && 'Disable Ads'}
                  {action === 'update_rate' && `Update to ${adRate}%`}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
