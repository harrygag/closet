import { useState, useEffect } from 'react';
import { X, ExternalLink, DollarSign, Package, Tag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ebayService } from '../services/ebayService';
import type { Item } from '../types/item';
import { CLOTHING_CATEGORIES, ITEM_CONDITIONS } from '../services/ebay/manual';

interface ListToEbayModalProps {
  item: Item;
  isOpen: boolean;
  onClose: () => void;
}

export function ListToEbayModal({ item, isOpen, onClose }: ListToEbayModalProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [categoryId, setCategoryId] = useState('15687'); // Default: T-Shirts
  const [condition, setCondition] = useState('3000'); // Default: Used
  const [conditionDescription, setConditionDescription] = useState('');

  // Initialize form with item data
  useEffect(() => {
    if (isOpen && item) {
      setTitle(item.name || '');
      setDescription(item.notes || '');
      setPrice(item.sellingPrice ? (item.sellingPrice / 100).toFixed(2) : '');
      setQuantity('1');

      // Extract category from tags if available
      const categoryTag = item.tags?.find(tag =>
        CLOTHING_CATEGORIES.some(cat => cat.name.toLowerCase().includes(tag.toLowerCase()))
      );
      if (categoryTag) {
        const category = CLOTHING_CATEGORIES.find(cat =>
          cat.name.toLowerCase().includes(categoryTag.toLowerCase())
        );
        if (category) {
          setCategoryId(category.id);
        }
      }
    }
  }, [isOpen, item]);

  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }

    const priceInCents = Math.round(parseFloat(price) * 100);
    if (isNaN(priceInCents) || priceInCents <= 0) {
      toast.error('Valid price is required');
      return;
    }

    try {
      setIsPublishing(true);
      toast.info('Creating eBay listing...');

      // Build item specifics from item data
      const itemSpecifics: Record<string, string | string[]> = {};
      if (item.size) itemSpecifics.Size = item.size;
      if (item.tags && item.tags.length > 0) {
        itemSpecifics.Style = item.tags.join(', ');
      }

      // Use Trading API (simpler, doesn't require inventory location setup)
      const result = await ebayService.createListing({
        title: title.trim(),
        description: description.trim(),
        price: priceInCents,
        quantity: parseInt(quantity) || 1,
        condition: ITEM_CONDITIONS.find(c => c.id === condition)?.name || 'Used',
        conditionID: condition,
        categoryID: categoryId,
        itemSpecifics,
        photosUrls: item.imageUrl ? [item.imageUrl] : undefined,
      });

      console.log('eBay listing created:', result);

      if (result.success) {
        toast.success(
          <div className="flex items-center gap-2">
            <span>Listed on eBay! Item ID: {result.itemId}</span>
            <a
              href={result.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          </div>,
          { duration: 10000 }
        );
        onClose();
      } else {
        toast.error('Failed to create listing');
      }
    } catch (error) {
      console.error('Failed to list on eBay:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create eBay listing');
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-gray-800 p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">List on eBay</h2>
            <p className="mt-1 text-sm text-gray-400">
              Create a new listing on eBay
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
            disabled={isPublishing}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Enter listing title (max 80 characters)"
              maxLength={80}
              disabled={isPublishing}
            />
            <p className="mt-1 text-xs text-gray-400">{title.length}/80 characters</p>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Enter detailed item description..."
              disabled={isPublishing}
            />
          </div>

          {/* Price and Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Price (USD) <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 pl-9 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="0.00"
                  disabled={isPublishing}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Quantity <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 pl-9 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isPublishing}
                />
              </div>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Category <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full appearance-none rounded-md border border-gray-600 bg-gray-700 px-3 py-2 pl-9 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={isPublishing}
              >
                {CLOTHING_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Condition <span className="text-red-400">*</span>
            </label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isPublishing}
            >
              {ITEM_CONDITIONS.map((cond) => (
                <option key={cond.id} value={cond.id}>
                  {cond.name} - {cond.description}
                </option>
              ))}
            </select>
          </div>

          {/* Condition Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              Condition Details (Optional)
            </label>
            <input
              type="text"
              value={conditionDescription}
              onChange={(e) => setConditionDescription(e.target.value)}
              className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g., Minor wear on collar"
              disabled={isPublishing}
            />
          </div>

          {/* Item Preview */}
          {item.imageUrl && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Image Preview
              </label>
              <img
                src={item.imageUrl}
                alt={item.name}
                className="h-32 w-32 rounded-md border border-gray-600 object-cover"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600"
            disabled={isPublishing}
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={isPublishing}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                Publish to eBay
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
