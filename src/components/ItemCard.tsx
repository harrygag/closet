import React, { useState } from 'react';
import { Edit2, Trash2, ExternalLink, ImageIcon, Upload, TrendingUp } from 'lucide-react';
import type { Item } from '../types/item';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card';
import { Button } from './ui/Button';
import { formatCurrency, getStatusColor, truncateText } from '../utils/formatters';
import { clsx } from 'clsx';

interface ItemCardProps {
  item: Item;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onImageUpload?: (itemId: string, imageUrl: string) => void;
  onViewComps?: (item: Item) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onEdit, onDelete, onImageUpload, onViewComps }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
      onDelete(item.id);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(item);
  };

  const openEbayUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.ebayUrl) {
      window.open(item.ebayUrl, '_blank');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));
    
    if (imageFile && onImageUpload) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageUrl = reader.result as string;
        onImageUpload(item.id, imageUrl);
      };
      reader.readAsDataURL(imageFile);
    }
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.imageUrl && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/') && onImageUpload) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageUrl = reader.result as string;
        onImageUpload(item.id, imageUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTitleDoubleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(item.name);
      // Visual feedback
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
    <Card className="group relative overflow-hidden hover:border-purple-500/50 transition-colors">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      {/* Image Section */}
      <div
        className={clsx(
          'relative h-32 bg-gray-900 border-b border-gray-700 cursor-pointer transition-colors',
          isDragging && 'border-purple-500 bg-purple-900/20',
          !item.imageUrl && 'hover:bg-gray-800'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleImageClick}
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-gray-500">
            <ImageIcon className="h-8 w-8 mb-1" />
            <span className="text-xs">Drop image or click</span>
          </div>
        )}
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-purple-900/80">
            <Upload className="h-8 w-8 text-white" />
          </div>
        )}
      </div>

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div
            className="flex-1 cursor-pointer"
            onDoubleClick={handleTitleDoubleClick}
            title="Double-click to copy"
          >
            <CardTitle className="text-sm leading-tight hover:text-purple-400 transition-colors">
              {truncateText(item.name, 50)}
            </CardTitle>
          </div>
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-xs font-medium text-white shrink-0',
              getStatusColor(item.status)
            )}
          >
            {item.status}
          </span>
        </div>
        
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
          {item.size && <span>Size {item.size}</span>}
          {item.tags.length > 0 && (
            <>
              <span>•</span>
              <span>{item.tags[0]}</span>
              {item.tags.length > 1 && (
                <span className="text-gray-500">+{item.tags.length - 1}</span>
              )}
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="py-2">
        {/* Compact Financial Info */}
        <div className="flex items-center justify-between text-sm">
          {item.costPrice > 0 && (
            <span className="text-gray-400">
              Cost: <span className="text-white font-medium">{formatCurrency(item.costPrice)}</span>
            </span>
          )}
          {item.sellingPrice > 0 && (
            <span className="text-gray-400">
              Price: <span className="text-white font-medium">{formatCurrency(item.sellingPrice)}</span>
            </span>
          )}
          {item.status === 'SOLD' && item.netProfit > 0 && (
            <span className="text-green-400 font-medium">
              +{formatCurrency(item.netProfit)}
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-2 gap-1">
        <Button size="sm" variant="secondary" onClick={handleEdit} className="flex-1">
          <Edit2 className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="danger" onClick={handleDelete} className="flex-1">
          <Trash2 className="h-3 w-3" />
        </Button>
        {onViewComps && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onViewComps(item);
            }}
            className="flex-1"
            title="View comparable sales"
          >
            <TrendingUp className="h-3 w-3" />
          </Button>
        )}
        {item.ebayUrl && (
          <Button size="sm" variant="ghost" onClick={openEbayUrl} className="flex-1">
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
