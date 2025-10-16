import React, { useState, useEffect } from 'react';
import type { Item, ItemTag, ItemStatus } from '../types/item';
import { Modal } from './ui/Modal';
import { Input, TextArea, Select } from './ui/Input';
import { Button } from './ui/Button';
import { calculateMarketplaceFees } from '../utils/marketplace-fees';
import { searchComps, getCompStats, type ClothingComp } from '../services/comps';
import { TrendingUp, ExternalLink, Loader2 } from 'lucide-react';

interface ItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (item: Omit<Item, 'id' | 'dateAdded'> | Item) => void;
  editItem?: Item | null;
}

const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'SOLD', label: 'SOLD' },
];

const TAG_OPTIONS: ItemTag[] = ['Hoodie', 'Jersey', 'polo', 'Pullover/Jackets', 'T-shirts', 'Bottoms'];

export const ItemForm: React.FC<ItemFormProps> = ({ open, onOpenChange, onSubmit, editItem }) => {
  const [formData, setFormData] = useState({
    name: '',
    size: '',
    status: 'Active' as ItemStatus,
    hangerStatus: '',
    hangerId: '',
    tags: [] as ItemTag[],
    imageUrl: '',
    ebayUrl: '',
    ebayPrice: 0,
    mercariUrl: '',
    mercariPrice: 0,
    poshmarkUrl: '',
    poshmarkPrice: 0,
    costPrice: 0,
    sellingPrice: 0,
    ebayFees: 0,
    netProfit: 0,
    dateField: '',
    notes: '',
  });

  useEffect(() => {
    if (editItem) {
      // Extract marketplace URLs from the marketplaceUrls array
      const mercariData = editItem.marketplaceUrls?.find(m => m.type === 'mercari');
      const poshmarkData = editItem.marketplaceUrls?.find(m => m.type === 'poshmark');
      const mercariUrl = mercariData?.url || '';
      const mercariPrice = mercariData?.price || 0;
      const poshmarkUrl = poshmarkData?.url || '';
      const poshmarkPrice = poshmarkData?.price || 0;
      
      setFormData({
        name: editItem.name,
        size: editItem.size,
        status: editItem.status,
        hangerStatus: editItem.hangerStatus,
        hangerId: editItem.hangerId,
        tags: editItem.tags,
        imageUrl: editItem.imageUrl || '',
        ebayUrl: editItem.ebayUrl,
        ebayPrice: editItem.sellingPrice, // Use sellingPrice as eBay price
        mercariUrl,
        mercariPrice,
        poshmarkUrl,
        poshmarkPrice,
        costPrice: editItem.costPrice,
        sellingPrice: editItem.sellingPrice,
        ebayFees: editItem.ebayFees,
        netProfit: editItem.netProfit,
        dateField: editItem.dateField,
        notes: editItem.notes,
      });
    } else {
      // Check sessionStorage for pre-filled values from "Add Hanger" button
      const categoryFromStorage = sessionStorage.getItem('newItemCategory');
      const hangerIdFromStorage = sessionStorage.getItem('newItemHangerId');
      
      // Reset form with optional pre-filled values
      setFormData({
        name: '',
        size: '',
        status: 'Active',
        hangerStatus: hangerIdFromStorage ? 'In Use' : '',
        hangerId: hangerIdFromStorage || '',
        tags: categoryFromStorage ? [categoryFromStorage as ItemTag] : [],
        imageUrl: '',
        ebayUrl: '',
        ebayPrice: 0,
        mercariUrl: '',
        mercariPrice: 0,
        poshmarkUrl: '',
        poshmarkPrice: 0,
        costPrice: 0,
        sellingPrice: 0,
        ebayFees: 0,
        netProfit: 0,
        dateField: '',
        notes: '',
      });
      
      // Clear sessionStorage after using
      sessionStorage.removeItem('newItemCategory');
      sessionStorage.removeItem('newItemHangerId');
    }
  }, [editItem, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Build marketplaceUrls array from individual URL and PRICE fields
    const marketplaceUrls = [];
    
    // Add Mercari if URL exists
    if (formData.mercariUrl && formData.mercariUrl.trim()) {
      marketplaceUrls.push({
        type: 'mercari' as const,
        url: formData.mercariUrl.trim(),
        price: Number(formData.mercariPrice) || 0
      });
    }
    
    // Add Poshmark if URL exists
    if (formData.poshmarkUrl && formData.poshmarkUrl.trim()) {
      marketplaceUrls.push({
        type: 'poshmark' as const,
        url: formData.poshmarkUrl.trim(),
        price: Number(formData.poshmarkPrice) || 0
      });
    }
    
    console.log('Form Submit - Built marketplace URLs:', marketplaceUrls);
    
    const itemData = {
      ...formData,
      marketplaceUrls,
      sellingPrice: Number(formData.ebayPrice) || Number(formData.sellingPrice) || 0
    };
    
    // Remove the temporary URL and price fields
    const { mercariUrl, mercariPrice, poshmarkUrl, poshmarkPrice, ebayPrice, ...finalData } = itemData;
    
    console.log('Final data being saved:', finalData);
    
    if (editItem) {
      onSubmit({ ...editItem, ...finalData });
    } else {
      onSubmit(finalData);
    }
    
    onOpenChange(false);
  };

  const handleTagToggle = (tag: ItemTag) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showComps, setShowComps] = useState(false);
  const [comps, setComps] = useState<ClothingComp[]>([]);
  const [loadingComps, setLoadingComps] = useState(false);

  const handleFindComps = async () => {
    if (!formData.name && formData.tags.length === 0) {
      alert('Please enter an item name or select tags to find comps');
      return;
    }

    setLoadingComps(true);
    setShowComps(true);

    try {
      // Extract potential brand from name
      const brandMatch = formData.name.match(/^([A-Z][a-zA-Z]+)/);
      const brand = brandMatch ? brandMatch[1] : undefined;

      const results = await searchComps({
        category: formData.tags[0]?.toLowerCase(),
        brand,
        size: formData.size || undefined,
        minSimilarity: 0.5,
        limit: 10
      });

      setComps(results);
    } catch (error) {
      console.error('Error finding comps:', error);
    } finally {
      setLoadingComps(false);
    }
  };

  const stats = comps.length > 0 ? getCompStats(comps) : null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editItem ? 'Edit Item' : 'Add New Item'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Essential Fields */}
        <Input
          label="Item Name *"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Nike Cardinals Hoodie"
          required
        />

        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Size"
            value={formData.size}
            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
            placeholder="L, XL"
          />

          <Select
            label="Status *"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as ItemStatus })}
            options={STATUS_OPTIONS}
            required
          />
          
          <Input
            label="Cost"
            type="number"
            step="0.01"
            value={formData.costPrice || ''}
            onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />
        </div>

        {/* Tags - Always visible but compact */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagToggle(tag)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  formData.tags.includes(tag)
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Find Comps Button */}
        <Button
          type="button"
          variant="secondary"
          onClick={handleFindComps}
          className="w-full flex items-center justify-center gap-2"
          disabled={loadingComps}
        >
          {loadingComps ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding comps...
            </>
          ) : (
            <>
              <TrendingUp className="h-4 w-4" />
              Find Comparable Sales
            </>
          )}
        </Button>

        {/* Comps Results */}
        {showComps && (
          <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 space-y-3">
            {loadingComps ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              </div>
            ) : comps.length === 0 ? (
              <p className="text-center text-gray-400 py-4">
                No comps found. Try running the scraper first or adjust your search.
              </p>
            ) : (
              <>
                {/* Stats */}
                {stats && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-gray-800 rounded p-2 text-center">
                      <div className="text-xs text-gray-400">Avg Price</div>
                      <div className="text-lg font-bold text-green-400">${stats.avgPrice.toFixed(0)}</div>
                    </div>
                    <div className="bg-gray-800 rounded p-2 text-center">
                      <div className="text-xs text-gray-400">Median</div>
                      <div className="text-lg font-bold text-blue-400">${stats.medianPrice.toFixed(0)}</div>
                    </div>
                    <div className="bg-gray-800 rounded p-2 text-center">
                      <div className="text-xs text-gray-400">Range</div>
                      <div className="text-sm font-bold text-purple-400">${stats.minPrice}-${stats.maxPrice}</div>
                    </div>
                  </div>
                )}

                {/* Comp Cards */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {comps.slice(0, 5).map((comp) => (
                    <div key={comp.id} className="flex gap-3 bg-gray-800 rounded p-2 text-sm">
                      {comp.image_urls?.[0] && (
                        <img src={comp.image_urls[0]} alt={comp.title} className="w-12 h-12 rounded object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium truncate">{comp.title}</div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="uppercase">{comp.source_marketplace}</span>
                          {comp.similarity_score && (
                            <span className="text-green-400">{(comp.similarity_score * 100).toFixed(0)}% match</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-between">
                        <div className="text-lg font-bold text-green-400">${comp.price.toFixed(0)}</div>
                        <a
                          href={comp.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                {comps.length > 5 && (
                  <p className="text-xs text-center text-gray-400">
                    Showing 5 of {comps.length} comps
                  </p>
                )}
              </>
            )}
          </div>
        )}


        {/* Advanced Fields Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-purple-400 hover:text-purple-300"
        >
          {showAdvanced ? '− Hide' : '+ Show'} Advanced Options
        </button>

        {showAdvanced && (
          <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
            {/* Marketplace URLs with Fee Calculations */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="eBay URL"
                  type="url"
                  value={formData.ebayUrl}
                  onChange={(e) => setFormData({ ...formData, ebayUrl: e.target.value })}
                  placeholder="https://ebay.com/..."
                />
                <div>
                  <Input
                    label="List Price"
                    type="number"
                    step="0.01"
                    value={formData.ebayPrice || ''}
                    onChange={(e) => setFormData({ ...formData, ebayPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                  {formData.ebayPrice > 0 && (
                    <div className="mt-1 text-xs text-gray-400">
                      {(() => {
                        const calc = calculateMarketplaceFees('ebay', formData.ebayPrice);
                        return `Net: $${calc.netProfit} (${calc.breakdown})`;
                      })()}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Mercari URL"
                  type="url"
                  value={formData.mercariUrl}
                  onChange={(e) => setFormData({ ...formData, mercariUrl: e.target.value })}
                  placeholder="https://mercari.com/..."
                />
                <div>
                  <Input
                    label="List Price"
                    type="number"
                    step="0.01"
                    value={formData.mercariPrice || ''}
                    onChange={(e) => setFormData({ ...formData, mercariPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                  {formData.mercariPrice > 0 && (
                    <div className="mt-1 text-xs text-gray-400">
                      {(() => {
                        const calc = calculateMarketplaceFees('mercari', formData.mercariPrice);
                        return `Net: $${calc.netProfit} (${calc.breakdown})`;
                      })()}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Poshmark URL"
                  type="url"
                  value={formData.poshmarkUrl}
                  onChange={(e) => setFormData({ ...formData, poshmarkUrl: e.target.value })}
                  placeholder="https://poshmark.com/..."
                />
                <div>
                  <Input
                    label="List Price"
                    type="number"
                    step="0.01"
                    value={formData.poshmarkPrice || ''}
                    onChange={(e) => setFormData({ ...formData, poshmarkPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                  {formData.poshmarkPrice > 0 && (
                    <div className="mt-1 text-xs text-gray-400">
                      {(() => {
                        const calc = calculateMarketplaceFees('poshmark', formData.poshmarkPrice);
                        return `Net: $${calc.netProfit} (${calc.breakdown})`;
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Financial Details */}
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Selling Price"
                type="number"
                step="0.01"
                value={formData.sellingPrice || ''}
                onChange={(e) => setFormData({ ...formData, sellingPrice: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
              <Input
                label="Fees"
                type="number"
                step="0.01"
                value={formData.ebayFees || ''}
                onChange={(e) => setFormData({ ...formData, ebayFees: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
              <Input
                label="Net Profit"
                type="number"
                step="0.01"
                value={formData.netProfit || ''}
                onChange={(e) => setFormData({ ...formData, netProfit: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>

            {/* Hanger Info */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Hanger Status"
                value={formData.hangerStatus}
                onChange={(e) => setFormData({ ...formData, hangerStatus: e.target.value })}
                placeholder="In Use"
              />
              <Input
                label="Hanger ID"
                value={formData.hangerId}
                onChange={(e) => setFormData({ ...formData, hangerId: e.target.value })}
                placeholder="A1, B2"
              />
            </div>

            <Input
              label="Date"
              type="date"
              value={formData.dateField}
              onChange={(e) => setFormData({ ...formData, dateField: e.target.value })}
            />

            <Input
              label="Image URL"
              type="url"
              value={formData.imageUrl}
              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              placeholder="https://..."
            />

            <TextArea
              label="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-gray-700">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {editItem ? 'Update Item' : 'Add Item'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
