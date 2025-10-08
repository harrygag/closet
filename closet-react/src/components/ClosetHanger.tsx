// Flippable Pokemon card hanger component
import React, { useState } from 'react';
import type { Item, ItemTag } from '../types/item';
import { clsx } from 'clsx';
import { Save, X, Image as ImageIcon } from 'lucide-react';

// Pokemon energy types for each category
const ENERGY_TYPES: Record<ItemTag, { symbol: string; color: string; name: string }> = {
  'Hoodie': { symbol: '🔮', color: 'text-purple-500', name: 'Psychic' },
  'Jersey': { symbol: '🌿', color: 'text-green-500', name: 'Grass' },
  'polo': { symbol: '⭐', color: 'text-gray-500', name: 'Normal' },
  'Pullover/Jackets': { symbol: '🔥', color: 'text-red-500', name: 'Fire' },
  'T-shirts': { symbol: '💧', color: 'text-blue-500', name: 'Water' },
  'Bottoms': { symbol: '🌙', color: 'text-indigo-600', name: 'Dark' },
};

// Toast notification helper
const toast = {
  success: (message: string) => {
    console.log('✓', message);
  }
};

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
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [editData, setEditData] = useState(item);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  // Get energy type based on primary tag
  const energyType = item.tags.length > 0 
    ? ENERGY_TYPES[item.tags[0]] 
    : { symbol: '⭐', color: 'text-purple-500', name: 'Normal' };
  
  // Image gallery - support up to 5 images stored as JSON in notes field
  const getImageGallery = (): string[] => {
    try {
      if (item.notes && item.notes.startsWith('[')) {
        const parsed = JSON.parse(item.notes);
        if (Array.isArray(parsed)) {
          return parsed.filter(img => img && typeof img === 'string');
        }
      }
    } catch {}
    return item.imageUrl ? [item.imageUrl] : [];
  };
  
  const imageGallery = getImageGallery();

  // Calculate days since listing (use dateField or dateAdded)
  const getListingDate = () => {
    const dateStr = item.dateField || item.dateAdded;
    if (!dateStr) return new Date();
    return new Date(dateStr);
  };
  
  const listingDate = getListingDate();
  const today = new Date();
  const daysSinceList = Math.floor((today.getTime() - listingDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysListed = daysSinceList;
  
  // HP Calculation (31 days = 310 HP, counts down 10 HP per day)
  const DAYS_UNTIL_ELIMINATION = 31;
  
  const getHP = (): number => {
    const daysRemaining = DAYS_UNTIL_ELIMINATION - daysListed;
    if (daysRemaining <= 0) return 0;
    return daysRemaining * 10;
  };
  
  const isEliminated = (): boolean => {
    return daysListed >= DAYS_UNTIL_ELIMINATION;
  };
  
  // Warning system
  const getWarnings = (): { type: 'red' | 'yellow'; message: string }[] => {
    const warnings: { type: 'red' | 'yellow'; message: string }[] = [];
    
    // RED warnings (critical)
    if (item.status === 'Inactive') {
      warnings.push({ type: 'red', message: 'Item is Inactive' });
    }
    if (!item.ebayUrl && (!item.marketplaceUrls || item.marketplaceUrls.length === 0)) {
      warnings.push({ type: 'red', message: 'No marketplace URL' });
    }
    if (!item.sellingPrice || item.sellingPrice === 0) {
      warnings.push({ type: 'red', message: 'No price set' });
    }
    
    // YELLOW warnings (minor)
    if (!item.imageUrl && imageGallery.length === 0) {
      warnings.push({ type: 'yellow', message: 'No images' });
    }
    if (!item.size) {
      warnings.push({ type: 'yellow', message: 'No size' });
    }
    if (!item.hangerId) {
      warnings.push({ type: 'yellow', message: 'No hanger ID' });
    }
    
    return warnings;
  };
  
  const warnings = getWarnings();
  const hasRedWarnings = warnings.some(w => w.type === 'red');
  const hasYellowWarnings = warnings.some(w => w.type === 'yellow');
  
  // Format helpers
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };
  
  const formatDays = (days: number): string => {
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  };

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
      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          const imageUrl = reader.result as string;
          onImageUpload(item.id, imageUrl);
        };
        reader.readAsDataURL(imageFile);
      } catch (error) {
        console.error('Failed to upload image:', error);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/') && onImageUpload) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageUrl = reader.result as string;
        
        // Update image gallery
        const newGallery = [...imageGallery];
        newGallery[index] = imageUrl;
        
        // Store gallery in notes field as JSON
        const updatedItem = {
          ...item,
          imageUrl: newGallery[0] || '',
          notes: JSON.stringify(newGallery.filter(img => img))
        };
        
        if (onUpdate) {
          onUpdate(updatedItem);
        }
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

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(!isFlipped);
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
        onChange={(e) => handleFileSelect(e, selectedImageIndex)}
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
        {/* FRONT SIDE - Pokemon Card */}
        <div
          className="relative rounded-xl overflow-hidden shadow-xl border-[8px] border-yellow-400"
          onDoubleClick={handleDoubleClick}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            background: '#FFFACD',
            width: '200px',
            maxWidth: '85vw',
          }}
        >
          {/* Header - Name, Energy Type (left), and HP (right) */}
          <div className="px-2.5 py-1 pb-0">
            <div className="flex justify-between items-start">
              {/* Left: Energy Type Symbol */}
              <div className="flex items-center gap-1">
                <span className="text-lg leading-none">{energyType.symbol}</span>
              </div>
              
              {/* Right: HP */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xs text-gray-700 font-bold">HP</span>
                <span className={`font-bold text-lg leading-none ${isEliminated() ? 'text-gray-500' : 'text-red-600'}`}>
                  {isEliminated() ? "0" : getHP()}
                </span>
              </div>
            </div>
            
            {/* Item Name - below energy and HP */}
            <h3 className="text-gray-900 font-bold text-sm leading-tight mt-0.5" style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {item.name}
            </h3>
            
            {isEliminated() && (
              <div className="text-[7px] text-red-600 font-bold text-center bg-red-100 rounded px-1 mt-0.5">
                ELIMINATED - RELIST NOW
              </div>
            )}
          </div>

          {/* Main Image */}
          <div className="px-2.5">
            <div className="relative h-28 bg-gradient-to-br from-white to-gray-100 rounded border border-gray-300 overflow-hidden cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                document.getElementById(`main-file-input-${item.id}`)?.click();
              }}
            >
              {imageGallery[selectedImageIndex] ? (
                <img
                  src={imageGallery[selectedImageIndex]}
                  alt={item.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-gray-400 mb-1" />
                  <span className="text-[9px] text-gray-500 font-medium">Tap to add</span>
                </div>
              )}
              <input
                id={`main-file-input-${item.id}`}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e, selectedImageIndex)}
                aria-label={`Upload photo ${selectedImageIndex + 1} for ${item.name}`}
              />
            </div>
            
            {/* Thumbnails */}
            <div className="flex gap-0.5 mt-1 mb-1">
              {[0, 1, 2, 3, 4].map((idx) => (
                <div
                  key={idx}
                  className={clsx(
                    "w-6 h-6 rounded border cursor-pointer overflow-hidden flex-shrink-0",
                    selectedImageIndex === idx ? "border-blue-600 border-2" : "border-gray-400"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (imageGallery[idx]) {
                      setSelectedImageIndex(idx);
                    } else {
                      document.getElementById(`thumb-input-${item.id}-${idx}`)?.click();
                    }
                  }}
                >
                  {imageGallery[idx] ? (
                    <img src={imageGallery[idx]} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                      <ImageIcon className="w-3 h-3 text-gray-400" />
                    </div>
                  )}
                  <input
                    id={`thumb-input-${item.id}-${idx}`}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, idx)}
                    aria-label={`Upload photo ${idx + 1} for ${item.name}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Attacks */}
          <div className="px-2.5 py-1 space-y-1">
            {/* Attack 1 - Hanger ID & Size */}
            <div className="flex items-start gap-1.5 border-b border-gray-300 pb-1">
              <span className="text-[10px] flex-shrink-0 pt-0.5">{energyType.symbol}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <div className="text-gray-900 font-bold text-[9px]">Hanger ID</div>
                    <div className="text-gray-600 text-[7px] mt-0.5">Size: {item.size || 'N/A'}</div>
                  </div>
                  <div className="text-purple-600 font-bold text-sm leading-none flex-shrink-0 ml-1.5">
                    {item.hangerId || '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Attack 2 - Price */}
            <div className="flex items-start gap-1.5">
              <div className="flex gap-0.5 flex-shrink-0 pt-0.5">
                <span className="text-[10px]">{energyType.symbol}</span>
                <span className="text-[10px]">{energyType.symbol}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <div className="text-gray-900 font-bold text-[9px]">Sale Price</div>
                    <div className="text-gray-600 text-[7px] mt-0.5">Listed {formatDays(daysListed)}</div>
                  </div>
                  <div className="text-red-600 font-bold text-sm leading-none flex-shrink-0 ml-1.5">
                    {formatCurrency(item.sellingPrice || 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Warning Icons - Top Right Corner */}
          {(hasRedWarnings || hasYellowWarnings) && (
            <div className="absolute top-1 right-1 z-10 flex gap-0.5" title={warnings.map(w => w.message).join(', ')}>
              {hasRedWarnings && (
                <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow-md border-2 border-white">
                  <span className="text-white text-[10px] font-bold">!</span>
                </div>
              )}
              {hasYellowWarnings && !hasRedWarnings && (
                <div className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center shadow-md border-2 border-white">
                  <span className="text-black text-[10px] font-bold">⚠</span>
                </div>
              )}
            </div>
          )}

          {/* Footer - Marketplaces */}
          <div className={`px-3 py-1.5 border-t-2 transition-all duration-300 ${
            item.ebayUrl || (item.marketplaceUrls && item.marketplaceUrls.length > 0)
              ? 'bg-gradient-to-r from-blue-500 via-orange-500 to-pink-500 border-yellow-600'
              : 'bg-gray-200 border-gray-400'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-[9px] font-bold ${
                item.ebayUrl || (item.marketplaceUrls && item.marketplaceUrls.length > 0)
                  ? 'text-white drop-shadow-md'
                  : 'text-gray-700'
              }`}>MARKETPLACES</span>
              <div className="flex gap-1.5">
                {/* eBay - Blue circle */}
                <div
                  className={`w-5 h-5 rounded-full transition-all border-2 ${
                    item.ebayUrl
                      ? 'bg-blue-500 border-blue-600 hover:scale-110 cursor-pointer shadow-md'
                      : 'bg-white border-gray-400'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.ebayUrl) {
                      navigator.clipboard.writeText(item.ebayUrl);
                      toast.success('eBay link copied');
                    }
                  }}
                  title={item.ebayUrl ? 'Click to copy eBay URL' : 'Not listed on eBay'}
                />

                {/* Mercari - Orange circle */}
                <div
                  className={`w-5 h-5 rounded-full transition-all border-2 ${
                    item.marketplaceUrls?.some(m => m.type === 'mercari' && m.url)
                      ? 'bg-orange-500 border-orange-600 hover:scale-110 cursor-pointer shadow-md'
                      : 'bg-white border-gray-400'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = item.marketplaceUrls?.find(m => m.type === 'mercari' && m.url)?.url;
                    if (url) {
                      navigator.clipboard.writeText(url);
                      toast.success('Mercari link copied');
                    }
                  }}
                  title={item.marketplaceUrls?.some(m => m.type === 'mercari' && m.url) ? 'Click to copy Mercari URL' : 'Not listed on Mercari'}
                />

                {/* Poshmark - Pink circle */}
                <div
                  className={`w-5 h-5 rounded-full transition-all border-2 ${
                    item.marketplaceUrls?.some(m => m.type === 'poshmark' && m.url)
                      ? 'bg-pink-500 border-pink-600 hover:scale-110 cursor-pointer shadow-md'
                      : 'bg-white border-gray-400'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = item.marketplaceUrls?.find(m => m.type === 'poshmark' && m.url)?.url;
                    if (url) {
                      navigator.clipboard.writeText(url);
                      toast.success('Poshmark link copied');
                    }
                  }}
                  title={item.marketplaceUrls?.some(m => m.type === 'poshmark' && m.url) ? 'Click to copy Poshmark URL' : 'Not listed on Poshmark'}
                />
              </div>
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
          {/* Edit Form Card */}
          <div className="flex justify-center">
            <div className="w-48 rounded-lg border-2 border-purple-500 bg-gradient-to-br from-gray-800 to-gray-900 p-3 shadow-2xl">
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
