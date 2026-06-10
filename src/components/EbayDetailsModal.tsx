import React, { useState } from 'react';
import type { Item } from '../types/item';
import { X, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { clsx } from 'clsx';

interface EbayDetailsModalProps {
  item: Item;
  onClose: () => void;
}

export const EbayDetailsModal: React.FC<EbayDetailsModalProps> = ({ item, onClose }) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const ebayImages = (item.ebayAllImages || []).filter(img => img && typeof img === 'string');
  const hasEbayData = item.ebayListingId || item.ebayFullDescription || Object.keys(item.ebayItemSpecifics || {}).length > 0;

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(fieldName);
      toast.success(`${fieldName} copied to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (!hasEbayData) {
    return (
      <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-lg border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-auto p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-100">eBay Details</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <p className="text-gray-400 text-center py-8">No eBay data available for this item</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-lg border-2 border-purple-500 max-w-3xl w-full max-h-[90vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-purple-400">eBay Listing Details</h2>
            {item.ebayListingId && (
              <p className="text-xs text-gray-400 mt-1">Item ID: {item.ebayListingId}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Images Section */}
          {ebayImages.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide">All eBay Images</h3>
              <div className="space-y-3">
                {/* Main Image */}
                <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
                  <img
                    src={ebayImages[selectedImageIndex]}
                    alt={`eBay listing image ${selectedImageIndex + 1}`}
                    className="w-full h-64 object-contain bg-black"
                  />
                </div>

                {/* Thumbnails */}
                {ebayImages.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {ebayImages.map((imageUrl, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImageIndex(idx)}
                        className={clsx(
                          'flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden transition-all',
                          selectedImageIndex === idx
                            ? 'border-purple-500'
                            : 'border-gray-600 hover:border-gray-500'
                        )}
                        title={`Image ${idx + 1}`}
                      >
                        <img
                          src={imageUrl}
                          alt={`Thumbnail ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  Image {selectedImageIndex + 1} of {ebayImages.length}
                </p>
              </div>
            </div>
          )}

          {/* Title Section */}
          {item.ebayFullTitle && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Title</h3>
              <div className="bg-gray-800 p-3 rounded border border-gray-700">
                <p className="text-white text-sm">{item.ebayFullTitle}</p>
                <button
                  onClick={() => copyToClipboard(item.ebayFullTitle || '', 'Title')}
                  className="mt-2 text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                >
                  {copiedField === 'Title' ? (
                    <>
                      <Check className="w-3 h-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy title
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Description Section */}
          {item.ebayFullDescription && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Description</h3>
              <div className="bg-gray-800 p-3 rounded border border-gray-700 max-h-64 overflow-y-auto">
                <div
                  className="text-gray-300 text-sm whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{
                    __html: item.ebayFullDescription
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/\n/g, '<br />')
                  }}
                />
                <button
                  onClick={() => copyToClipboard(item.ebayFullDescription || '', 'Description')}
                  className="mt-2 text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                >
                  {copiedField === 'Description' ? (
                    <>
                      <Check className="w-3 h-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy description
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Item Specifics Section */}
          {item.ebayItemSpecifics && Object.keys(item.ebayItemSpecifics).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Item Specifics</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(item.ebayItemSpecifics).map(([key, value]) => {
                  const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
                  return (
                    <div key={key} className="bg-gray-800 p-3 rounded border border-gray-700">
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-1">{key}</p>
                      <p className="text-sm text-white break-words">{displayValue}</p>
                      <button
                        onClick={() => copyToClipboard(displayValue, key)}
                        className="mt-1 text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                      >
                        {copiedField === key ? (
                          <>
                            <Check className="w-3 h-3" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pricing & Condition Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {item.ebayPrice !== undefined && (
              <div className="bg-gray-800 p-3 rounded border border-gray-700">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Original eBay Price</p>
                <p className="text-lg font-bold text-green-400">{formatCurrency(item.ebayPrice)}</p>
                {item.ebayCurrency && (
                  <p className="text-xs text-gray-500 mt-1">{item.ebayCurrency}</p>
                )}
              </div>
            )}

            {item.ebayCondition && (
              <div className="bg-gray-800 p-3 rounded border border-gray-700">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Condition</p>
                <p className="text-lg font-bold text-blue-400">{item.ebayCondition}</p>
              </div>
            )}

            {item.ebayQuantity !== undefined && (
              <div className="bg-gray-800 p-3 rounded border border-gray-700">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Quantity Available</p>
                <p className="text-lg font-bold text-yellow-400">{item.ebayQuantity}</p>
              </div>
            )}

            {item.ebayCategoryName && (
              <div className="bg-gray-800 p-3 rounded border border-gray-700">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">eBay Category</p>
                <p className="text-sm text-gray-200">{item.ebayCategoryName}</p>
              </div>
            )}
          </div>

          {/* Relisting Info */}
          <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4">
            <p className="text-xs font-semibold text-purple-300 uppercase mb-2">💡 Relisting Hint</p>
            <p className="text-sm text-gray-300">
              All eBay data above can be copied and pasted directly to relist this item. Use the "Copy" buttons to grab title, description, and item specifics.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
