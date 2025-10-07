import React from 'react';
import { Edit2, Trash2, ExternalLink } from 'lucide-react';
import type { Item } from '../types/item';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card';
import { Button } from './ui/Button';
import { formatCurrency, formatRelativeDate, getStatusColor, getTagColor, truncateText } from '../utils/formatters';
import { clsx } from 'clsx';

interface ItemCardProps {
  item: Item;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onEdit, onDelete }) => {
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

  return (
    <Card className="group relative overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">
              {truncateText(item.name, 60)}
            </CardTitle>
            {item.size && (
              <p className="mt-1 text-sm text-gray-400">Size: {item.size}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span
              className={clsx(
                'rounded-full px-2 py-1 text-xs font-medium text-white',
                getStatusColor(item.status)
              )}
            >
              {item.status}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className={clsx(
                  'rounded px-2 py-0.5 text-xs font-medium text-white',
                  getTagColor(tag)
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Financial Info */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {item.costPrice > 0 && (
            <div>
              <span className="text-gray-400">Cost:</span>{' '}
              <span className="font-medium text-white">{formatCurrency(item.costPrice)}</span>
            </div>
          )}
          {item.sellingPrice > 0 && (
            <div>
              <span className="text-gray-400">Price:</span>{' '}
              <span className="font-medium text-white">{formatCurrency(item.sellingPrice)}</span>
            </div>
          )}
          {item.status === 'SOLD' && item.netProfit > 0 && (
            <div className="col-span-2">
              <span className="text-gray-400">Profit:</span>{' '}
              <span className="font-medium text-green-400">{formatCurrency(item.netProfit)}</span>
            </div>
          )}
        </div>

        {/* Notes */}
        {item.notes && (
          <p className="mt-2 text-sm text-gray-400">{truncateText(item.notes, 100)}</p>
        )}

        {/* Date Added */}
        <p className="mt-2 text-xs text-gray-500">
          Added {formatRelativeDate(item.dateAdded)}
        </p>
      </CardContent>

      <CardFooter>
        <Button size="sm" variant="secondary" onClick={handleEdit}>
          <Edit2 className="mr-1 h-4 w-4" />
          Edit
        </Button>
        <Button size="sm" variant="danger" onClick={handleDelete}>
          <Trash2 className="mr-1 h-4 w-4" />
          Delete
        </Button>
        {item.ebayUrl && (
          <Button size="sm" variant="ghost" onClick={openEbayUrl}>
            <ExternalLink className="mr-1 h-4 w-4" />
            eBay
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
