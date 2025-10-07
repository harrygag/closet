// Flippable playing card hanger component
import React, { useState } from 'react';
import type { Item } from '../types/item';
import { parseMarketplaceUrls, MARKETPLACE_ICONS, MARKETPLACE_COLORS } from '../utils/marketplace';
import { clsx } from 'clsx';
import { Shirt, Upload, Save, X } from 'lucide-react';

interface ClosetHangerProps {
  item: Item;
  onClick: (item: Item) => void;
  onImageUpload?: (itemId: string, imageUrl: string) => void;
  onUpdate?: (item: Item) => void;
  isDragging?: boolean;
}

export const ClosetHanger: React.FC<ClosetHangerProps> = ({
  item,
  onImageUpload,
  onUpdate,
  isDragging = false
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editData, setEditData] = useState(item);

  const marketplaceUrls = parseMarketplaceUrls(item.ebayUrl, item.marketplaceUrls?.map(m => m.url));
  
  const getMarketplacePrice = (type: string) => {
    if (type === 'ebay') return item.sellingPrice;
    const marketplace = item.marketplaceUrls?.find(m => m.type === type);
    return marketplace?.price || 0;
  };

  const hasActiveListings = marketplaceUrls.length > 0;

  // Sync editData when item prop changes
  React.useEffect(() => {
    setEditData(item);
  }, [item]);

  // Handle drag and drop for image upload
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isFlipped) setIsDropping(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropping(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropping(false);

    if (isFlipped) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (imageFile && onImageUpload) {
      setIsUploading(true);
      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          const imageUrl = reader.result as string;
          onImageUpload(item.id, imageUrl);
          setIsUploading(false);
        };
        reader.onerror = () => {
          console.error('Failed to read file');
          setIsUploading(false);
        };
        reader.readAsDataURL(imageFile);
      } catch (error) {
        console.error('Failed to upload image:', error);
        setIsUploading(false);
      }
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging) {
      setIsFlipped(!isFlipped);
    }
  };

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUpdate) {
      onUpdate(editData);
    }
    setIsFlipped(false);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditData(item);
    setIsFlipped(false);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={clsx(
        'group relative cursor-pointer transition-all duration-300',
        isDragging && 'opacity-50 scale-95',
        isDropping && 'ring-2 ring-purple-500 ring-offset-2 ring-offset-gray-800'
      )}
      style={{
        perspective: '1000px',
        animation: isDragging ? 'none' : 'sway 3s ease-in-out infinite',
        animationDelay: `${Math.random() * 2}s`,
      }}
    >
      <div
        onDoubleClick={handleCardClick}
        className="relative"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
          transition: 'transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)',
        }}
      >
        {/* FRONT SIDE */}
        <div
          className="w-full"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {/* Hanger Hook */}
          <div className="flex justify-center">
            <div className="h-6 w-0.5 bg-gradient-to-b from-gray-500 to-gray-600 rounded-full" />
          </div>

          {/* Hanger Top */}
          <div className="flex justify-center -mt-1">
            <svg width="60" height="20" viewBox="0 0 60 20">
              <path
                d="M 30 0 Q 30 8, 22 12 L 8 12 Q 4 12, 4 16 L 4 18 Q 4 20, 6 20 L 54 20 Q 56 20, 56 18 L 56 16 Q 56 12, 52 12 L 38 12 Q 30 8, 30 0"
                fill="#6B7280"
                stroke="#4B5563"
                strokeWidth="0.5"
              />
            </svg>
          </div>

          {/* Item Card */}
          <div className="flex justify-center -mt-2">
            <div className="relative flex h-32 w-24 flex-col rounded-lg border-2 border-gray-600 bg-white shadow-xl transition-all duration-300 group-hover:shadow-2xl group-hover:border-purple-500">
              {/* Upload indicator */}
              {(isDropping || isUploading) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg z-10">
                  {isUploading ? (
                    <div className="text-white text-xs font-bold">Uploading...</div>
                  ) : (
                    <Upload className="h-10 w-10 text-purple-400 animate-bounce" />
                  )}
                </div>
              )}

              {/* Image */}
              <div className="flex-1 flex items-center justify-center p-1">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-full w-full object-cover rounded"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-gray-400">
                    <Shirt className="h-10 w-10" />
                    <p className="text-[10px] text-center">Drop photo</p>
                  </div>
                )}
              </div>

              {/* Bottom info bar */}
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-2 py-1 rounded-b-lg">
                <p className="text-[10px] font-bold text-white truncate text-center">
                  {item.name}
                </p>
                {item.size && (
                  <p className="text-[9px] text-purple-100 text-center">{item.size}</p>
                )}
              </div>

              {/* Status & Marketplace Icons (top right) */}
              <div className="absolute -top-2 -right-2 flex items-center gap-1">
                <div
                  className={clsx(
                    'h-4 w-4 rounded-full border-2 border-white shadow-lg',
                    hasActiveListings && item.status === 'Active' && 'bg-green-500',
                    (!hasActiveListings || item.status === 'Inactive') && 'bg-yellow-500',
                    item.status === 'SOLD' && 'bg-blue-500'
                  )}
                />
                
                {marketplaceUrls.length > 0 && (
                  <div className="flex gap-0.5 bg-gray-900/95 backdrop-blur-sm px-1 py-0.5 rounded-full border border-gray-700 shadow-lg">
                    {marketplaceUrls.slice(0, 3).map((marketplace, index) => {
                      const Icon = MARKETPLACE_ICONS[marketplace.type];
                      const price = getMarketplacePrice(marketplace.type);
                      return (
                        <a
                          key={index}
                          href={marketplace.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-0.5 transition-transform hover:scale-110"
                          title={`${marketplace.type}: $${price}`}
                          style={{ color: MARKETPLACE_COLORS[marketplace.type] }}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {price > 0 && (
                            <span className="text-[9px] font-bold text-white">
                              ${price}
                            </span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SOLD Badge */}
              {item.status === 'SOLD' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rotate-12 rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white shadow-xl border-2 border-blue-400">
                    SOLD
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Hanger ID Badge */}
          {item.hangerId && (
            <div className="mt-2 flex justify-center">
              <div className="rounded-full bg-purple-600 px-3 py-1 text-xs font-bold text-white shadow-md">
                {item.hangerId}
              </div>
            </div>
          )}
        </div>

        {/* BACK SIDE - Quick Edit Form */}
        <div
          className="absolute top-0 left-0 w-full"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Hanger Hook */}
          <div className="flex justify-center">
            <div className="h-6 w-0.5 bg-gradient-to-b from-gray-500 to-gray-600 rounded-full" />
          </div>

          {/* Hanger Top */}
          <div className="flex justify-center -mt-1">
            <svg width="60" height="20" viewBox="0 0 60 20">
              <path
                d="M 30 0 Q 30 8, 22 12 L 8 12 Q 4 12, 4 16 L 4 18 Q 4 20, 6 20 L 54 20 Q 56 20, 56 18 L 56 16 Q 56 12, 52 12 L 38 12 Q 30 8, 30 0"
                fill="#6B7280"
                stroke="#4B5563"
                strokeWidth="0.5"
              />
            </svg>
          </div>

          {/* Edit Form Card */}
          <div className="flex justify-center -mt-2">
            <div className="w-24 rounded-lg border-2 border-purple-500 bg-gradient-to-br from-gray-800 to-gray-900 p-2 shadow-2xl">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-purple-400 text-center mb-1.5">QUICK EDIT</p>
                
                {/* Name */}
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded bg-gray-700 px-1.5 py-1 text-[10px] text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                  placeholder="Item Name"
                />
                
                {/* Hanger ID */}
                <input
                  type="text"
                  value={editData.hangerId}
                  onChange={(e) => setEditData({ ...editData, hangerId: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded bg-gray-700 px-1.5 py-1 text-[10px] text-white border border-gray-600 focus:border-purple-500 focus:outline-none font-bold"
                  placeholder="Hanger ID"
                />
                
                {/* Size & Status */}
                <div className="grid grid-cols-2 gap-1">
                  <input
                    type="text"
                    value={editData.size}
                    onChange={(e) => setEditData({ ...editData, size: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-1.5 py-1 text-[10px] text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Size"
                  />
                  <select
                    value={editData.status}
                    onChange={(e) => setEditData({ ...editData, status: e.target.value as any })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-1 py-1 text-[10px] text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="SOLD">SOLD</option>
                  </select>
                </div>
                
                {/* Prices */}
                <div className="space-y-1">
                  <p className="text-[9px] text-gray-400 font-semibold">PRICES</p>
                  <input
                    type="number"
                    step="0.01"
                    value={editData.costPrice || ''}
                    onChange={(e) => setEditData({ ...editData, costPrice: parseFloat(e.target.value) || 0 })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-1.5 py-1 text-[10px] text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Cost $"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={editData.sellingPrice || ''}
                    onChange={(e) => setEditData({ ...editData, sellingPrice: parseFloat(e.target.value) || 0 })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-1.5 py-1 text-[10px] text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Selling $"
                  />
                </div>
                
                {/* Image URL */}
                <input
                  type="url"
                  value={editData.imageUrl || ''}
                  onChange={(e) => setEditData({ ...editData, imageUrl: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded bg-gray-700 px-1.5 py-1 text-[10px] text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                  placeholder="Image URL or drop file"
                />

                {/* Marketplace URLs */}
                <div className="space-y-1">
                  <p className="text-[9px] text-gray-400 font-semibold">MARKETPLACES</p>
                  <input
                    type="url"
                    value={editData.ebayUrl || ''}
                    onChange={(e) => setEditData({ ...editData, ebayUrl: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-1.5 py-0.5 text-[9px] text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="eBay URL"
                  />
                  <input
                    type="url"
                    value={editData.marketplaceUrls?.find(m => m.type === 'mercari')?.url || ''}
                    onChange={(e) => {
                      const urls = editData.marketplaceUrls || [];
                      const mercariIndex = urls.findIndex(m => m.type === 'mercari');
                      if (mercariIndex >= 0) {
                        urls[mercariIndex] = { ...urls[mercariIndex], url: e.target.value };
                      } else {
                        urls.push({ type: 'mercari', url: e.target.value });
                      }
                      setEditData({ ...editData, marketplaceUrls: urls });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-1.5 py-0.5 text-[9px] text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Mercari URL"
                  />
                  <input
                    type="url"
                    value={editData.marketplaceUrls?.find(m => m.type === 'poshmark')?.url || ''}
                    onChange={(e) => {
                      const urls = editData.marketplaceUrls || [];
                      const poshIndex = urls.findIndex(m => m.type === 'poshmark');
                      if (poshIndex >= 0) {
                        urls[poshIndex] = { ...urls[poshIndex], url: e.target.value };
                      } else {
                        urls.push({ type: 'poshmark', url: e.target.value });
                      }
                      setEditData({ ...editData, marketplaceUrls: urls });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-1.5 py-0.5 text-[9px] text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Poshmark URL"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-1 mt-2 pt-2 border-t border-gray-700">
                  <button
                    onClick={handleSave}
                    className="flex-1 rounded bg-green-600 hover:bg-green-700 px-2 py-1.5 text-[10px] font-bold text-white transition-colors flex items-center justify-center gap-1"
                  >
                    <Save className="h-3 w-3" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 rounded bg-red-600 hover:bg-red-700 px-2 py-1.5 text-[10px] font-bold text-white transition-colors flex items-center justify-center gap-1"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
                
                <p className="text-[8px] text-center text-gray-500 mt-1">Double-click to flip back</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
