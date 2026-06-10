// Modern inventory card component with flip animation
import React, { useState } from 'react';
import type { Item } from '../types/item';
import { clsx } from 'clsx';
import { Save, X, Image as ImageIcon, Info, Copy as CopyIcon, MoreVertical, Upload, Clock, DollarSign, Tag as TagIcon } from 'lucide-react';
import { toast } from 'sonner';
import { EbayDetailsModal } from './EbayDetailsModal';
import { ListToEbayModal } from './ListToEbayModal';
import { ebayService } from '../services/ebayService';

interface ClosetHangerProps {
  item: Item;
  onClick: (item: Item) => void;
  onImageUpload?: (itemId: string, imageUrl: string) => void;
  onUpdate?: (item: Item) => void;
  onPrintLabel?: (item: Item) => void;
  isDragging?: boolean;
  position?: number;
  isSelected?: boolean;
  onSelect?: (itemId: string, selected: boolean) => void;
}

export const ClosetHanger: React.FC<ClosetHangerProps> = ({
  item,
  onImageUpload,
  onUpdate,
  onPrintLabel: _onPrintLabel, // Print handled inline now
  isDragging = false,
  isSelected = false,
  onSelect,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [editData, setEditData] = useState(item);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showEbayDetails, setShowEbayDetails] = useState(false);
  const [showListToEbay, setShowListToEbay] = useState(false);
  const [isCreatingRelisting, setIsCreatingRelisting] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  
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

    // Fallback priority: imageUrl > ebayPhotos > ebayPrimaryImage
    if (item.imageUrl) {
      return [item.imageUrl];
    }

    // Use eBay photos if available (prioritize Firebase backup URLs)
    if (item.ebayPhotos && item.ebayPhotos.length > 0) {
      return item.ebayPhotos
        .sort((a, b) => a.order - b.order) // Sort by order
        .map(photo => photo.firebaseStorageUrl || photo.ebayUrl) // Prefer Firebase URLs
        .filter(url => url);
    }

    // Last resort: primary eBay image
    if (item.ebayPrimaryImage) {
      return [item.ebayPrimaryImage];
    }

    return [];
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

  // Warning system for stale items (30+ days old)
  const isStaleItem = daysListed >= 30;

  // Status badge color based on item condition (Apple glass style)
  const getStatusColor = (): string => {
    if (item.status === 'SOLD') return 'bg-green-500/10 text-green-700 border-green-200';
    if (item.status === 'Inactive') return 'bg-gray-500/10 text-gray-700 border-gray-200';
    if (isStaleItem) return 'bg-orange-500/10 text-orange-700 border-orange-200';
    return 'bg-blue-500/10 text-blue-700 border-blue-200';
  };

  // Get the display price - prioritize manualPriceCents (in cents), fall back to sellingPrice, then ebayPrice
  const getDisplayPrice = (): number => {
    // Priority 1: manualPriceCents (from AI/bulk updates)
    if (item.manualPriceCents !== undefined && item.manualPriceCents !== null && item.manualPriceCents > 0) {
      return item.manualPriceCents / 100; // Convert cents to dollars
    }
    // Priority 2: sellingPrice (from imports)
    if (item.sellingPrice && item.sellingPrice > 0) {
      return item.sellingPrice;
    }
    // Priority 3: ebayPrice (from eBay imports, in cents)
    if (item.ebayPrice && item.ebayPrice > 0) {
      return item.ebayPrice / 100; // Convert cents to dollars
    }
    return 0;
  };

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


  // Handle relisting using eBay's End-Relist workflow
  const handleCreateRelisting = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!item.ebayListingId) {
      toast.error('No eBay listing ID found');
      return;
    }

    try {
      setIsCreatingRelisting(true);
      setShowActionsMenu(false);

      // Step 1: End the active listing
      toast.info('Ending active listing...');
      await ebayService.endItem(item.ebayListingId);

      // Step 2: Relist with all details automatically copied
      toast.info('Relisting item...');
      const result = await ebayService.relistItem(item.ebayListingId);

      if (result.success) {
        toast.success(
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Successfully relisted!</span>
            <span className="text-xs">New Item ID: {result.itemId}</span>
            <a
              href={result.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline text-xs"
            >
              View listing
            </a>
          </div>,
          { duration: 10000 }
        );
        console.log('Relist successful:', result);
      } else {
        toast.error('Failed to relist item');
      }
    } catch (error) {
      console.error('Failed to relist:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to relist item');
    } finally {
      setIsCreatingRelisting(false);
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
        {/* FRONT SIDE - Apple Glass Card */}
        <div
          className="relative rounded-2xl overflow-hidden shadow-lg backdrop-blur-xl border border-white/20"
          onDoubleClick={handleDoubleClick}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            background: 'rgba(255, 255, 255, 0.7)',
            width: 'min(200px, 90vw)',
            maxWidth: '200px',
          }}
        >
          {/* Selection Checkbox - Top Left Corner */}
          {onSelect && (
            <div
              className="absolute top-2 left-2 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onSelect(item.id, e.target.checked);
                }}
                className="w-5 h-5 cursor-pointer rounded border-2 border-gray-300 accent-blue-500"
                aria-label={`Select ${item.name}`}
              />
            </div>
          )}

          {/* Status Badge - Top Right Corner */}
          <div className="absolute top-2 right-2 z-10">
            <span className={`px-2 py-1 rounded-lg text-[8px] font-semibold border backdrop-blur-sm ${getStatusColor()}`}>
              {item.status}
            </span>
          </div>

          {/* Header - Item Name */}
          <div className="px-3 pt-2 pb-2">
            <h3 className="text-gray-900 font-bold text-sm leading-tight text-center">
              {item.name}
            </h3>
          </div>

          {/* Main Image with Glass Border */}
          <div className="px-3 pt-1 pb-2">
            <div className="relative rounded-xl overflow-hidden bg-white/40 backdrop-blur-sm border border-white/30 shadow-sm">
              <div className="relative h-32 cursor-pointer touch-manipulation active:scale-95 transition-transform"
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
                    onError={(e) => {
                      // If image fails to load, hide it and show placeholder
                      e.currentTarget.style.display = 'none';
                      const placeholder = e.currentTarget.nextElementSibling;
                      if (placeholder) {
                        (placeholder as HTMLElement).style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div className={`w-full h-full flex flex-col items-center justify-center bg-gray-100/50 ${imageGallery[selectedImageIndex] ? 'hidden' : ''}`}>
                  <ImageIcon className="w-8 h-8 text-gray-400 mb-1" />
                  <span className="text-[9px] text-gray-500 font-medium">Tap to add</span>
                </div>
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
            </div>

            {/* Thumbnails - Image Gallery (5 slots) */}
            <div className="flex gap-1 justify-center mt-2">
              {[0, 1, 2, 3, 4].map((idx) => (
                <div
                  key={idx}
                  className={clsx(
                    "w-7 h-7 rounded-lg border cursor-pointer overflow-hidden flex-shrink-0 transition-all bg-white/40 backdrop-blur-sm",
                    selectedImageIndex === idx
                      ? "border-blue-400 shadow-md ring-2 ring-blue-400/30"
                      : "border-gray-300 hover:border-gray-400"
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

          {/* Item Details */}
          <div className="px-3 pb-3 space-y-2">
            {/* Row 1: Hanger ID | Size */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-gray-500">
                <TagIcon className="w-3.5 h-3.5" />
                <span>Hanger ID:</span>
              </div>
              <span className="font-bold text-blue-600">{item.hangerId || '-'}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Size:</span>
              <span className="font-semibold text-gray-900">{item.size || 'N/A'}</span>
            </div>

            {/* Row 2: Price | Days Listed */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-200/50">
              <div className="flex items-center gap-1.5 text-gray-500">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Price:</span>
              </div>
              <span className="font-bold text-green-600 text-sm">{formatCurrency(getDisplayPrice())}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Clock className="w-3.5 h-3.5" />
                <span>Listed:</span>
              </div>
              <span className="text-gray-700">{formatDays(daysListed)}</span>
            </div>

            {/* Stale Item Warning */}
            {isStaleItem && (
              <div className="mt-2 px-2 py-1.5 bg-orange-500/10 backdrop-blur-sm border border-orange-200 rounded-lg">
                <p className="text-[10px] font-semibold text-orange-700 text-center">
                  STALE - Consider Relisting
                </p>
              </div>
            )}
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

                {/* Actions Menu - Available for all items */}
                <div className="relative mt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowActionsMenu(!showActionsMenu);
                    }}
                    className="w-full rounded bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-2 py-2 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1.5 touch-manipulation"
                    title="Item actions"
                  >
                    <MoreVertical className="h-3 w-3" />
                    Actions
                  </button>

                  {/* Actions Dropdown */}
                  {showActionsMenu && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-10">
                      {/* View eBay Details - Only for items imported from eBay */}
                      {item.ebayListingId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowEbayDetails(true);
                            setShowActionsMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-white hover:bg-gray-700 flex items-center gap-2 transition-colors border-b border-gray-700"
                        >
                          <Info className="h-3 w-3" />
                          View eBay Details
                        </button>
                      )}

                      {/* List on eBay - Available for all items */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowListToEbay(true);
                          setShowActionsMenu(false);
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-white hover:bg-gray-700 flex items-center gap-2 transition-colors border-b border-gray-700"
                      >
                        <Upload className="h-3 w-3" />
                        List on eBay
                      </button>

                      {/* Relist Item - Only for items imported from eBay */}
                      {item.ebayListingId && (
                        <button
                          onClick={handleCreateRelisting}
                          disabled={isCreatingRelisting}
                          className="w-full px-3 py-2 text-left text-xs text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                        >
                          <CopyIcon className="h-3 w-3" />
                          {isCreatingRelisting ? 'Creating...' : 'Relist Item'}
                        </button>
                      )}
                    </div>
                  )}
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

      {/* eBay Details Modal */}
      {showEbayDetails && (
        <EbayDetailsModal
          item={item}
          onClose={() => setShowEbayDetails(false)}
        />
      )}

      {/* List to eBay Modal */}
      {showListToEbay && (
        <ListToEbayModal
          item={item}
          isOpen={showListToEbay}
          onClose={() => setShowListToEbay(false)}
        />
      )}
    </div>
  );
};
