import { useState } from 'react';
import { X, CheckCircle, Package, Archive, Trash2, AlertTriangle, Info } from 'lucide-react';
import { Button } from './ui/Button';
import type { Item } from '../types/item';

interface BulkStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  onUpdateStatus: (
    action: 'sold' | 'in_stock' | 'archive' | 'delete',
    endEbayListings: boolean
  ) => Promise<void>;
}

type StatusAction = 'sold' | 'in_stock' | 'archive' | 'delete';

export const BulkStatusModal: React.FC<BulkStatusModalProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateStatus
}) => {
  const [selectedAction, setSelectedAction] = useState<StatusAction | null>(null);
  const [endEbayListings, setEndEbayListings] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Count items with eBay listings
  const itemsWithEbayListings = items.filter(item => item.ebayListingId || item.ebayUrl).length;

  const actionConfig = {
    sold: {
      icon: CheckCircle,
      label: 'Mark as SOLD',
      emoji: '✅',
      color: 'green',
      bgColor: 'bg-green-600',
      hoverColor: 'hover:bg-green-700',
      borderColor: 'border-green-500',
      textColor: 'text-green-400',
      description: 'Set quantity to 0 and status to SOLD',
      warning: null
    },
    in_stock: {
      icon: Package,
      label: 'Mark as IN STOCK',
      emoji: '📦',
      color: 'blue',
      bgColor: 'bg-blue-600',
      hoverColor: 'hover:bg-blue-700',
      borderColor: 'border-blue-500',
      textColor: 'text-blue-400',
      description: 'Set quantity to 1 and status to Active',
      warning: null
    },
    archive: {
      icon: Archive,
      label: 'Archive Items',
      emoji: '📁',
      color: 'purple',
      bgColor: 'bg-purple-600',
      hoverColor: 'hover:bg-purple-700',
      borderColor: 'border-purple-500',
      textColor: 'text-purple-400',
      description: 'Set status to Inactive (hidden from active inventory)',
      warning: 'Archived items can be restored later'
    },
    delete: {
      icon: Trash2,
      label: 'Delete Items',
      emoji: '🗑️',
      color: 'red',
      bgColor: 'bg-red-600',
      hoverColor: 'hover:bg-red-700',
      borderColor: 'border-red-500',
      textColor: 'text-red-400',
      description: 'Permanently delete items from database',
      warning: 'This action cannot be undone!'
    }
  };

  const handleActionSelect = (action: StatusAction) => {
    if (action === 'delete') {
      setShowDeleteConfirm(true);
    } else {
      setSelectedAction(action);
    }
  };

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false);
    setSelectedAction('delete');
  };

  const handleExecuteAction = async () => {
    if (!selectedAction) return;

    setIsProcessing(true);
    try {
      await onUpdateStatus(selectedAction, endEbayListings);
      onClose();
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setSelectedAction(null);
    setEndEbayListings(false);
    setShowDeleteConfirm(false);
    onClose();
  };

  if (!isOpen) return null;

  // Delete Confirmation Dialog
  if (showDeleteConfirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="bg-gray-900 rounded-xl border border-red-600 shadow-2xl max-w-md w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-red-600 bg-red-900/30">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <h2 className="text-xl font-bold text-white">Confirm Deletion</h2>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <p className="text-gray-200">
              Are you sure you want to permanently delete <span className="font-bold text-white">{items.length}</span> item{items.length !== 1 ? 's' : ''}?
            </p>

            <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4 space-y-2">
              <p className="text-red-200 font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                This action cannot be undone!
              </p>
              <ul className="text-sm text-red-300 space-y-1 ml-6 list-disc">
                <li>All item data will be permanently deleted</li>
                <li>Photo references will be removed</li>
                <li>eBay data will be lost</li>
                <li>This cannot be reversed</li>
              </ul>
            </div>

            {itemsWithEbayListings > 0 && (
              <div className="bg-orange-900/30 border border-orange-600/50 rounded-lg p-4">
                <p className="text-orange-200 text-sm">
                  <span className="font-semibold">{itemsWithEbayListings}</span> of these items have eBay listing data.
                  Consider using the "End eBay listings" option below to also end active listings.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-gray-800/50">
            <Button
              onClick={() => setShowDeleteConfirm(false)}
              className="bg-gray-700 hover:bg-gray-600 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              variant="danger"
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Yes, Delete Permanently
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Main Modal - Action Selection
  if (!selectedAction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-3xl w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gradient-to-r from-purple-900/50 to-blue-900/50">
            <div>
              <h2 className="text-2xl font-bold text-white">Bulk Status Update</h2>
              <p className="text-sm text-gray-400 mt-1">
                {items.length} item{items.length !== 1 ? 's' : ''} selected
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Info Banner */}
          <div className="p-4 bg-blue-900/20 border-b border-gray-700">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                <p className="font-semibold mb-1">Choose a status action:</p>
                <p className="text-blue-300">
                  Select one of the options below to update all {items.length} selected items at once.
                  {itemsWithEbayListings > 0 && (
                    <span className="block mt-1 text-orange-300">
                      Note: {itemsWithEbayListings} item{itemsWithEbayListings !== 1 ? 's' : ''} {itemsWithEbayListings === 1 ? 'has' : 'have'} eBay listing{itemsWithEbayListings !== 1 ? 's' : ''}.
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons Grid */}
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(actionConfig) as StatusAction[]).map((action) => {
              const config = actionConfig[action];
              const Icon = config.icon;

              return (
                <button
                  key={action}
                  onClick={() => handleActionSelect(action)}
                  className={`
                    group relative p-6 rounded-xl border-2 transition-all
                    ${config.borderColor} ${config.bgColor} bg-opacity-10
                    hover:bg-opacity-20 hover:scale-105 hover:shadow-lg
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900
                  `}
                  style={{ borderColor: `var(--color-${config.color}-500)` }}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`
                      p-3 rounded-lg ${config.bgColor} bg-opacity-20
                      group-hover:bg-opacity-30 transition-all
                    `}>
                      <span className="text-3xl">{config.emoji}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`h-5 w-5 ${config.textColor}`} />
                        <h3 className="text-lg font-bold text-white">
                          {config.label}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-400 mb-2">
                        {config.description}
                      </p>
                      {config.warning && (
                        <p className={`text-xs ${config.textColor} font-semibold`}>
                          {config.warning}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-gray-800/50">
            <Button
              onClick={handleCancel}
              className="bg-gray-700 hover:bg-gray-600 text-white"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Confirmation View
  const config = actionConfig[selectedAction];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`
          flex items-center justify-between p-6 border-b border-gray-700
          ${config.bgColor} bg-opacity-20
        `}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.bgColor} bg-opacity-30`}>
              <span className="text-2xl">{config.emoji}</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Icon className={`h-5 w-5 ${config.textColor}`} />
                Confirm {config.label}
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                {items.length} item{items.length !== 1 ? 's' : ''} will be updated
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            disabled={isProcessing}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Action Summary */}
          <div className={`
            bg-gray-800 rounded-lg p-4 border-l-4 ${config.borderColor}
          `}>
            <p className="text-sm text-gray-300">
              <span className="font-semibold text-white">{config.description}</span>
            </p>
            {config.warning && (
              <p className={`text-sm ${config.textColor} mt-2 font-semibold`}>
                ⚠️ {config.warning}
              </p>
            )}
          </div>

          {/* Items Preview */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Affected Items ({items.length})
            </h3>
            <div className="max-h-64 overflow-y-auto space-y-2 bg-gray-800/50 rounded-lg p-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-gray-800 rounded-lg p-3 flex items-center gap-3 hover:bg-gray-750 transition-colors"
                >
                  <span className="text-lg">{config.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      Size: {item.size} • Current: {item.status}
                      {(item.ebayListingId || item.ebayUrl) && (
                        <span className="ml-2 text-orange-400">• Has eBay listing</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* eBay Delisting Option */}
          {itemsWithEbayListings > 0 && (
            <div className="bg-orange-900/30 border border-orange-600/30 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={endEbayListings}
                  onChange={(e) => setEndEbayListings(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-gray-600 bg-gray-800 text-orange-600 focus:ring-2 focus:ring-orange-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-orange-200 group-hover:text-orange-100 transition-colors">
                    Also end eBay listings
                  </div>
                  <div className="text-xs text-orange-300 mt-1">
                    End all active eBay listings for these {itemsWithEbayListings} item{itemsWithEbayListings !== 1 ? 's' : ''}.
                    {selectedAction === 'sold' && ' Recommended when marking items as SOLD.'}
                    {selectedAction === 'archive' && ' Recommended when archiving items.'}
                    {selectedAction === 'delete' && ' Listings will remain active if not checked.'}
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Warning for Delete */}
          {selectedAction === 'delete' && (
            <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-200">
                  <p className="font-semibold mb-1">Permanent Deletion Warning</p>
                  <ul className="list-disc list-inside space-y-1 text-red-300">
                    <li>All item data will be permanently deleted</li>
                    <li>This action cannot be undone</li>
                    <li>Consider archiving instead if you might need this data later</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-gray-700 bg-gray-800/50">
          <Button
            onClick={() => setSelectedAction(null)}
            disabled={isProcessing}
            className="bg-gray-700 hover:bg-gray-600 text-white"
          >
            Back
          </Button>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleCancel}
              disabled={isProcessing}
              className="bg-gray-700 hover:bg-gray-600 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExecuteAction}
              disabled={isProcessing}
              className={`${config.bgColor} ${config.hoverColor} text-white`}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Processing...
                </span>
              ) : (
                <>Confirm {config.label}</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
