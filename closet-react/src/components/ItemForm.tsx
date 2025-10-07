import React, { useState, useEffect } from 'react';
import type { Item, ItemTag, ItemStatus } from '../types/item';
import { Modal } from './ui/Modal';
import { Input, TextArea, Select } from './ui/Input';
import { Button } from './ui/Button';

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
    
    // Build marketplaceUrls array from individual URL fields
    const marketplaceUrls = [];
    if (formData.mercariUrl) {
      marketplaceUrls.push({
        type: 'mercari' as const,
        url: formData.mercariUrl,
        price: formData.mercariPrice || 0
      });
    }
    if (formData.poshmarkUrl) {
      marketplaceUrls.push({
        type: 'poshmark' as const,
        url: formData.poshmarkUrl,
        price: formData.poshmarkPrice || 0
      });
    }
    
    const itemData = {
      ...formData,
      marketplaceUrls,
    };
    
    // Remove the temporary URL and price fields
    const { mercariUrl, mercariPrice, poshmarkUrl, poshmarkPrice, ebayPrice, ...finalData } = itemData;
    
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

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editItem ? 'Edit Item' : 'Add New Item'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Item Name *"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Nike Arizona Cardinals Salute to Service Hoodie"
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Size"
            value={formData.size}
            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
            placeholder="e.g., L, XL"
          />

          <Select
            label="Status *"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as ItemStatus })}
            options={STATUS_OPTIONS}
            required
          />
        </div>

        {/* Tags */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">Tags</label>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagToggle(tag)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
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

        {/* Image URL */}
        <Input
          label="Image URL"
          type="url"
          value={formData.imageUrl}
          onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
          placeholder="https://example.com/image.jpg or paste S3 URL from Notion"
        />

        {/* Marketplace URLs with Prices */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-300">Marketplace Listings</label>
          
          {/* eBay */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="eBay URL"
              type="url"
              value={formData.ebayUrl}
              onChange={(e) => setFormData({ ...formData, ebayUrl: e.target.value })}
              placeholder="https://ebay.com/itm/..."
            />
            <Input
              label="eBay Price"
              type="number"
              step="0.01"
              value={formData.ebayPrice || ''}
              onChange={(e) => setFormData({ ...formData, ebayPrice: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />
          </div>
          
          {/* Mercari */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Mercari URL"
              type="url"
              value={formData.mercariUrl}
              onChange={(e) => setFormData({ ...formData, mercariUrl: e.target.value })}
              placeholder="https://mercari.com/us/item/..."
            />
            <Input
              label="Mercari Price"
              type="number"
              step="0.01"
              value={formData.mercariPrice || ''}
              onChange={(e) => setFormData({ ...formData, mercariPrice: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />
          </div>
          
          {/* Poshmark */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Poshmark URL"
              type="url"
              value={formData.poshmarkUrl}
              onChange={(e) => setFormData({ ...formData, poshmarkUrl: e.target.value })}
              placeholder="https://poshmark.com/listing/..."
            />
            <Input
              label="Poshmark Price"
              type="number"
              step="0.01"
              value={formData.poshmarkPrice || ''}
              onChange={(e) => setFormData({ ...formData, poshmarkPrice: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Cost Price"
            type="number"
            step="0.01"
            value={formData.costPrice || ''}
            onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />

          <Input
            label="Selling Price"
            type="number"
            step="0.01"
            value={formData.sellingPrice || ''}
            onChange={(e) => setFormData({ ...formData, sellingPrice: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="eBay Fees"
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

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Hanger Status"
            value={formData.hangerStatus}
            onChange={(e) => setFormData({ ...formData, hangerStatus: e.target.value })}
            placeholder="e.g., In Use"
          />

          <Input
            label="Hanger ID"
            value={formData.hangerId}
            onChange={(e) => setFormData({ ...formData, hangerId: e.target.value })}
            placeholder="e.g., A1, B2"
          />
        </div>

        <Input
          label="Date Field"
          type="date"
          value={formData.dateField}
          onChange={(e) => setFormData({ ...formData, dateField: e.target.value })}
        />

        <TextArea
          label="Notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes about this item..."
          rows={3}
        />

        <div className="flex justify-end gap-2 pt-4">
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
