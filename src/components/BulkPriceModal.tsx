import { useState, useMemo } from 'react';
import { X, DollarSign, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { Button } from './ui/Button';
import type { Item } from '../types/item';

interface BulkPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  onUpdatePrices: (updates: { itemId: string; newPrice: number }[], relistToEbay: boolean) => Promise<void>;
}

interface PriceUpdate {
  itemId: string;
  currentPrice: number;
  newPrice: number;
  change: number;
  percentChange: number;
}

export const BulkPriceModal: React.FC<BulkPriceModalProps> = ({
  isOpen,
  onClose,
  items,
  onUpdatePrices
}) => {
  const [priceUpdates, setPriceUpdates] = useState<Map<string, number>>(new Map());
  const [bulkOperation, setBulkOperation] = useState<'set' | 'add' | 'subtract' | 'percent_add' | 'percent_subtract'>('set');
  const [bulkValue, setBulkValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [relistAfterUpdate, setRelistAfterUpdate] = useState(false);

  // Calculate price changes
  const updates = useMemo((): PriceUpdate[] => {
    return items.map(item => {
      const currentPrice = item.sellingPrice || 0;
      const newPrice = priceUpdates.get(item.id) ?? currentPrice;
      const change = newPrice - currentPrice;
      const percentChange = currentPrice > 0 ? (change / currentPrice) * 100 : 0;

      return {
        itemId: item.id,
        currentPrice,
        newPrice,
        change,
        percentChange
      };
    });
  }, [items, priceUpdates]);

  // Summary stats
  const stats = useMemo(() => {
    const totalCurrentValue = updates.reduce((sum, u) => sum + u.currentPrice, 0);
    const totalNewValue = updates.reduce((sum, u) => sum + u.newPrice, 0);
    const totalChange = totalNewValue - totalCurrentValue;
    const avgChange = totalChange / updates.length;
    const changedCount = updates.filter(u => u.change !== 0).length;

    return {
      totalCurrentValue,
      totalNewValue,
      totalChange,
      avgChange,
      changedCount
    };
  }, [updates]);

  // Suggested price strategies
  const applySuggestion = (strategy: 'round_up' | 'round_down' | 'profit_20' | 'profit_50') => {
    const newUpdates = new Map<string, number>();

    items.forEach(item => {
      const currentPrice = item.sellingPrice || 0;
      let suggestedPrice = currentPrice;

      switch (strategy) {
        case 'round_up':
          suggestedPrice = Math.ceil(currentPrice);
          break;
        case 'round_down':
          suggestedPrice = Math.floor(currentPrice);
          break;
        case 'profit_20':
          // 20% profit margin on cost
          suggestedPrice = (item.costPrice || 0) * 1.2;
          break;
        case 'profit_50':
          // 50% profit margin on cost
          suggestedPrice = (item.costPrice || 0) * 1.5;
          break;
      }

      newUpdates.set(item.id, Math.max(0.01, suggestedPrice));
    });

    setPriceUpdates(newUpdates);
  };

  // Apply bulk operation
  const applyBulkOperation = () => {
    const value = parseFloat(bulkValue);
    if (isNaN(value)) return;

    const newUpdates = new Map<string, number>();

    items.forEach(item => {
      const currentPrice = item.sellingPrice || 0;
      let newPrice = currentPrice;

      switch (bulkOperation) {
        case 'set':
          newPrice = value;
          break;
        case 'add':
          newPrice = currentPrice + value;
          break;
        case 'subtract':
          newPrice = currentPrice - value;
          break;
        case 'percent_add':
          newPrice = currentPrice * (1 + value / 100);
          break;
        case 'percent_subtract':
          newPrice = currentPrice * (1 - value / 100);
          break;
      }

      newUpdates.set(item.id, Math.max(0.01, newPrice));
    });

    setPriceUpdates(newUpdates);
    setBulkValue('');
  };

  // Update individual price
  const updateItemPrice = (itemId: string, price: number) => {
    const newUpdates = new Map(priceUpdates);
    newUpdates.set(itemId, Math.max(0.01, price));
    setPriceUpdates(newUpdates);
  };

  // Handle save
  const handleSave = async () => {
    const changedUpdates = updates.filter(u => u.change !== 0);
    if (changedUpdates.length === 0) return;

    setIsProcessing(true);
    try {
      await onUpdatePrices(
        changedUpdates.map(u => ({
          itemId: u.itemId,
          newPrice: u.newPrice
        })),
        relistAfterUpdate
      );
      onClose();
    } catch (error) {
      console.error('Failed to update prices:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gradient-to-r from-blue-900/50 to-purple-900/50">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <DollarSign className="h-6 w-6" />
              Bulk Price Manager
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {items.length} items • {stats.changedCount} changes
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Bulk Operations Toolbar */}
        <div className="p-4 border-b border-gray-700 bg-gray-800/50 space-y-3">
          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-400 font-semibold">Quick Actions:</span>
            <Button
              onClick={() => applySuggestion('round_up')}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              Round Up
            </Button>
            <Button
              onClick={() => applySuggestion('round_down')}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              <TrendingDown className="h-3 w-3 mr-1" />
              Round Down
            </Button>
            <Button
              onClick={() => applySuggestion('profit_20')}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white text-xs"
            >
              <Zap className="h-3 w-3 mr-1" />
              Cost + 20%
            </Button>
            <Button
              onClick={() => applySuggestion('profit_50')}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white text-xs"
            >
              <Zap className="h-3 w-3 mr-1" />
              Cost + 50%
            </Button>
          </div>

          {/* Bulk Operations */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-400 font-semibold">Bulk Operation:</span>
            <select
              value={bulkOperation}
              onChange={(e) => setBulkOperation(e.target.value as any)}
              className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
            >
              <option value="set">Set All To</option>
              <option value="add">Add $ to All</option>
              <option value="subtract">Subtract $ from All</option>
              <option value="percent_add">Increase All by %</option>
              <option value="percent_subtract">Decrease All by %</option>
            </select>
            <input
              type="number"
              step="0.01"
              placeholder={bulkOperation.includes('percent') ? '10' : '5.00'}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyBulkOperation()}
              className="w-32 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
            />
            <Button
              onClick={applyBulkOperation}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={!bulkValue}
            >
              Apply
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="p-4 border-b border-gray-700 bg-gray-800/30">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400">Current Total</p>
              <p className="text-lg font-bold text-white">${stats.totalCurrentValue.toFixed(2)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400">New Total</p>
              <p className="text-lg font-bold text-white">${stats.totalNewValue.toFixed(2)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400">Total Change</p>
              <p className={`text-lg font-bold ${stats.totalChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.totalChange >= 0 ? '+' : ''}${stats.totalChange.toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400">Avg Change</p>
              <p className={`text-lg font-bold ${stats.avgChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.avgChange >= 0 ? '+' : ''}${stats.avgChange.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {updates.map((update) => {
            const item = items.find(i => i.id === update.itemId)!;
            return (
              <div
                key={update.itemId}
                className="bg-gray-800 rounded-lg p-4 flex items-center gap-4 hover:bg-gray-750 transition-colors"
              >
                {/* Item Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">Cost: ${item.costPrice?.toFixed(2) || '0.00'}</p>
                </div>

                {/* Current Price */}
                <div className="text-right">
                  <p className="text-xs text-gray-400">Current</p>
                  <p className="text-sm font-semibold text-gray-300">${update.currentPrice.toFixed(2)}</p>
                </div>

                {/* Arrow */}
                <div className="text-gray-500">→</div>

                {/* New Price Input */}
                <div className="w-32">
                  <p className="text-xs text-gray-400 mb-1">New Price</p>
                  <input
                    type="number"
                    step="0.01"
                    value={update.newPrice.toFixed(2)}
                    onChange={(e) => updateItemPrice(update.itemId, parseFloat(e.target.value))}
                    className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm font-semibold"
                  />
                </div>

                {/* Change */}
                <div className="text-right w-24">
                  <p className="text-xs text-gray-400">Change</p>
                  <p className={`text-sm font-bold ${update.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {update.change >= 0 ? '+' : ''}${update.change.toFixed(2)}
                  </p>
                  <p className={`text-xs ${update.percentChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ({update.percentChange >= 0 ? '+' : ''}{update.percentChange.toFixed(1)}%)
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-700 bg-gray-800/50">
          {/* Relist Option */}
          <div className="mb-4 flex items-center gap-3 px-3 py-2 bg-orange-900/30 border border-orange-600/30 rounded-lg">
            <input
              type="checkbox"
              id="relist-checkbox"
              checked={relistAfterUpdate}
              onChange={(e) => setRelistAfterUpdate(e.target.checked)}
              className="w-4 h-4 text-orange-600 bg-gray-700 border-gray-600 rounded focus:ring-orange-500"
            />
            <label htmlFor="relist-checkbox" className="text-sm text-orange-200 cursor-pointer flex-1">
              🔄 Automatically relist items to eBay with new prices
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <Button
              onClick={onClose}
              disabled={isProcessing}
              className="bg-gray-700 hover:bg-gray-600 text-white"
            >
              Cancel
            </Button>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setPriceUpdates(new Map())}
                disabled={isProcessing || stats.changedCount === 0}
                className="bg-gray-700 hover:bg-gray-600 text-white"
              >
                Reset All
              </Button>
              <Button
                onClick={handleSave}
                disabled={isProcessing || stats.changedCount === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isProcessing ? 'Updating...' : `Update ${stats.changedCount} Price${stats.changedCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
