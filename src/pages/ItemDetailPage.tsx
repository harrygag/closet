/**
 * Item Detail Page
 * Public page accessed via QR code scan
 * Shows item details with quick actions for authenticated users
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, getFirestore } from 'firebase/firestore';
import { app, auth } from '../lib/firebase/client';
import { Item, ItemTag, ItemStatus } from '../types/item';
import { useAuthStore } from '../store/useAuthStore';
import { useSaleStore } from '../store/useSaleStore';
import { toast } from 'sonner';
import { ExternalLink, Tag, CheckCircle, ArrowLeft, Package } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { CreateSaleModal } from '../components/CreateSaleModal';
import { logPriceMarkdown, logMarkSold } from '../services/activityLog';
import { ebayService } from '../services/ebayService';
import { displaySize } from '../services/ebay/import';

const db = getFirestore(app);

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { createSale } = useSaleStore();
  const [item, setItem] = useState<Item | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [markdownPercent, setMarkdownPercent] = useState(10);
  const [showMarkdownModal, setShowMarkdownModal] = useState(false);
  const [showCreateSaleModal, setShowCreateSaleModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadItem = async () => {
      setIsLoading(true);

      if (!auth.currentUser) {
        setRequiresAuth(true);
        setIsLoading(false);
        return;
      }

      try {
        const itemRef = doc(db, 'Item', id);
        const itemSnap = await getDoc(itemRef);

        if (itemSnap.exists()) {
          const dbItem = itemSnap.data();
          const docId = itemSnap.id;

          // Extract hangerId from notes if present
          const notesStr = dbItem.notes || '';
          const hangerMatch = notesStr.match(/Hanger:\s*([^\.\s]+)/);
          const hangerId = hangerMatch ? hangerMatch[1] : '';
          const cleanedNotes = notesStr.replace(/Hanger:\s*[^\.\s]+\.\s*/, '').trim();

          // Get image from multiple possible sources
          const imageUrl: string | undefined =
            dbItem.imageUrls?.[0] ||
            dbItem.ebayPhotos?.[0]?.firebaseStorageUrl ||
            dbItem.ebayPhotos?.[0]?.ebayUrl ||
            undefined;

          // Construct eBay URL if not present but we have listing ID
          const ebayUrl: string | undefined =
            dbItem.ebayUrl ||
            (dbItem.ebayListingId
              ? `https://www.ebay.com/itm/${dbItem.ebayListingId}`
              : undefined);

          const mappedStatus: ItemStatus =
            dbItem.status === 'SOLD'
              ? 'SOLD'
              : dbItem.status === 'IN_STOCK'
              ? 'Active'
              : 'Inactive';

          const mappedItem: Item = {
            id: docId,
            name: dbItem.title || '',
            size: dbItem.size || '',
            status: mappedStatus,
            hangerStatus: hangerId !== 'None' && hangerId ? 'assigned' : '',
            hangerId: hangerId !== 'None' ? hangerId : '',
            tags: ((dbItem.normalizedTags || []) as ItemTag[]).slice(0, 5),
            ebayUrl: ebayUrl,
            ebayListingId: dbItem.ebayListingId || undefined,
            poshmarkUrl: dbItem.poshmarkUrl || undefined,
            depopUrl: dbItem.depopUrl || undefined,
            imageUrl: imageUrl,
            costPrice: dbItem.purchasePriceCents ? dbItem.purchasePriceCents / 100 : 0,
            sellingPrice: dbItem.manualPriceCents ? dbItem.manualPriceCents / 100 : 0,
            ebayFees: 0,
            netProfit:
              dbItem.soldPriceCents && dbItem.purchasePriceCents
                ? (dbItem.soldPriceCents - dbItem.purchasePriceCents) / 100
                : 0,
            dateField: dbItem.soldDate || dbItem.purchaseDate || dbItem.createdAt,
            notes: cleanedNotes || dbItem.conditionNotes || '',
            dateAdded: dbItem.createdAt,
            barcode: dbItem.barcode || undefined,
            ebayItemId: dbItem.ebayItemId || undefined,
            ebaySku: dbItem.ebaySku || undefined,
            ebayFullTitle: dbItem.ebayFullTitle || undefined,
            ebaySubtitle: dbItem.ebaySubtitle || undefined,
            ebayFullDescription: dbItem.ebayFullDescription || undefined,
            ebayCondition: dbItem.ebayCondition || undefined,
            ebayConditionID: dbItem.ebayConditionID || undefined,
            ebayConditionDescription: dbItem.ebayConditionDescription || undefined,
            ebayListingType: dbItem.ebayListingType || undefined,
            ebayPrice: dbItem.ebayPrice || undefined,
            ebayCurrency: dbItem.ebayCurrency || undefined,
            ebayQuantity: dbItem.ebayQuantity !== undefined ? dbItem.ebayQuantity : undefined,
            ebayQuantitySold: dbItem.ebayQuantitySold || undefined,
            ebayCategoryID: dbItem.ebayCategoryID || undefined,
            ebayCategoryName: dbItem.ebayCategoryName || undefined,
            ebaySubcategoryID: dbItem.ebaySubcategoryID || undefined,
            ebaySubcategoryName: dbItem.ebaySubcategoryName || undefined,
            ebayStoreCategoryID: dbItem.ebayStoreCategoryID || undefined,
            ebayStoreCategoryName: dbItem.ebayStoreCategoryName || undefined,
            ebayItemSpecifics: dbItem.ebayItemSpecifics || undefined,
            ebayPhotos: dbItem.ebayPhotos || undefined,
            ebayAllImages: dbItem.ebayAllImages || undefined,
            ebayPrimaryImage: dbItem.ebayPrimaryImage || undefined,
            ebayShippingInfo: dbItem.ebayShippingInfo || undefined,
            ebayReturnPolicy: dbItem.ebayReturnPolicy || undefined,
            ebayPaymentMethods: dbItem.ebayPaymentMethods || undefined,
            ebayBuyerRequirements: dbItem.ebayBuyerRequirements || undefined,
            ebayItemLocation: dbItem.ebayItemLocation || undefined,
            ebayListingStartDate: dbItem.ebayListingStartDate || undefined,
            ebayListingEndDate: dbItem.ebayListingEndDate || undefined,
            ebayFormat: dbItem.ebayFormat || undefined,
            ebaySellerInfo: dbItem.ebaySellerInfo || undefined,
            ebayUPC: dbItem.ebayUPC || undefined,
            ebayEAN: dbItem.ebayEAN || undefined,
            ebayISBN: dbItem.ebayISBN || undefined,
            ebayMPN: dbItem.ebayMPN || undefined,
            ebayBrand: dbItem.ebayBrand || undefined,
            ebayManufacturer: dbItem.ebayManufacturer || undefined,
            ebayBestOfferEnabled: dbItem.ebayBestOfferEnabled || undefined,
            ebayAutoAcceptPrice: dbItem.ebayAutoAcceptPrice || undefined,
            ebayAutoDeclinePrice: dbItem.ebayAutoDeclinePrice || undefined,
            ebayReservePrice: dbItem.ebayReservePrice || undefined,
            ebayHasReservePrice: dbItem.ebayHasReservePrice || undefined,
            ebaySellerNotes: dbItem.ebaySellerNotes || undefined,
            ebayListingStatus: dbItem.ebayListingStatus || undefined,
            ebayWatchCount: dbItem.ebayWatchCount || undefined,
            ebayHitCount: dbItem.ebayHitCount || undefined,
            ebaySalesTaxIncluded: dbItem.ebaySalesTaxIncluded || undefined,
            lastScannedDate: dbItem.lastScannedDate || undefined,
            lastCheckInDate: dbItem.lastCheckInDate || undefined,
            scanCount: dbItem.scanCount || undefined,
            physicalLocation: dbItem.physicalLocation || undefined,
            verificationStatus: dbItem.verificationStatus || undefined,
            delistedConfirmed: dbItem.delistedConfirmed || undefined,
            delistedConfirmedAt: dbItem.delistedConfirmedAt || undefined,
            jerseyNumber: dbItem.jerseyNumber || undefined,
            manualPriceCents: dbItem.manualPriceCents || undefined,
            marketplaceUrls: dbItem.marketplaceUrls || undefined,
          };

          setItem(mappedItem);
        } else {
          toast.error('Item not found');
        }
      } catch (error: unknown) {
        console.error('Failed to load item:', error);
        toast.error('Failed to load item');
      } finally {
        setIsLoading(false);
      }
    };

    loadItem();
  }, [id]);

  const handleMarkdown = async () => {
    if (!item || !user) {
      toast.error('Please sign in to markdown items');
      navigate('/');
      return;
    }

    setIsProcessing(true);
    try {
      const oldPrice = item.sellingPrice;
      const newPrice = Math.round(item.sellingPrice * (1 - markdownPercent / 100));
      const itemRef = doc(db, 'Item', item.id);

      // Update Firestore
      await updateDoc(itemRef, {
        sellingPrice: newPrice,
        lastModified: new Date().toISOString()
      });

      // Update eBay listing price if item has eBay listing ID
      if (item.ebayListingId) {
        try {
          await ebayService.reviseItemPrice(item.ebayListingId, newPrice);
          toast.success(`Price reduced by ${markdownPercent}% to $${(newPrice / 100).toFixed(2)} and updated on eBay!`);
        } catch (ebayError: unknown) {
          console.error('Failed to update eBay price:', ebayError);
          const message = ebayError instanceof Error ? ebayError.message : 'Unknown error';
          toast.warning(`Price updated locally but eBay update failed: ${message}`);
        }
      } else {
        toast.success(`Price reduced by ${markdownPercent}% to $${(newPrice / 100).toFixed(2)}`);
      }

      // Log the markdown activity
      await logPriceMarkdown(
        user.id,
        item.id,
        item.name,
        oldPrice,
        newPrice,
        markdownPercent
      );

      setItem({ ...item, sellingPrice: newPrice });
      setShowMarkdownModal(false);
    } catch (error: unknown) {
      console.error('Failed to markdown item:', error);
      toast.error('Failed to markdown item');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkAsSold = async () => {
    if (!item || !user) {
      toast.error('Please sign in to mark items as sold');
      navigate('/');
      return;
    }

    const confirmed = window.confirm(
      `Mark "${item.name}" as SOLD?\n\n` +
      `This will:\n` +
      `• Set quantity to 0\n` +
      `• Update status to SOLD\n` +
      `• End eBay listing if active`
    );

    if (!confirmed) return;

    setIsProcessing(true);
    try {
      const itemRef = doc(db, 'Item', item.id);

      await updateDoc(itemRef, {
        ebayQuantity: 0,
        status: 'SOLD',
        lastModified: new Date().toISOString()
      });

      // Log the mark sold activity
      await logMarkSold(
        user.id,
        item.id,
        item.name,
        item.sellingPrice,
        item.ebayUrl
      );

      setItem({ ...item, ebayQuantity: 0, status: 'SOLD' });
      toast.success(`✓ Marked as SOLD: ${item.name}`);

      // Show sale creation modal
      setShowCreateSaleModal(true);
    } catch (error: unknown) {
      console.error('Failed to mark as sold:', error);
      toast.error('Failed to mark as sold');
    } finally {
      setIsProcessing(false);
    }
  };

  // — Loading state —
  if (isLoading) {
    return (
      <div className="bg-gray-950 min-h-screen flex items-center justify-center">
        <span className="font-arcade text-retro-cyan text-xs tracking-widest">LOADING...</span>
      </div>
    );
  }

  // — Requires auth state —
  if (requiresAuth) {
    return (
      <div className="bg-gray-950 min-h-screen flex flex-col items-center justify-center gap-6 px-6">
        <span className="font-arcade text-retro-cyan text-xs tracking-widest text-center">
          SIGN IN TO VIEW ITEM
        </span>
        <p className="text-gray-600 text-xs text-center mt-2">scan by RetroThriftCo</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="bg-purple-700 hover:bg-purple-600 text-white px-8 py-3 rounded-xl text-sm font-semibold"
        >
          Sign In
        </button>
      </div>
    );
  }

  // — Item not found state —
  if (!item) {
    return (
      <div className="bg-gray-950 min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <span className="font-arcade text-retro-pink text-xs tracking-widest text-center">
          ITEM NOT FOUND
        </span>
        <p className="text-gray-600 text-xs text-center">
          This item doesn&apos;t exist or has been removed.
        </p>
        <button
          type="button"
          onClick={() => navigate('/closet')}
          className="bg-gray-800 text-gray-300 px-6 py-3 rounded-xl text-sm"
        >
          Go to Closet
        </button>
      </div>
    );
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  // — Main item view —
  return (
    <div className="bg-gray-950 min-h-screen">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/closet')}
          className="text-gray-400 hover:text-white"
          aria-label="Back to closet"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-arcade text-retro-cyan text-xs">RETROTHRIFTCO</span>
        {user && item.status !== 'SOLD' && (
          <div className="w-2 h-2 rounded-full bg-retro-green animate-pulse" />
        )}
        {(!user || item.status === 'SOLD') && (
          <div className="w-2 h-2" />
        )}
      </div>

      {/* Item image */}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-full object-cover max-h-72"
        />
      ) : (
        <div className="bg-gray-900 flex items-center justify-center h-48">
          <Package className="h-16 w-16 text-gray-700" />
        </div>
      )}

      {/* Name + status */}
      <div className="px-4 pt-4">
        <h1 className="text-white font-bold text-xl leading-tight">{item.name}</h1>
        <div className="mt-2">
          {item.status === 'SOLD' ? (
            <span className="inline-block bg-red-950 text-red-400 text-xs px-3 py-1 rounded-full">
              SOLD
            </span>
          ) : (
            <span className="inline-block bg-green-950 text-retro-green text-xs px-3 py-1 rounded-full">
              Active
            </span>
          )}
        </div>
      </div>

      {/* Price block */}
      <div className="px-4 mt-4">
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">ASKING PRICE</p>
          <p className="text-retro-green font-bold text-5xl">{formatPrice(item.sellingPrice)}</p>
          {item.ebayUrl && (
            <p className="text-gray-600 text-xs mt-2">Listed on eBay</p>
          )}
        </div>
      </div>

      {/* Details grid */}
      <div className="px-4 mt-3 grid grid-cols-2 gap-3">
        {item.size && (
          <div className="bg-gray-900 rounded-xl p-3">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Size</p>
            <p className="text-white text-sm font-medium">{displaySize(item.size)}</p>
          </div>
        )}
        {item.ebayBrand && (
          <div className="bg-gray-900 rounded-xl p-3">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Brand</p>
            <p className="text-white text-sm font-medium">{item.ebayBrand}</p>
          </div>
        )}
        {item.barcode && (
          <div className="bg-gray-900 rounded-xl p-3">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Barcode</p>
            <p className="text-white text-sm font-medium">{item.barcode}</p>
          </div>
        )}
        {item.ebayQuantity !== undefined && (
          <div className="bg-gray-900 rounded-xl p-3">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Quantity</p>
            <p className="text-white text-sm font-medium">{item.ebayQuantity}</p>
          </div>
        )}
      </div>

      {/* Quick actions — authenticated + not SOLD */}
      {user && item.status !== 'SOLD' && (
        <div className="px-4 mt-6">
          <p className="font-arcade text-retro-cyan text-xs tracking-widest mb-4">QUICK ACTIONS</p>
          {item.ebayUrl && (
            <button
              type="button"
              onClick={() => window.open(item.ebayUrl, '_blank')}
              className="w-full bg-blue-700 hover:bg-blue-600 text-white rounded-xl py-4 flex items-center justify-center gap-2 text-sm font-semibold mb-3"
            >
              <ExternalLink className="h-5 w-5" />
              View on eBay
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowMarkdownModal(true)}
            className="w-full bg-orange-700 hover:bg-orange-600 text-white rounded-xl py-4 flex items-center justify-center gap-2 text-sm font-semibold mb-3"
          >
            <Tag className="h-5 w-5" />
            Markdown Price
          </button>
          <button
            type="button"
            onClick={handleMarkAsSold}
            disabled={isProcessing}
            className="w-full bg-retro-green/10 hover:bg-retro-green/20 text-retro-green border border-retro-green/30 rounded-xl py-4 flex items-center justify-center gap-2 text-sm font-semibold"
          >
            <CheckCircle className="h-5 w-5" />
            Mark as SOLD
          </button>
        </div>
      )}

      {/* Sign-in prompt — not authenticated */}
      {!user && (
        <div className="mx-4 mt-6 bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-gray-500 text-xs mb-3">Sign in to manage this item</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full bg-purple-700 hover:bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold"
          >
            Sign In
          </button>
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-gray-700 text-xs py-8 font-arcade">RETROTHRIFTCO</p>

      {/* Markdown Modal */}
      {showMarkdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-orange-900/20">
              <h2 className="text-xl font-bold text-white">Markdown Price</h2>
              <button
                type="button"
                onClick={() => setShowMarkdownModal(false)}
                className="text-gray-400 hover:text-white"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="markdown-slider" className="block text-sm font-medium text-gray-300 mb-2">
                  Markdown Percentage
                </label>
                <div className="flex items-center gap-4">
                  <input
                    id="markdown-slider"
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={markdownPercent}
                    onChange={(e) => setMarkdownPercent(Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    aria-label="Markdown percentage slider"
                  />
                  <span className="text-2xl font-bold text-orange-400 w-16 text-right" aria-live="polite">
                    {markdownPercent}%
                  </span>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Original Price</span>
                  <span className="text-white font-semibold">
                    {formatPrice(item.sellingPrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Discount</span>
                  <span className="text-orange-400 font-semibold">
                    -{formatPrice(Math.round(item.sellingPrice * (markdownPercent / 100)))}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                  <span className="text-white font-semibold">New Price</span>
                  <span className="text-2xl font-bold text-green-400">
                    {formatPrice(Math.round(item.sellingPrice * (1 - markdownPercent / 100)))}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-gray-800/50">
              <Button
                onClick={() => setShowMarkdownModal(false)}
                variant="secondary"
                className="bg-gray-700 hover:bg-gray-600"
              >
                Cancel
              </Button>
              <Button
                onClick={handleMarkdown}
                disabled={isProcessing}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {isProcessing ? 'Applying...' : 'Apply Markdown'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Sale Modal */}
      {item && showCreateSaleModal && user && (
        <CreateSaleModal
          isOpen={showCreateSaleModal}
          onClose={() => setShowCreateSaleModal(false)}
          item={item}
          onSaleCreated={async (saleData) => {
            await createSale(user.id, {
              itemId: item.id,
              itemName: item.name,
              itemImageUrl: item.imageUrl,
              ...saleData,
              saleSource: 'detail_page',
            });
            setShowCreateSaleModal(false);
          }}
        />
      )}
    </div>
  );
}
