// Realistic clothes hanger component with animations
import React from 'react';
import type { Item } from '../types/item';
import { parseMarketplaceUrls, MARKETPLACE_ICONS, MARKETPLACE_COLORS } from '../utils/marketplace';
import { getStatusColor, truncateText } from '../utils/formatters';
import { clsx } from 'clsx';
import { Shirt } from 'lucide-react';

interface ClosetHangerProps {
  item: Item;
  onClick: (item: Item) => void;
  isDragging?: boolean;
}

export const ClosetHanger: React.FC<ClosetHangerProps> = ({ item, onClick, isDragging = false }) => {
  // Parse marketplace URLs with prices
  const marketplaceUrls = parseMarketplaceUrls(item.ebayUrl, item.marketplaceUrls?.map(m => m.url));
  
  // Get marketplace data with prices
  const getMarketplacePrice = (type: string) => {
    if (type === 'ebay') return item.sellingPrice;
    const marketplace = item.marketplaceUrls?.find(m => m.type === type);
    return marketplace?.price || 0;
  };

  return (
    <div
      onClick={() => onClick(item)}
      className={clsx(
        'group relative cursor-pointer transition-all duration-300',
        isDragging ? 'opacity-50 scale-95' : 'hover:scale-105'
      )}
      style={{
        animation: isDragging ? 'none' : 'sway 3s ease-in-out infinite',
        animationDelay: `${Math.random() * 2}s`,
      }}
    >
      {/* Hanger Hook - connects to rod */}
      <div className="flex justify-center">
        <div className="h-6 w-0.5 bg-gradient-to-b from-gray-500 to-gray-600 rounded-full" />
      </div>

      {/* Hanger Top - curved hook */}
      <div className="flex justify-center -mt-1">
        <svg width="60" height="20" viewBox="0 0 60 20" className="drop-shadow-sm">
          {/* Hook curve */}
          <path
            d="M 30 0 Q 30 8, 22 12 L 8 12 Q 4 12, 4 16 L 4 18 Q 4 20, 6 20 L 54 20 Q 56 20, 56 18 L 56 16 Q 56 12, 52 12 L 38 12 Q 30 8, 30 0"
            fill="#6B7280"
            stroke="#4B5563"
            strokeWidth="0.5"
            className="transition-all group-hover:fill-gray-500"
          />
          {/* Hanger shine effect */}
          <path
            d="M 30 2 Q 30 9, 23 12 L 10 12 Q 6 12, 6 15"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Item Display - image or icon */}
      <div className="flex justify-center -mt-2">
        <div
          className={clsx(
            'relative flex h-24 w-20 items-center justify-center rounded-lg border-2 transition-all duration-300',
            'shadow-lg group-hover:shadow-xl group-hover:border-opacity-100',
            getStatusColor(item.status),
            isDragging ? 'rotate-3' : 'group-hover:-translate-y-1',
            item.imageUrl ? 'bg-white p-1' : 'bg-gradient-to-br from-gray-700 to-gray-800 border-gray-600'
          )}
        >
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-full w-full object-cover rounded"
              onError={(e) => {
                // Fallback to icon if image fails to load
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  parent.classList.add('bg-gradient-to-br', 'from-gray-700', 'to-gray-800');
                  const icon = document.createElement('div');
                  icon.innerHTML = '<svg class="h-12 w-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>';
                  parent.appendChild(icon.firstChild!);
                }
              }}
            />
          ) : (
            <Shirt className="h-12 w-12 text-white" />
          )}

          {/* Status indicator dot and marketplace icons */}
          <div className="absolute -top-1 -right-1 flex items-center gap-1">
            {/* Status dot - green only if has marketplace URLs */}
            <div
              className={clsx(
                'h-3 w-3 rounded-full border-2 border-gray-800',
                item.status === 'Active' && marketplaceUrls.length > 0 && 'bg-green-500',
                (item.status === 'Inactive' || (item.status === 'Active' && marketplaceUrls.length === 0)) && 'bg-yellow-500',
                item.status === 'SOLD' && 'bg-blue-500'
              )}
            />
            
            {/* Marketplace icons with prices - only show when URLs exist */}
            {marketplaceUrls.length > 0 && (
              <div className="flex gap-1 bg-gray-900/95 backdrop-blur-sm px-1.5 py-0.5 rounded-full border border-gray-700">
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
        </div>
      </div>

      {/* Item Info */}
      <div className="mt-3 text-center">
        <p className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors px-1">
          {truncateText(item.name, 25)}
        </p>
        {item.size && (
          <p className="mt-0.5 text-xs text-gray-500 group-hover:text-gray-400">
            {item.size}
          </p>
        )}
      </div>

      {/* Hanger ID Badge */}
      {item.hangerId && (
        <div className="mt-1 flex justify-center">
          <div className="rounded-full bg-purple-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-md">
            {item.hangerId}
          </div>
        </div>
      )}

      {/* Price tag (for active items) */}
      {item.status === 'Active' && item.sellingPrice > 0 && (
        <div className="mt-1 flex justify-center">
          <div className="rounded bg-green-600/80 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
            ${item.sellingPrice.toFixed(0)}
          </div>
        </div>
      )}

      {/* Sold badge */}
      {item.status === 'SOLD' && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 rotate-12">
          <div className="rounded bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-lg border-2 border-blue-400">
            SOLD
          </div>
        </div>
      )}
    </div>
  );
};
