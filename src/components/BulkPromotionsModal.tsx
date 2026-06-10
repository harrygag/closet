import { useState, useMemo } from 'react';
import { X, Tag, Calendar, DollarSign, Package, TrendingDown, Truck, Percent } from 'lucide-react';
import { Button } from './ui/Button';
import type { Item } from '../types/item';

interface BulkPromotionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  onCreatePromotion: (promotionData: {
    type: 'markdown' | 'order_discount' | 'volume' | 'shipping';
    name: string;
    discount: number;
    startDate?: string;
    endDate?: string;
    minPurchase?: number;
  }) => Promise<void>;
}

type PromotionType = 'markdown' | 'order_discount' | 'volume' | 'shipping';

interface ValidationError {
  field: string;
  message: string;
}

export const BulkPromotionsModal: React.FC<BulkPromotionsModalProps> = ({
  isOpen,
  onClose,
  items,
  onCreatePromotion
}) => {
  const [activeTab, setActiveTab] = useState<PromotionType>('markdown');
  const [promotionName, setPromotionName] = useState('');
  const [discount, setDiscount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minPurchase, setMinPurchase] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  // Promotion type configurations
  const promotionTypes = {
    markdown: {
      icon: Percent,
      label: 'Markdown Sale',
      description: 'Percentage off selected items',
      discountLabel: 'Discount Percentage',
      discountSuffix: '%',
      minLabel: 'Minimum Purchase (optional)',
      showMinPurchase: false
    },
    order_discount: {
      icon: DollarSign,
      label: 'Order Discount',
      description: 'Spend $X save $Y',
      discountLabel: 'Discount Amount ($)',
      discountSuffix: '$',
      minLabel: 'Minimum Purchase Required ($)',
      showMinPurchase: true
    },
    volume: {
      icon: Package,
      label: 'Volume Pricing',
      description: 'Buy 2+ get discount',
      discountLabel: 'Discount Percentage',
      discountSuffix: '%',
      minLabel: 'Minimum Quantity',
      showMinPurchase: true
    },
    shipping: {
      icon: Truck,
      label: 'Free Shipping',
      description: 'Free shipping promotion',
      discountLabel: 'Min Order for Free Shipping ($)',
      discountSuffix: '$',
      minLabel: '',
      showMinPurchase: false
    }
  };

  const activeConfig = promotionTypes[activeTab];

  // Calculate potential savings
  const estimatedImpact = useMemo(() => {
    const discountValue = parseFloat(discount) || 0;
    const totalValue = items.reduce((sum, item) => sum + (item.sellingPrice || 0), 0);

    let estimatedDiscount = 0;
    if (activeTab === 'markdown') {
      estimatedDiscount = (totalValue * discountValue) / 100;
    } else if (activeTab === 'order_discount') {
      estimatedDiscount = discountValue;
    } else if (activeTab === 'volume') {
      // Assume 30% of buyers purchase 2+ items
      estimatedDiscount = (totalValue * 0.3 * discountValue) / 100;
    } else if (activeTab === 'shipping') {
      // Estimate based on average shipping cost
      estimatedDiscount = 5.99; // Average shipping cost
    }

    return {
      totalValue,
      estimatedDiscount,
      newValue: totalValue - estimatedDiscount
    };
  }, [items, discount, activeTab]);

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: ValidationError[] = [];

    if (!promotionName.trim()) {
      newErrors.push({ field: 'name', message: 'Promotion name is required' });
    }

    if (promotionName.length > 90) {
      newErrors.push({ field: 'name', message: 'Name must be 90 characters or less' });
    }

    if (activeTab !== 'shipping' && !discount) {
      newErrors.push({ field: 'discount', message: 'Discount value is required' });
    }

    const discountValue = parseFloat(discount);
    if (activeTab === 'markdown' || activeTab === 'volume') {
      if (discountValue <= 0 || discountValue > 80) {
        newErrors.push({ field: 'discount', message: 'Discount must be between 0-80%' });
      }
    }

    if (activeTab === 'order_discount' && discountValue <= 0) {
      newErrors.push({ field: 'discount', message: 'Discount amount must be greater than 0' });
    }

    if (activeTab === 'shipping') {
      const minValue = parseFloat(discount);
      if (minValue < 0) {
        newErrors.push({ field: 'discount', message: 'Minimum order must be 0 or greater' });
      }
    }

    if (activeConfig.showMinPurchase && minPurchase) {
      const minValue = parseFloat(minPurchase);
      if (minValue <= 0) {
        newErrors.push({ field: 'minPurchase', message: 'Minimum must be greater than 0' });
      }
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end <= start) {
        newErrors.push({ field: 'dates', message: 'End date must be after start date' });
      }
    }

    if (startDate) {
      const start = new Date(startDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (start < now) {
        newErrors.push({ field: 'startDate', message: 'Start date cannot be in the past' });
      }
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  // Get error for field
  const getError = (field: string): string | undefined => {
    return errors.find(e => e.field === field)?.message;
  };

  // Handle create promotion
  const handleCreatePromotion = async () => {
    if (!validateForm()) return;

    setIsProcessing(true);
    try {
      await onCreatePromotion({
        type: activeTab,
        name: promotionName.trim(),
        discount: parseFloat(discount),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        minPurchase: minPurchase ? parseFloat(minPurchase) : undefined
      });

      // Reset form
      setPromotionName('');
      setDiscount('');
      setStartDate('');
      setEndDate('');
      setMinPurchase('');
      setErrors([]);

      onClose();
    } catch (error) {
      console.error('Failed to create promotion:', error);
      setErrors([{ field: 'general', message: 'Failed to create promotion. Please try again.' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Quick preset functions
  const applyPreset = (type: 'flash_sale' | 'weekend' | 'clearance' | 'bogo') => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    switch (type) {
      case 'flash_sale':
        setPromotionName('Flash Sale - Limited Time!');
        setActiveTab('markdown');
        setDiscount('20');
        setStartDate(now.toISOString().split('T')[0]);
        const flashEnd = new Date(now);
        flashEnd.setDate(flashEnd.getDate() + 2);
        setEndDate(flashEnd.toISOString().split('T')[0]);
        break;
      case 'weekend':
        setPromotionName('Weekend Special');
        setActiveTab('markdown');
        setDiscount('15');
        const nextFriday = new Date(now);
        nextFriday.setDate(nextFriday.getDate() + ((5 - now.getDay() + 7) % 7));
        setStartDate(nextFriday.toISOString().split('T')[0]);
        const sunday = new Date(nextFriday);
        sunday.setDate(sunday.getDate() + 2);
        setEndDate(sunday.toISOString().split('T')[0]);
        break;
      case 'clearance':
        setPromotionName('Clearance Event - Big Savings');
        setActiveTab('markdown');
        setDiscount('30');
        setStartDate(now.toISOString().split('T')[0]);
        const clearanceEnd = new Date(now);
        clearanceEnd.setDate(clearanceEnd.getDate() + 14);
        setEndDate(clearanceEnd.toISOString().split('T')[0]);
        break;
      case 'bogo':
        setPromotionName('Buy 2 Get 10% Off');
        setActiveTab('volume');
        setDiscount('10');
        setMinPurchase('2');
        setStartDate(now.toISOString().split('T')[0]);
        const bogoEnd = new Date(now);
        bogoEnd.setDate(bogoEnd.getDate() + 7);
        setEndDate(bogoEnd.toISOString().split('T')[0]);
        break;
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
              <Tag className="h-6 w-6" />
              Create eBay Promotion
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {items.length} item{items.length !== 1 ? 's' : ''} selected
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

        {/* Quick Presets */}
        <div className="p-4 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-400 font-semibold">Quick Presets:</span>
            <Button
              onClick={() => applyPreset('flash_sale')}
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white text-xs"
            >
              <TrendingDown className="h-3 w-3 mr-1" />
              Flash Sale (20%)
            </Button>
            <Button
              onClick={() => applyPreset('weekend')}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              <Calendar className="h-3 w-3 mr-1" />
              Weekend (15%)
            </Button>
            <Button
              onClick={() => applyPreset('clearance')}
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs"
            >
              <Percent className="h-3 w-3 mr-1" />
              Clearance (30%)
            </Button>
            <Button
              onClick={() => applyPreset('bogo')}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white text-xs"
            >
              <Package className="h-3 w-3 mr-1" />
              Volume (Buy 2+)
            </Button>
          </div>
        </div>

        {/* Promotion Type Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-800/30">
          {(Object.keys(promotionTypes) as PromotionType[]).map((type) => {
            const config = promotionTypes[type];
            const Icon = config.icon;
            const isActive = activeTab === type;

            return (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'text-blue-400 border-blue-500 bg-blue-900/20'
                    : 'text-gray-400 border-transparent hover:text-gray-300 hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{config.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Promotion Info */}
          <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-lg p-4 border border-blue-800/30">
            <div className="flex items-start gap-3">
              {(() => {
                const Icon = activeConfig.icon;
                return <Icon className="h-5 w-5 text-blue-400 mt-0.5" />;
              })()}
              <div>
                <h3 className="text-white font-semibold">{activeConfig.label}</h3>
                <p className="text-sm text-gray-400">{activeConfig.description}</p>
              </div>
            </div>
          </div>

          {/* General Errors */}
          {getError('general') && (
            <div className="bg-red-900/30 border border-red-600/30 rounded-lg p-3">
              <p className="text-sm text-red-200">{getError('general')}</p>
            </div>
          )}

          {/* Promotion Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Promotion Name *
            </label>
            <input
              type="text"
              value={promotionName}
              onChange={(e) => setPromotionName(e.target.value)}
              placeholder="e.g., Summer Sale 2024"
              maxLength={90}
              className={`w-full px-4 py-2.5 bg-gray-800 border ${
                getError('name') ? 'border-red-500' : 'border-gray-700'
              } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            {getError('name') && (
              <p className="text-xs text-red-400 mt-1">{getError('name')}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {promotionName.length}/90 characters
            </p>
          </div>

          {/* Discount Value */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {activeConfig.discountLabel} *
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder={activeTab === 'markdown' || activeTab === 'volume' ? '20' : '5.00'}
                className={`w-full px-4 py-2.5 bg-gray-800 border ${
                  getError('discount') ? 'border-red-500' : 'border-gray-700'
                } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                {activeConfig.discountSuffix}
              </span>
            </div>
            {getError('discount') && (
              <p className="text-xs text-red-400 mt-1">{getError('discount')}</p>
            )}
          </div>

          {/* Minimum Purchase (conditional) */}
          {activeConfig.showMinPurchase && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {activeConfig.minLabel}
                {activeTab === 'order_discount' ? ' *' : ' (optional)'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step={activeTab === 'volume' ? '1' : '0.01'}
                  value={minPurchase}
                  onChange={(e) => setMinPurchase(e.target.value)}
                  placeholder={activeTab === 'volume' ? '2' : '25.00'}
                  className={`w-full px-4 py-2.5 bg-gray-800 border ${
                    getError('minPurchase') ? 'border-red-500' : 'border-gray-700'
                  } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {activeTab === 'order_discount' && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    $
                  </span>
                )}
              </div>
              {getError('minPurchase') && (
                <p className="text-xs text-red-400 mt-1">{getError('minPurchase')}</p>
              )}
            </div>
          )}

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Start Date (optional)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`w-full px-4 py-2.5 bg-gray-800 border ${
                  getError('startDate') || getError('dates') ? 'border-red-500' : 'border-gray-700'
                } rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              {getError('startDate') && (
                <p className="text-xs text-red-400 mt-1">{getError('startDate')}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                End Date (optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`w-full px-4 py-2.5 bg-gray-800 border ${
                  getError('dates') ? 'border-red-500' : 'border-gray-700'
                } rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
            {getError('dates') && (
              <p className="text-xs text-red-400 mt-1 col-span-2">{getError('dates')}</p>
            )}
          </div>

          {/* Impact Preview */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Estimated Impact</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400">Total Value</p>
                <p className="text-lg font-bold text-white">
                  ${estimatedImpact.totalValue.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Est. Discount</p>
                <p className="text-lg font-bold text-red-400">
                  -${estimatedImpact.estimatedDiscount.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">After Promotion</p>
                <p className="text-lg font-bold text-green-400">
                  ${estimatedImpact.newValue.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Selected Items Preview */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">
              Selected Items ({items.length})
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {items.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-gray-750 rounded px-3 py-2"
                >
                  <p className="text-sm text-white truncate flex-1">{item.name}</p>
                  <p className="text-sm text-gray-400 ml-2">
                    ${(item.sellingPrice || 0).toFixed(2)}
                  </p>
                </div>
              ))}
              {items.length > 5 && (
                <p className="text-xs text-gray-500 text-center py-2">
                  + {items.length - 5} more items
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
              onClick={handleCreatePromotion}
              disabled={isProcessing || !promotionName || !discount}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isProcessing ? 'Creating...' : 'Create Promotion'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
