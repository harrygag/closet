// Flippable playing card hanger component
import React, { useState } from 'react';
import type { Item, MarketplaceUrl } from '../types/item';
import { MARKETPLACE_ICONS, MARKETPLACE_COLORS } from '../utils/marketplace';
import { clsx } from 'clsx';
import { Shirt, Upload, Save, X } from 'lucide-react';

interface ClosetHangerProps {
  item: Item;
  onClick: (item: Item) => void;
  onImageUpload?: (itemId: string, imageUrl: string) => void;
  onUpdate?: (item: Item) => void;
  isDragging?: boolean;
  position?: number;
}

export const ClosetHanger: React.FC<ClosetHangerProps> = ({
  item,
  onImageUpload,
  onUpdate,
  isDragging = false,
  position
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Get badge color based on category
  const getBadgeColor = () => {
    if (item.tags.includes('polo')) return 'bg-white text-gray-900 border-2 border-gray-300';
    if (item.tags.includes('Hoodie')) return 'bg-pink-500 text-white';
    if (item.tags.includes('T-shirts')) return 'bg-blue-500 text-white';
    if (item.tags.includes('Jersey')) return 'bg-green-500 text-white';
    if (item.tags.includes('Pullover/Jackets')) return 'bg-red-500 text-white';
    if (item.tags.includes('Bottoms')) return 'bg-orange-500 text-white';
    return 'bg-purple-600 text-white'; // Default
  };
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editData, setEditData] = useState(item);

  // Build complete marketplace list with eBay + others
  const marketplaceUrls: MarketplaceUrl[] = [];
  
  // Add eBay if URL exists
  if (item.ebayUrl && item.ebayUrl.trim()) {
    marketplaceUrls.push({
      type: 'ebay',
      url: item.ebayUrl,
      price: item.sellingPrice
    });
  }
  
  // Add other marketplaces from marketplaceUrls array
  if (item.marketplaceUrls && item.marketplaceUrls.length > 0) {
    marketplaceUrls.push(...item.marketplaceUrls);
  }

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

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isFlipped && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/') && onImageUpload) {
      setIsUploading(true);
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
      reader.readAsDataURL(file);
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

  const handleTitleDoubleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(item.name);
      // Visual feedback - could add a toast notification here
      const target = e.currentTarget as HTMLElement;
      const originalText = target.textContent;
      target.textContent = '✓ Copied!';
      setTimeout(() => {
        target.textContent = originalText;
      }, 1000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={clsx(
        'group relative cursor-pointer transition-all duration-300',
        isDragging && 'opacity-50 scale-95',
        isDropping && 'ring-2 ring-purple-500 ring-offset-2 ring-offset-gray-800',
        isFlipped && 'z-50'
      )}
      style={{
        perspective: '1000px',
        animation: isDragging ? 'none' : 'sway 3s ease-in-out infinite',
        animationDelay: `${Math.random() * 2}s`,
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload item photo"
      />
      
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

          {/* Item Card - ORIGINAL SIZE with bigger mobile fonts */}
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
              <div
                className="flex-1 flex items-center justify-center p-1 cursor-pointer"
                onClick={handleImageClick}
              >
                {item.imageUrl && item.imageUrl.trim() !== '' ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-full w-full object-cover rounded"
                    key={item.imageUrl}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1 hover:scale-105 transition-transform">
                    <Shirt className="h-10 w-10 text-gray-400" />
                    <p className="text-sm font-bold text-gray-700">Click or Drop</p>
                  </div>
                )}
              </div>

              {/* Bottom info bar - Bigger font */}
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-2 py-1 rounded-b-lg">
                <p
                  className="text-sm font-bold text-white truncate text-center cursor-pointer hover:bg-white/10 rounded px-1 transition-colors"
                  onDoubleClick={handleTitleDoubleClick}
                  title="Double-click to copy"
                >
                  {item.name}
                </p>
                {item.size && (
                  <p className="text-xs text-purple-100 text-center">{item.size}</p>
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
                  <div className="flex flex-col gap-0.5 bg-gray-900/95 backdrop-blur-sm px-1.5 py-1 rounded border border-gray-700 shadow-lg">
                    {marketplaceUrls.slice(0, 3).map((marketplace, index) => {
                      const Icon = MARKETPLACE_ICONS[marketplace.type];
                      const price = marketplace.price || 0;
                      return (
                        <a
                          key={index}
                          href={marketplace.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 transition-transform hover:scale-105"
                          title={`${marketplace.type}: $${price}`}
                          style={{ color: MARKETPLACE_COLORS[marketplace.type] }}
                        >
                          <Icon className="h-3 w-3" />
                          {price > 0 && (
                            <span className="text-[10px] font-bold text-white">
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
                  <div className="rotate-12 rounded bg-blue-600 px-2 py-1 text-sm font-bold text-white shadow-xl border-2 border-blue-400">
                    SOLD
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Auto-numbered position badge with color coding */}
          <div className="mt-3 flex justify-center">
            <div className={clsx(
              'rounded-full px-4 py-1.5 text-sm font-bold shadow-md',
              getBadgeColor()
            )}>
              {item.hangerId || (position ? `#${position}` : '')}
            </div>
          </div>
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
            <div className="h-8 w-1 bg-gradient-to-b from-gray-500 to-gray-600 rounded-full" />
          </div>

          {/* Hanger Top */}
          <div className="flex justify-center -mt-1">
            <svg width="120" height="30" viewBox="0 0 60 20">
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
            <div className="w-40 rounded-lg border-2 border-purple-500 bg-gradient-to-br from-gray-800 to-gray-900 p-3 shadow-2xl">
              <div className="space-y-2">
                <p className="text-sm font-bold text-purple-400 text-center mb-2">QUICK EDIT</p>
                
                {/* Name */}
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                  placeholder="Item Name"
                />
                
                {/* Hanger ID */}
                <input
                  type="text"
                  value={editData.hangerId}
                  onChange={(e) => setEditData({ ...editData, hangerId: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none font-bold"
                  placeholder="Hanger ID"
                />
                
                {/* Size & Status */}
                <div className="grid grid-cols-2 gap-1">
                  <input
                    type="text"
                    value={editData.size}
                    onChange={(e) => setEditData({ ...editData, size: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Size"
                  />
                  <select
                    value={editData.status}
                    onChange={(e) => setEditData({ ...editData, status: e.target.value as any })}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Status"
                    className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="SOLD">SOLD</option>
                  </select>
                </div>
                
                {/* Prices */}
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 font-semibold">PRICES</p>
                  <input
                    type="number"
                    step="0.01"
                    value={editData.costPrice || ''}
                    onChange={(e) => setEditData({ ...editData, costPrice: parseFloat(e.target.value) || 0 })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Cost $"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={editData.sellingPrice || ''}
                    onChange={(e) => setEditData({ ...editData, sellingPrice: parseFloat(e.target.value) || 0 })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Selling $"
                  />
                </div>
                
                {/* Image URL */}
                <input
                  type="url"
                  value={editData.imageUrl || ''}
                  onChange={(e) => setEditData({ ...editData, imageUrl: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                  placeholder="Image URL or drop file"
                />

                {/* Marketplace URLs */}
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 font-semibold">MARKETPLACES</p>
                  <input
                    type="url"
                    value={editData.ebayUrl || ''}
                    onChange={(e) => setEditData({ ...editData, ebayUrl: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-2 py-1 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
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
                    className="w-full rounded bg-gray-700 px-2 py-1 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
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
                    className="w-full rounded bg-gray-700 px-2 py-1 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Poshmark URL"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-1 mt-2 pt-2 border-t border-gray-700">
                  <button
                    onClick={handleSave}
                    className="flex-1 rounded bg-green-600 hover:bg-green-700 px-2 py-2 text-xs font-bold text-white transition-colors flex items-center justify-center gap-1"
                  >
                    <Save className="h-3 w-3" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 rounded bg-red-600 hover:bg-red-700 px-2 py-2 text-xs font-bold text-white transition-colors flex items-center justify-center gap-1"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
                
                <p className="text-xs text-center text-gray-500 mt-1">Double-click to flip back</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
