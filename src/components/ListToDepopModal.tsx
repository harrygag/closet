import { useState } from 'react';
import { X, Loader2, ShoppingBag, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/Button';
import type { Item } from '../types/item';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import { useAuthStore } from '../store/useAuthStore';

const db = getFirestore(app);

interface ListToDepopModalProps {
  items: Item[];
  isOpen: boolean;
  onClose: () => void;
}

export function ListToDepopModal({ items, isOpen, onClose }: ListToDepopModalProps) {
  const { user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in to list items');
      return;
    }

    if (items.length === 0) {
      toast.error('No items selected');
      return;
    }

    try {
      setIsSubmitting(true);
      toast.info(`Queuing ${items.length} item(s) for Depop...`);

      // Create listing requests in Firestore
      const requests = [];

      for (const item of items) {
        // Auto-generate Depop description from item data
        const description = [
          item.name || 'Item for sale',
          item.ebayBrand && `Brand: ${item.ebayBrand}`,
          item.size && `Size: ${item.size}`,
          item.ebayItemSpecifics?.Color && `Color: ${item.ebayItemSpecifics.Color}`,
          item.ebayCondition && `Condition: ${item.ebayCondition}`,
          item.notes || item.ebayFullDescription || '',
        ]
          .filter(Boolean)
          .join('. ')
          .trim()
          .substring(0, 1000); // Max 1000 chars for Depop

        // Get price - try multiple sources (all stored in cents)
        let price = 0;
        if (item.sellingPrice && item.sellingPrice > 0) {
          // sellingPrice is stored in cents
          price = item.sellingPrice / 100;
        } else if ((item as any).ebayPrice && (item as any).ebayPrice > 0) {
          // eBay price is also stored in cents
          price = (item as any).ebayPrice / 100;
        }

        console.log(`[ListToDepop] Item "${item.name}": sellingPrice=${item.sellingPrice}, ebayPrice=${(item as any).ebayPrice}, finalPrice=$${price}`);

        const listingRequest = {
          userId: user.id,
          itemId: item.id,
          status: 'pending',
          platform: 'depop',
          listingData: {
            description,
            price: price,
            category: 'menswear', // Default
            brand: item.ebayBrand || '',
            condition: 'used_good',
            size: item.size || '',
            imageUrls: item.imageUrl ? [item.imageUrl] : [],
            location: {
              country: 'United States',
              city: 'Dallas',
            },
            shipping: {
              packageSize: 'small',
              worldwideShipping: false,
            },
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, 'listingRequests'), listingRequest);
        requests.push(docRef.id);
      }

      toast.success(
        `✅ ${items.length} item(s) queued for Depop! The automation service will list them shortly.`,
        { duration: 10000 }
      );

      onClose();
    } catch (error) {
      console.error('Failed to queue listings:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to queue listings');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-gray-800 p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between border-b border-gray-700 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-purple-400" />
              List to Depop
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Automatically list {items.length} item(s) on Depop
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
            disabled={isSubmitting}
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Items Preview */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Items to list:</h3>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-900/50 border border-gray-700"
              >
                <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-12 h-12 rounded object-cover border border-gray-600"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">
                    {item.ebayBrand && `${item.ebayBrand} • `}
                    {item.size && `Size ${item.size} • `}
                    ${item.sellingPrice ? (item.sellingPrice / 100).toFixed(2) : '0.00'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Box */}
        <div className="mb-6 p-4 rounded-lg bg-purple-900/20 border border-purple-500/30">
          <p className="text-sm text-purple-200">
            ℹ️ These items will be automatically listed on Depop using the automation service.
            The listings will use the item's title, price, images, and details from your inventory.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            onClick={onClose}
            variant="ghost"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Queuing...
              </>
            ) : (
              <>
                <ShoppingBag className="mr-2 h-4 w-4" />
                Queue {items.length} for Depop
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
