/**
 * EbayDelistConfirmModal — shown after an eBay Check Quantity run when items
 * still have eBay stock but real stock (stockOnHand) ≤ 0 (sold on other
 * platforms). Confirms ending those eBay listings.
 */
import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { Item } from '../../types/item';
import { stockOnHand } from '../../services/inventory/stockOnHand';

interface Props {
  open: boolean;
  items: Item[];
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  processing?: boolean;
}

function img(it: any): string | undefined {
  if (Array.isArray(it.imageUrl)) return it.imageUrl[0];
  return it.imageUrl || it.ebayPrimaryImage || it.ebayPhotos?.[0]?.firebaseStorageUrl || it.ebayPhotos?.[0]?.ebayUrl;
}

export function EbayDelistConfirmModal({ open, items, onCancel, onConfirm, processing }: Props) {
  const [busy, setBusy] = useState(false);
  const isBusy = busy || processing;

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o && !isBusy) onCancel(); }} title="Delist from eBay?" size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-100">
            These items still show stock on eBay, but your real stock is <strong>0 or less</strong> (the units sold on
            Poshmark/Depop/in-person). Ending their eBay listings prevents overselling.
          </p>
        </div>

        <ul className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
          {items.map((it) => {
            const soh = stockOnHand(it as any);
            const eq = (it as any).ebayQuantity;
            const image = img(it);
            return (
              <li key={it.id} className="flex items-center gap-3 bg-gray-800/40 border border-gray-700/40 rounded-lg px-3 py-2">
                {image && <img src={image} alt="" className="h-9 w-9 rounded object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-100 truncate">{(it as any).name || (it as any).ebayFullTitle || it.id}</div>
                  <div className="text-[11px] text-gray-500">eBay qty {typeof eq === 'number' ? eq : '—'} · real stock {soh}</div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} disabled={isBusy}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 hover:bg-gray-800 border border-gray-700 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" disabled={isBusy}
            onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 flex items-center gap-2">
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Delist {items.length} from eBay
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default EbayDelistConfirmModal;
