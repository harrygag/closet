import React, { useState } from 'react';
import { Edit2, Trash2, ExternalLink, ImageIcon, Upload } from 'lucide-react';
import type { Item } from '../types/item';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card';
import { Button } from './ui/Button';
import { formatCurrency, formatRelativeDate, getStatusColor, getTagColor, truncateText } from '../utils/formatters';
import { clsx } from 'clsx';

interface ItemCardProps {
  item: Item;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onImageUpload?: (itemId: string, imageUrl: string) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onEdit, onDelete, onImageUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
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
    
    // For now, just prompt for URL since we're using client-side only
    const imageUrl = prompt('Paste image URL:');
    if (imageUrl && onImageUpload) {
      onImageUpload(item.id, imageUrl);
    }
  };

  const handleImageClick = () => {
    if (!item.imageUrl && onImageUpload) {
      const imageUrl = prompt('Paste image URL:');
      if (imageUrl) {
        onImageUpload(item.id, imageUrl);
      }
    }
  };

  return (
    <Card className="group relative overflow-hidden hover:border-purple-500/50 transition-colors">
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
          <CardTitle className="text-sm leading-tight flex-1">
            {truncateText(item.name, 50)}
          </CardTitle>
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
        {item.ebayUrl && (
          <Button size="sm" variant="ghost" onClick={openEbayUrl} className="flex-1">
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
