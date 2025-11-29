// Flippable Pokemon card hanger component
import React, { useState } from 'react';
import type { Item, ItemTag } from '../types/item';
import { clsx } from 'clsx';
import { Save, X, Image as ImageIcon, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { BarcodeImage } from './BarcodeImage';

// Pokemon energy types for each category with border colors
const ENERGY_TYPES: Record<ItemTag, { symbol: string; color: string; borderColor: string; name: string }> = {
  'Hoodie': { symbol: '👻', color: 'text-purple-500', borderColor: '#A040A0', name: 'Psychic' },
  'Jersey': { symbol: '🌿', color: 'text-green-500', borderColor: '#78C850', name: 'Grass' },
  'Polo': { symbol: '⚙️', color: 'text-gray-400', borderColor: '#B8B8D0', name: 'Steel' },
  'Pullover/Jackets': { symbol: '🔥', color: 'text-red-500', borderColor: '#F08030', name: 'Fire' },
  'T-shirts': { symbol: '💧', color: 'text-blue-500', borderColor: '#6890F0', name: 'Water' },
  'Bottoms': { symbol: '👊', color: 'text-orange-700', borderColor: '#C03028', name: 'Fighting' },
};

interface ClosetHangerProps {
  item: Item;
  onClick: (item: Item) => void;
  onImageUpload?: (itemId: string, imageUrl: string) => void;
  onUpdate?: (item: Item) => void;
  onPrintLabel?: (item: Item) => void;
  isDragging?: boolean;
  position?: number;
}

// All category options for the switcher
const ALL_CATEGORIES: ItemTag[] = ['Hoodie', 'Jersey', 'Polo', 'Pullover/Jackets', 'T-shirts', 'Bottoms'];

export const ClosetHanger: React.FC<ClosetHangerProps> = ({
  item,
  onImageUpload,
  onUpdate,
  onPrintLabel: _onPrintLabel, // Print handled inline now
  isDragging = false,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [editData, setEditData] = useState(item);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showCategorySwitcher, setShowCategorySwitcher] = useState(false);
  
  // Get energy type based on primary tag
  const energyType = item.tags.length > 0 
    ? ENERGY_TYPES[item.tags[0]] 
    : { symbol: '⭐', color: 'text-gray-400', borderColor: '#CCCCCC', name: 'Normal' };
  
  // Image gallery - support up to 5 images stored in special format in notes field
  // Format: __IMG__:["url1","url2"]__NOTES__:actual user notes
  const getImageGallery = (): string[] => {
    try {
      if (item.notes) {
        // Check for new format with __IMG__ delimiter
        const imgMatch = item.notes.match(/__IMG__:(.*?)(__NOTES__|$)/);
        if (imgMatch) {
          const parsed = JSON.parse(imgMatch[1]);
          if (Array.isArray(parsed)) {
            return parsed.filter(img => img && typeof img === 'string');
          }
        }
        // Fallback: Legacy format (plain JSON array) - DEPRECATED
        else if (item.notes.startsWith('[')) {
          const parsed = JSON.parse(item.notes);
          if (Array.isArray(parsed)) {
            return parsed.filter(img => img && typeof img === 'string');
          }
        }
      }
    } catch {}
    return item.imageUrl ? [item.imageUrl] : [];
  };
  
  // Extract actual user notes (without image gallery encoding)
  const getUserNotes = (): string => {
    if (!item.notes) return '';
    const notesMatch = item.notes.match(/__NOTES__:(.*?)$/);
    if (notesMatch) {
      return notesMatch[1];
    }
    // If no __NOTES__ delimiter, check if it's legacy JSON format
    if (item.notes.startsWith('[')) {
      return ''; // Legacy format had no notes
    }
    return item.notes; // Plain text notes
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
  
  // HP Calculation (31 days countdown - HP = days remaining)
  const DAYS_UNTIL_ELIMINATION = 31;
  
  const getHP = (): number => {
    const daysRemaining = DAYS_UNTIL_ELIMINATION - daysListed;
    if (daysRemaining <= 0) return 0;
    return daysRemaining; // HP directly equals days remaining
  };
  
  const isEliminated = (): boolean => {
    return daysListed >= DAYS_UNTIL_ELIMINATION;
  };
  
  // Warning system - yellow border for missing images
  const hasYellowWarning = (): boolean => {
    // Yellow warning if no images
    const noImages = !item.imageUrl && imageGallery.length === 0;
    return noImages;
  };
  
  const showYellowBorder = hasYellowWarning();
  
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
        
        // Get current user notes (without gallery data)
        const currentUserNotes = getUserNotes();
        
        // Encode gallery and notes in new format: __IMG__:[...]__NOTES__:notes
        const galleryJson = JSON.stringify(newGallery.filter(img => img));
        const encodedNotes = `__IMG__:${galleryJson}__NOTES__:${currentUserNotes}`;
        
        const updatedItem = {
          ...item,
          imageUrl: newGallery[0] || '',
          notes: encodedNotes
        };
        
        console.log('📸 Updated image gallery, preserving user notes:', currentUserNotes ? 'Yes' : 'None');
        
        if (onUpdate) {
          onUpdate(updatedItem);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Don't flip if double-clicking on input, select, or button
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'BUTTON') {
      return;
    }
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

  // Handle category/gym change
  const handleCategoryChange = (newCategory: ItemTag) => {
    if (onUpdate && newCategory !== item.tags[0]) {
      const updatedItem = {
        ...item,
        tags: [newCategory],
      };
      onUpdate(updatedItem);
      toast.success(`Moved to ${ENERGY_TYPES[newCategory].name}!`);
    }
    setShowCategorySwitcher(false);
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
        className="relative"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
          transition: 'transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)',
        }}
      >
        {/* Warning Border Wrapper */}
        <div
          className="relative rounded-xl"
          style={{
            padding: showYellowBorder ? '4px' : '0',
            background: showYellowBorder ? '#FACC15' : 'transparent',
          }}
        >
          {/* FRONT SIDE - Pokemon Card */}
          <div
            className="relative rounded-xl overflow-hidden shadow-xl"
            onDoubleClick={handleDoubleClick}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              background: '#1a1a1a',
              border: `8px solid ${energyType.borderColor}`,
              width: 'min(200px, 90vw)', // Mobile-optimized: scales down to 90% viewport width on small screens
              maxWidth: '200px',
            }}
          >
          {/* Header - Energy Type Name (left), Category, and HP (right) */}
          <div className="px-2.5 pt-1 pb-0 relative">
            <div className="flex justify-between items-center">
              {/* Left: Energy Type Name with Symbol - CLICKABLE for category change */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCategorySwitcher(!showCategorySwitcher);
                }}
                className="flex items-center gap-0.5 hover:opacity-80 transition-opacity rounded px-1 -ml-1 hover:bg-white/10"
                title="Click to change category"
              >
                <span className="text-sm leading-none">{energyType.symbol}</span>
                <span className="text-[9px] font-bold" style={{ color: energyType.borderColor }}>{energyType.name}</span>
                <span className="text-[8px] text-gray-400 ml-0.5">▼</span>
              </button>

              {/* Right: HP */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <span className="text-[9px] font-bold text-gray-400">HP</span>
                <span className={`font-bold text-base leading-none ${isEliminated() ? 'text-gray-500' : 'text-red-400'}`}>
                  {isEliminated() ? "0" : getHP()}
                </span>
              </div>
            </div>

            {/* Category Switcher Dropdown */}
            {showCategorySwitcher && (
              <div
                className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-600 rounded-lg shadow-xl overflow-hidden"
                style={{ minWidth: '140px' }}
              >
                {ALL_CATEGORIES.map((cat) => {
                  const catEnergy = ENERGY_TYPES[cat];
                  const isCurrentCategory = item.tags[0] === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCategoryChange(cat);
                      }}
                      className={clsx(
                        "w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-700 transition-colors",
                        isCurrentCategory && "bg-gray-700"
                      )}
                    >
                      <span className="text-sm">{catEnergy.symbol}</span>
                      <span className="text-[10px] font-bold" style={{ color: catEnergy.borderColor }}>
                        {catEnergy.name}
                      </span>
                      {isCurrentCategory && <span className="text-[8px] text-green-400 ml-auto">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Category Tag & Item Name - same line */}
            <div className="flex items-center gap-1.5 mt-0.5">
              {item.tags.length > 0 && (
                <span className="text-[7px] font-semibold px-1 py-0.5 rounded flex-shrink-0" style={{
                  backgroundColor: `${energyType.borderColor}20`,
                  color: energyType.borderColor
                }}>
                  {item.tags[0]}
                </span>
              )}

              <h3 className="text-white font-bold text-[10px] leading-tight flex-1" style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.name}
              </h3>
            </div>
            
            {isEliminated() && (
              <div className="text-[6px] text-red-400 font-bold text-center bg-red-950 rounded px-1 mt-0.5">
                ELIMINATED - RELIST NOW
              </div>
            )}
          </div>

          {/* Main Image */}
          <div className="px-2.5 pt-0.5">
            <div className="relative h-32 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg overflow-hidden cursor-pointer touch-manipulation active:scale-95 transition-transform"
              style={{ border: `2px solid ${energyType.borderColor}` }}
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
                  <ImageIcon className="w-8 h-8 text-gray-500 mb-1" />
                  <span className="text-[9px] text-gray-400 font-medium">Tap to add</span>
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
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                      <ImageIcon className="w-3 h-3 text-gray-600" />
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
          <div className="px-2.5 pt-1.5 pb-1.5 space-y-1.5">
            {/* Attack 1 - Hanger ID & Size */}
            <div className="flex items-start gap-1.5 pb-1">
              <span className="text-[10px] flex-shrink-0 pt-0.5">{energyType.symbol}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <div className="text-gray-200 font-bold text-[9px]">Hanger ID</div>
                    <div className="text-gray-400 text-[7px] mt-0.5">Size: {item.size || 'N/A'}</div>
                  </div>
                  <div className="text-purple-400 font-bold text-sm leading-none flex-shrink-0 ml-1.5">
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
                    <div className="text-gray-200 font-bold text-[9px]">Sale Price</div>
                    <div className="text-gray-400 text-[7px] mt-0.5">Listed {formatDays(daysListed)}</div>
                  </div>
                  <div className="text-green-400 font-bold text-sm leading-none flex-shrink-0 ml-1.5">
                    {formatCurrency(item.sellingPrice || 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>


          {/* Barcode Section */}
          <div className="px-2.5 py-1.5">
            {item.barcode ? (
              <div className="space-y-1">
                {/* QR code for easy screen scanning */}
                <div className="flex justify-center">
                  <BarcodeImage value={item.barcode} width={80} height={80} useQR={true} />
                </div>
                <p className="text-[8px] text-gray-400 text-center font-mono truncate">{item.barcode}</p>
                {/* Action buttons */}
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.barcode && navigator.clipboard) {
                        navigator.clipboard.writeText(item.barcode);
                        toast.success('Barcode copied');
                      }
                    }}
                    className="rounded bg-gray-700 px-1.5 py-0.5 text-[8px] font-semibold text-gray-200 hover:bg-gray-600"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Open print window with just this barcode
                      const printWindow = window.open('', '_blank', 'width=400,height=300');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title>Print Barcode - ${item.name}</title>
                              <style>
                                body { font-family: sans-serif; text-align: center; padding: 20px; }
                                .label { border: 1px dashed #ccc; padding: 10px; display: inline-block; }
                                .name { font-size: 12px; font-weight: bold; margin-bottom: 5px; }
                                .size { font-size: 10px; color: #666; margin-bottom: 8px; }
                                canvas { display: block; margin: 0 auto; }
                              </style>
                              <script src="https://cdn.jsdelivr.net/npm/bwip-js@3"></script>
                            </head>
                            <body>
                              <div class="label">
                                <div class="name">${item.name}</div>
                                <div class="size">Size: ${item.size || 'N/A'}</div>
                                <canvas id="barcode"></canvas>
                              </div>
                              <script>
                                bwipjs.toCanvas('barcode', {
                                  bcid: 'code128',
                                  text: '${item.barcode}',
                                  scale: 3,
                                  height: 12,
                                  includetext: true,
                                  textxalign: 'center',
                                });
                                setTimeout(() => { window.print(); }, 500);
                              </script>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }}
                    className="rounded bg-purple-700 px-1.5 py-0.5 text-[8px] font-semibold text-purple-100 hover:bg-purple-600 flex items-center gap-0.5"
                  >
                    <Printer className="w-2.5 h-2.5" />
                    Print
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[10px] font-semibold text-red-400 text-center">Needs barcode - Click Fix Data</p>
            )}
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
          {/* Edit Form Card - Mobile optimized with scroll */}
          <div className="flex justify-center" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-[90vw] sm:w-48 rounded-lg border-2 border-purple-500 bg-gradient-to-br from-gray-800 to-gray-900 p-3 shadow-2xl max-h-[80vh] overflow-y-auto">
              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm font-bold text-purple-400 text-center mb-2">QUICK EDIT</p>
                
                {/* Name */}
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  onBlur={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                  className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                  placeholder="Item Name"
                  autoFocus
                />
                
                {/* Hanger ID */}
                <input
                  type="text"
                  value={editData.hangerId}
                  onChange={(e) => setEditData({ ...editData, hangerId: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
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
                    onFocus={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Size"
                  />
                  <select
                    value={editData.status}
                    onChange={(e) => setEditData({ ...editData, status: e.target.value as any })}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    aria-label="Status"
                    className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="SOLD">SOLD</option>
                  </select>
                </div>
                
                {/* Listed Date */}
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 font-semibold">LISTED DATE</p>
                  <input
                    type="date"
                    value={editData.dateField || editData.dateAdded || ''}
                    onChange={(e) => setEditData({ ...editData, dateField: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                    aria-label="Date listed"
                    className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                  />
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
                    onFocus={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Cost $"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={editData.sellingPrice || ''}
                    onChange={(e) => setEditData({ ...editData, sellingPrice: parseFloat(e.target.value) || 0 })}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-full rounded bg-gray-700 px-2 py-1.5 text-xs text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Selling $"
                  />
                </div>


                {/* Action Buttons - Larger touch targets for mobile */}
                <div className="flex gap-1 mt-2 pt-2 border-t border-gray-700">
                  <button
                    onClick={handleSave}
                    className="flex-1 rounded bg-green-600 hover:bg-green-700 active:bg-green-800 px-2 py-3 sm:py-2 text-xs font-bold text-white transition-colors flex items-center justify-center gap-1 touch-manipulation"
                  >
                    <Save className="h-3 w-3" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 rounded bg-red-600 hover:bg-red-700 active:bg-red-800 px-2 py-3 sm:py-2 text-xs font-bold text-white transition-colors flex items-center justify-center gap-1 touch-manipulation"
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
