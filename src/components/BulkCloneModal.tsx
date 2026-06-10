import { useState, useMemo } from 'react';
import { X, Copy, GitBranch, ShoppingCart, Plus, Minus, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import type { Item } from '../types/item';

interface BulkCloneModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  onCloneItems: (cloneType: 'duplicate' | 'variation' | 'marketplace', options: CloneOptions) => Promise<void>;
}

interface CloneOptions {
  count?: number;
  skuPrefix?: string;
  skuSuffix?: string;
  variations?: VariationOption[];
  targetMarketplace?: string;
  keepEbayData?: boolean;
}

interface VariationOption {
  type: 'size' | 'color' | 'style';
  value: string;
}

type CloneType = 'duplicate' | 'variation' | 'marketplace';

export const BulkCloneModal: React.FC<BulkCloneModalProps> = ({
  isOpen,
  onClose,
  items,
  onCloneItems
}) => {
  const [cloneType, setCloneType] = useState<CloneType>('duplicate');
  const [isProcessing, setIsProcessing] = useState(false);

  // Duplicate options
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [skuSuffix, setSkuSuffix] = useState('-COPY');

  // Variation options
  const [variationFields, setVariationFields] = useState<VariationOption[]>([
    { type: 'size', value: '' }
  ]);

  // Marketplace options
  const [targetMarketplace, setTargetMarketplace] = useState<string>('poshmark');
  const [keepEbayData, setKeepEbayData] = useState(true);

  // Calculate preview of items to be created
  const previewItems = useMemo(() => {
    let totalClones = 0;

    switch (cloneType) {
      case 'duplicate':
        totalClones = items.length * duplicateCount;
        break;
      case 'variation':
        const validVariations = variationFields.filter(v => v.value.trim());
        totalClones = items.length * validVariations.length;
        break;
      case 'marketplace':
        totalClones = items.length;
        break;
    }

    return totalClones;
  }, [cloneType, items.length, duplicateCount, variationFields]);

  // Generate preview list
  const previewList = useMemo(() => {
    const previews: Array<{ originalName: string; newName: string; newSku: string }> = [];

    items.slice(0, 3).forEach(item => {
      switch (cloneType) {
        case 'duplicate':
          for (let i = 1; i <= Math.min(duplicateCount, 3); i++) {
            previews.push({
              originalName: item.name,
              newName: item.name,
              newSku: `${item.ebaySku || item.id}${skuSuffix}${duplicateCount > 1 ? i : ''}`
            });
          }
          break;

        case 'variation':
          variationFields.filter(v => v.value.trim()).slice(0, 3).forEach(variation => {
            previews.push({
              originalName: item.name,
              newName: `${item.name} - ${variation.value}`,
              newSku: `${item.ebaySku || item.id}-${variation.value.replace(/\s+/g, '-').toUpperCase()}`
            });
          });
          break;

        case 'marketplace':
          previews.push({
            originalName: item.name,
            newName: item.name,
            newSku: `${item.ebaySku || item.id}-${targetMarketplace.toUpperCase()}`
          });
          break;
      }
    });

    return previews;
  }, [cloneType, items, duplicateCount, skuSuffix, variationFields, targetMarketplace]);

  // Add variation field
  const addVariationField = () => {
    setVariationFields([...variationFields, { type: 'size', value: '' }]);
  };

  // Remove variation field
  const removeVariationField = (index: number) => {
    setVariationFields(variationFields.filter((_, i) => i !== index));
  };

  // Update variation field
  const updateVariationField = (index: number, field: Partial<VariationOption>) => {
    const newFields = [...variationFields];
    newFields[index] = { ...newFields[index], ...field };
    setVariationFields(newFields);
  };

  // Handle clone
  const handleClone = async () => {
    setIsProcessing(true);

    try {
      let options: CloneOptions = {};

      switch (cloneType) {
        case 'duplicate':
          options = {
            count: duplicateCount,
            skuSuffix,
            keepEbayData: true
          };
          break;

        case 'variation':
          options = {
            variations: variationFields.filter(v => v.value.trim()),
            keepEbayData: true
          };
          break;

        case 'marketplace':
          options = {
            targetMarketplace,
            keepEbayData
          };
          break;
      }

      await onCloneItems(cloneType, options);
      onClose();
    } catch (error) {
      console.error('Failed to clone items:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Validation
  const isValid = useMemo(() => {
    switch (cloneType) {
      case 'duplicate':
        return duplicateCount > 0 && duplicateCount <= 10;
      case 'variation':
        return variationFields.some(v => v.value.trim());
      case 'marketplace':
        return targetMarketplace !== '';
      default:
        return false;
    }
  }, [cloneType, duplicateCount, variationFields, targetMarketplace]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gradient-to-r from-purple-900/50 to-pink-900/50">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Copy className="h-6 w-6" />
              Bulk Clone Manager
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {items.length} item{items.length !== 1 ? 's' : ''} selected • Will create {previewItems} new item{previewItems !== 1 ? 's' : ''}
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

        {/* Clone Type Selection */}
        <div className="p-6 border-b border-gray-700 bg-gray-800/50">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Select Clone Type</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Duplicate */}
            <label
              className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                cloneType === 'duplicate'
                  ? 'border-purple-500 bg-purple-900/30'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="cloneType"
                value="duplicate"
                checked={cloneType === 'duplicate'}
                onChange={(e) => setCloneType(e.target.value as CloneType)}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Copy className="h-5 w-5 text-purple-400" />
                  <span className="font-semibold text-white">Duplicate</span>
                </div>
                <p className="text-xs text-gray-400">
                  Create exact copies with new SKUs
                </p>
              </div>
            </label>

            {/* Variation */}
            <label
              className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                cloneType === 'variation'
                  ? 'border-purple-500 bg-purple-900/30'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="cloneType"
                value="variation"
                checked={cloneType === 'variation'}
                onChange={(e) => setCloneType(e.target.value as CloneType)}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch className="h-5 w-5 text-purple-400" />
                  <span className="font-semibold text-white">Variation</span>
                </div>
                <p className="text-xs text-gray-400">
                  Create variants with different attributes
                </p>
              </div>
            </label>

            {/* Marketplace */}
            <label
              className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                cloneType === 'marketplace'
                  ? 'border-purple-500 bg-purple-900/30'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="cloneType"
                value="marketplace"
                checked={cloneType === 'marketplace'}
                onChange={(e) => setCloneType(e.target.value as CloneType)}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingCart className="h-5 w-5 text-purple-400" />
                  <span className="font-semibold text-white">Marketplace</span>
                </div>
                <p className="text-xs text-gray-400">
                  Prepare for cross-platform listing
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Clone Options */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Duplicate Options */}
          {cloneType === 'duplicate' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Number of Duplicates (per item)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={duplicateCount}
                  onChange={(e) => setDuplicateCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">Max 10 duplicates per item</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  SKU Suffix
                </label>
                <input
                  type="text"
                  value={skuSuffix}
                  onChange={(e) => setSkuSuffix(e.target.value)}
                  placeholder="-COPY"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">Added to end of original SKU</p>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 bg-blue-900/30 border border-blue-600/30 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0" />
                <p className="text-sm text-blue-200">
                  All eBay listing data will be preserved for easy relisting
                </p>
              </div>
            </div>
          )}

          {/* Variation Options */}
          {cloneType === 'variation' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-300">
                    Variation Options
                  </label>
                  <Button
                    onClick={addVariationField}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Add Variation
                  </Button>
                </div>

                <div className="space-y-3">
                  {variationFields.map((variation, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <select
                        value={variation.type}
                        onChange={(e) => updateVariationField(index, { type: e.target.value as any })}
                        className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm"
                      >
                        <option value="size">Size</option>
                        <option value="color">Color</option>
                        <option value="style">Style</option>
                      </select>

                      <input
                        type="text"
                        value={variation.value}
                        onChange={(e) => updateVariationField(index, { value: e.target.value })}
                        placeholder={`Enter ${variation.type}...`}
                        className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />

                      {variationFields.length > 1 && (
                        <button
                          onClick={() => removeVariationField(index)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors"
                        >
                          <Minus className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 bg-blue-900/30 border border-blue-600/30 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0" />
                <p className="text-sm text-blue-200">
                  Each variation will create a new item with the variation appended to the name
                </p>
              </div>
            </div>
          )}

          {/* Marketplace Options */}
          {cloneType === 'marketplace' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Target Marketplace
                </label>
                <select
                  value={targetMarketplace}
                  onChange={(e) => setTargetMarketplace(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="poshmark">Poshmark</option>
                  <option value="mercari">Mercari</option>
                  <option value="depop">Depop</option>
                  <option value="grailed">Grailed</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg">
                <input
                  type="checkbox"
                  id="keep-ebay-data"
                  checked={keepEbayData}
                  onChange={(e) => setKeepEbayData(e.target.checked)}
                  className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                />
                <label htmlFor="keep-ebay-data" className="text-sm text-gray-300 cursor-pointer flex-1">
                  Keep all eBay listing data (photos, descriptions, shipping info)
                </label>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 bg-blue-900/30 border border-blue-600/30 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0" />
                <p className="text-sm text-blue-200">
                  Items will be flagged for listing on {targetMarketplace.charAt(0).toUpperCase() + targetMarketplace.slice(1)}
                </p>
              </div>
            </div>
          )}

          {/* Preview List */}
          {previewList.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Preview (showing first {previewList.length})</h3>
              <div className="space-y-2">
                {previewList.map((preview, index) => (
                  <div
                    key={index}
                    className="bg-gray-800 rounded-lg p-4 border border-gray-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 mb-1">Original</p>
                        <p className="text-sm text-gray-300 truncate">{preview.originalName}</p>
                      </div>
                      <div className="text-gray-500 flex-shrink-0">→</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 mb-1">New Item</p>
                        <p className="text-sm text-white font-medium truncate">{preview.newName}</p>
                        <p className="text-xs text-purple-400 truncate">SKU: {preview.newSku}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {previewItems > previewList.length && (
                  <p className="text-xs text-gray-500 text-center py-2">
                    ... and {previewItems - previewList.length} more
                  </p>
                )}
              </div>
            </div>
          )}
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
              onClick={handleClone}
              disabled={isProcessing || !isValid}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Cloning...' : `Clone ${previewItems} Item${previewItems !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
