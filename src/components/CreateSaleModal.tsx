import React, { useState } from 'react';
import { X, DollarSign } from 'lucide-react';
import { Button } from './ui/Button';
import type { Item } from '../types/item';
import type { MarketplaceType } from '../types/sale';

interface CreateSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: Item;
  onSaleCreated: (data: {
    saleDate: string;
    salePrice: number;
    costPrice: number;
    marketplace: MarketplaceType;
    marketplaceUrl?: string;
    notes?: string;
  }) => void;
}

export const CreateSaleModal: React.FC<CreateSaleModalProps> = ({
  isOpen,
  onClose,
  item,
  onSaleCreated,
}) => {
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [salePrice, setSalePrice] = useState((item.sellingPrice || 0).toFixed(2));
  const [costPrice, setCostPrice] = useState((item.costPrice || 0).toFixed(2));
  const [marketplace, setMarketplace] = useState<MarketplaceType>('ebay');
  const [marketplaceUrl, setMarketplaceUrl] = useState(item.ebayUrl || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onSaleCreated({
        saleDate: new Date(saleDate).toISOString(),
        salePrice: Math.round(parseFloat(salePrice) * 100),
        costPrice: Math.round(parseFloat(costPrice) * 100),
        marketplace,
        marketplaceUrl: marketplaceUrl || undefined,
        notes: notes || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to create sale:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const profit = parseFloat(salePrice) - parseFloat(costPrice);
  const profitMargin = parseFloat(salePrice) > 0 ? (profit / parseFloat(salePrice)) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg border border-gray-700 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gradient-to-r from-green-900/50 to-blue-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Record Sale</h2>
              <p className="text-sm text-gray-400 mt-0.5">Track this sale for analytics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Item Info */}
          <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-3">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-16 w-16 object-cover rounded"
                />
              )}
              <div>
                <div className="font-medium text-white">{item.name}</div>
                <div className="text-sm text-gray-400">Size: {item.size || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Sale Date */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Sale Date
            </label>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Sale Price */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Sale Price
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                required
                className="w-full pl-8 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Cost Price */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Cost Price
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                required
                className="w-full pl-8 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Profit Preview */}
          <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Profit:</span>
              <span className={`text-lg font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${profit.toFixed(2)} ({profitMargin.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* Marketplace */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Marketplace
            </label>
            <select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value as MarketplaceType)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ebay">eBay</option>
              <option value="poshmark">Poshmark</option>
              <option value="depop">Depop</option>
              <option value="in_person">In-Person</option>
            </select>
          </div>

          {/* Marketplace URL */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Marketplace URL (optional)
            </label>
            <input
              type="url"
              value={marketplaceUrl}
              onChange={(e) => setMarketplaceUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add any notes about this sale..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 bg-gray-800/50 flex items-center justify-end gap-3">
          <Button onClick={onClose} variant="ghost" disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="primary"
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting ? 'Recording...' : 'Record Sale'}
          </Button>
        </div>
      </div>
    </div>
  );
};
