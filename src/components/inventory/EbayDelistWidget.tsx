/**
 * EbayDelistWidget — the /tools eBay delist section.
 *
 * Surfaces every item whose REAL stock has hit 0 (because the units sold on
 * other sites) while its eBay listing is STILL live with quantity > 0. Those
 * listings are overselling risk and must come down:
 *
 *   real stock = eBay available qty − non-eBay sales (Poshmark/Depop/in-person/
 *   Whatnot). When that is ≤ 0 there is nothing left to sell anywhere, so the
 *   eBay listing has to be ended too.
 *
 * Delisting calls the same path the inventory "Check Qty" flow uses
 * (ebayService.endItem → ebayEndItem CF), then marks the item delisted +
 * OUT_OF_STOCK so it drops out of this list. Per-row spinners mirror the
 * Poshmark/Depop delist queue.
 */
import { useMemo, useState } from 'react';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { useItemStore } from '../../store/useItemStore';
import { useAuthStore } from '../../store/useAuthStore';
import { stockOnHand } from '../../services/inventory/stockOnHand';
import { ebayService } from '../../services/ebayService';
import { PackageX, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { Item } from '../../types/item';

const db = getFirestore(app);

function itemImage(it: any): string | undefined {
  if (Array.isArray(it?.imageUrl)) return it.imageUrl[0];
  return it?.imageUrl || it?.ebayPrimaryImage
    || it?.ebayPhotos?.[0]?.firebaseStorageUrl || it?.ebayPhotos?.[0]?.ebayUrl;
}
function itemTitle(it: any): string {
  return it?.name || it?.ebayFullTitle || it?.title || it?.id || '(no title)';
}
function ebayIdOf(it: any): string | undefined {
  return it?.ebayListingId || it?.ebayItemId;
}

export const EbayDelistWidget = () => {
  const { items, initializeStore } = useItemStore();
  const { user } = useAuthStore();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Items live on eBay (qty > 0, not already delisted) but real stock ≤ 0.
  const candidates = useMemo(() => {
    return (items as any[]).filter((it) => {
      if (!ebayIdOf(it)) return false;
      if (it.ebayDelisted === true) return false;
      if ((it.ebayQuantity ?? 0) <= 0) return false;
      return stockOnHand(it) <= 0;
    });
  }, [items]);

  const delistOne = async (it: any): Promise<boolean> => {
    const ebayId = ebayIdOf(it);
    if (!ebayId) return false;
    try {
      await ebayService.endItem(ebayId);
    } catch (err: any) {
      // "already been closed" just means eBay already ended it — treat as success
      // and still mark it locally so it leaves the queue.
      if (!String(err?.message || '').includes('already been closed')) {
        console.warn('[EbayDelistWidget] endItem failed for', it.id, err?.message);
        toast.error(`Failed to end "${itemTitle(it).slice(0, 40)}" on eBay`);
        return false;
      }
    }
    try {
      await updateDoc(doc(db, 'Item', it.id), {
        ebayDelisted: true,
        ebayQuantity: 0,
        status: 'SOLD',
        stockStatus: 'OUT_OF_STOCK',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[EbayDelistWidget] patch failed for', it.id, err);
      return false;
    }
    return true;
  };

  const handleDelistOne = async (it: Item) => {
    setBusyIds((prev) => new Set(prev).add(it.id));
    const ok = await delistOne(it);
    if (ok) toast.success(`Delisted "${itemTitle(it).slice(0, 40)}" from eBay`);
    setBusyIds((prev) => { const n = new Set(prev); n.delete(it.id); return n; });
    if (ok && user) await initializeStore(user.id);
  };

  const handleDelistAll = async () => {
    if (candidates.length === 0) return;
    if (!window.confirm(
      `Delist ${candidates.length} item${candidates.length === 1 ? '' : 's'} from eBay?\n\n` +
      `These have eBay stock but real stock ≤ 0 (sold on other sites). Ending the eBay listings prevents overselling.`,
    )) return;
    setBulkBusy(true);
    let ended = 0;
    for (const it of candidates) {
      setBusyIds((prev) => new Set(prev).add(it.id));
      const ok = await delistOne(it);
      if (ok) ended++;
      setBusyIds((prev) => { const n = new Set(prev); n.delete(it.id); return n; });
    }
    setBulkBusy(false);
    toast.success(`Delisted ${ended} item${ended === 1 ? '' : 's'} from eBay`);
    if (user) await initializeStore(user.id);
  };

  return (
    <div className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PackageX className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-gray-100">eBay — needs delisting</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">{candidates.length} item{candidates.length === 1 ? '' : 's'}</span>
          {candidates.length > 0 && (
            <button
              type="button"
              onClick={handleDelistAll}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {bulkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Delist all
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-500 mb-3">
        Real stock hit 0 from other-site sales but the eBay listing is still live — ending it prevents overselling.
      </p>

      {candidates.length === 0 ? (
        <div className="text-xs text-gray-500 py-3">Nothing to delist — every live eBay listing still has real stock. ✅</div>
      ) : (
        <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {candidates.map((it) => {
            const soh = stockOnHand(it);
            const eq = it.ebayQuantity;
            const img = itemImage(it);
            const busy = busyIds.has(it.id);
            const ebayId = ebayIdOf(it);
            return (
              <li key={it.id} className="flex items-center gap-2 text-xs bg-gray-900/40 rounded px-2 py-1.5">
                {img ? (
                  <img src={img} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" loading="lazy" />
                ) : (
                  <div className="h-10 w-10 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <PackageX className="h-4 w-4 text-gray-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-gray-100 truncate" title={itemTitle(it)}>{itemTitle(it)}</div>
                  <div className="text-[11px] text-gray-500 flex items-center gap-2">
                    <span>eBay qty {typeof eq === 'number' ? eq : '—'} · real stock {soh}</span>
                    {ebayId && (
                      <a
                        href={`https://www.ebay.com/itm/${ebayId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 text-gray-500 hover:text-gray-300"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelistOne(it)}
                  disabled={busy || bulkBusy}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 flex-shrink-0"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Delist'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default EbayDelistWidget;
