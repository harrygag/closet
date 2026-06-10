import { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import type { Item } from '../types/item';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import { toast } from 'sonner';

interface DelistingWarningModalProps {
  items: Item[];
  open: boolean;
  onConfirmAll: () => void;
}

export const DelistingWarningModal: React.FC<DelistingWarningModalProps> = ({
  items,
  open,
  onConfirmAll,
}) => {
  const [confirmedItems, setConfirmedItems] = useState<Set<string>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter sold items that haven't been confirmed delisted
  const soldItems = items.filter(
    item => item.status === 'SOLD' && !item.delistedConfirmed
  );

  // Reset confirmed items when modal opens or items change
  useEffect(() => {
    if (open) {
      setConfirmedItems(new Set());
    }
  }, [open, soldItems.length]);

  const handleToggleItem = (itemId: string) => {
    setConfirmedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleConfirmAll = async () => {
    if (confirmedItems.size !== soldItems.length) {
      toast.error('Please confirm all items have been delisted');
      return;
    }

    setIsUpdating(true);
    try {
      const db = getFirestore(app);

      // Update all confirmed items in Firestore
      const updatePromises = Array.from(confirmedItems).map(itemId => {
        const itemRef = doc(db, 'Item', itemId);
        return updateDoc(itemRef, {
          delistedConfirmed: true,
          delistedConfirmedAt: new Date().toISOString(),
        });
      });

      await Promise.all(updatePromises);

      toast.success('All items confirmed as delisted!');
      onConfirmAll();
    } catch (error: any) {
      console.error('Failed to update delisted confirmation:', error);
      toast.error('Failed to update items: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const allConfirmed = confirmedItems.size === soldItems.length && soldItems.length > 0;

  if (soldItems.length === 0) {
    return null;
  }

  return (
    <Modal open={open} onOpenChange={() => {}} title="">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold text-white mb-2">
              Have you delisted these items?
            </h2>
            <p className="text-sm text-gray-400">
              You have {soldItems.length} sold item{soldItems.length !== 1 ? 's' : ''} that need to be delisted from marketplaces (eBay, Depop, etc.).
              Please confirm you've removed each listing before continuing.
            </p>
          </div>
        </div>

        {/* Items List */}
        <div className="max-h-[400px] overflow-y-auto space-y-2 border border-gray-700 rounded-lg p-3 bg-gray-800/50">
          {soldItems.map(item => {
            const isConfirmed = confirmedItems.has(item.id);

            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  isConfirmed
                    ? 'bg-green-900/20 border-green-700'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
                onClick={() => handleToggleItem(item.id)}
              >
                {/* Checkbox */}
                <div className="flex-shrink-0 mt-1">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      isConfirmed
                        ? 'bg-green-600 border-green-600'
                        : 'border-gray-600'
                    }`}
                  >
                    {isConfirmed && <CheckCircle className="h-4 w-4 text-white" />}
                  </div>
                </div>

                {/* Item Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate">{item.name}</h3>
                      <p className="text-xs text-gray-400">
                        {item.size && `Size: ${item.size}`}
                        {item.barcode && ` • ${item.barcode}`}
                      </p>
                    </div>
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-12 h-12 object-cover rounded flex-shrink-0"
                      />
                    )}
                  </div>

                  {/* Marketplace Links */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {item.ebayUrl && (
                      <a
                        href={item.ebayUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600/20 border border-blue-600/30 rounded text-xs text-blue-400 hover:bg-blue-600/30"
                      >
                        eBay
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {item.depopUrl && (
                      <a
                        href={item.depopUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-red-600/20 border border-red-600/30 rounded text-xs text-red-400 hover:bg-red-600/30"
                      >
                        Depop
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {item.poshmarkUrl && (
                      <a
                        href={item.poshmarkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-purple-600/20 border border-purple-600/30 rounded text-xs text-purple-400 hover:bg-purple-600/30"
                      >
                        Poshmark
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            {confirmedItems.size} of {soldItems.length} confirmed
          </div>
          <Button
            onClick={handleConfirmAll}
            disabled={!allConfirmed || isUpdating}
            className={`${
              allConfirmed
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gray-600 cursor-not-allowed'
            }`}
          >
            {isUpdating ? 'Updating...' : 'Confirm All & Continue'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
