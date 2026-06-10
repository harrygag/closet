/**
 * ShouldListWidget — every Item that has real stock available but is NOT yet
 * listed on the current platform. Counterpart to DelistQueueWidget.
 *
 * Uses the shared `stockOnHand` helper (services/inventory/stockOnHand.ts) so the
 * filter stays consistent with reconciliation.ts and the delist widget:
 *   stockOnHand(it) > 0 AND !item[platform+'ListingId']
 *
 * Per-row actions:
 *   • Copy title  → clipboard, for pasting into the platform's create form
 *   • Open create page  → new tab to the platform's listing-creation URL
 *
 * Critically: this widget NEVER stamps a `depopListingId` / `poshmarkListingId`
 * on the Item. The binding is only created via the explicit user-match flow in
 * the platform's Import modal — "no marker until listed AND matched."
 *
 * Liquid by design: drop a new platform into PLATFORM_CONFIG below and the rest
 * of the widget works without changes.
 */
import { useMemo, useState } from 'react';
import { Sparkles, Copy, ExternalLink, Check } from 'lucide-react';
import { useItemStore } from '../../store/useItemStore';
import { stockOnHand } from '../../services/inventory/stockOnHand';
import { toast } from 'sonner';

const PLATFORM_CONFIG: Record<'depop' | 'poshmark', {
  label: string;
  bindingKey: 'depopListingId' | 'poshmarkListingId';
  createUrl: string;
  color: string;
}> = {
  depop: {
    label: 'Depop',
    bindingKey: 'depopListingId',
    createUrl: 'https://www.depop.com/products/create',
    color: 'emerald',
  },
  poshmark: {
    label: 'Poshmark',
    bindingKey: 'poshmarkListingId',
    createUrl: 'https://poshmark.com/create-listing',
    color: 'rose',
  },
};

interface Props {
  platform: 'depop' | 'poshmark';
}

function itemTitleOf(it: any): string {
  return String(it?.name || it?.title || it?.ebayFullTitle || '(no title)');
}

function itemImage(it: any): string | undefined {
  if (Array.isArray(it?.imageUrls) && it.imageUrls[0]) return it.imageUrls[0];
  if (typeof it?.coverImage === 'string') return it.coverImage;
  return undefined;
}

export function ShouldListWidget({ platform }: Props) {
  const { items } = useItemStore();
  const cfg = PLATFORM_CONFIG[platform];
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const list = (items as any[]).filter((it) => {
      // No binding on this platform yet AND real stock > 0 AND eBay is the
      // anchor (we only suggest listing things that exist in the eBay-anchored
      // inventory; ebayDelisted/SOLD items are skipped).
      if (it[cfg.bindingKey]) return false;
      if (it.ebayDelisted === true || it.status === 'SOLD') return false;
      const soh = stockOnHand(it);
      return soh > 0;
    });
    // Sort by stock descending then title.
    list.sort((a, b) => (stockOnHand(b) - stockOnHand(a)) || itemTitleOf(a).localeCompare(itemTitleOf(b)));
    return list;
  }, [items, cfg.bindingKey]);

  if (candidates.length === 0) return null;

  async function copyTitle(it: any) {
    const t = itemTitleOf(it);
    try {
      await navigator.clipboard.writeText(t);
      setCopiedId(it.id);
      setTimeout(() => setCopiedId((cur) => (cur === it.id ? null : cur)), 1500);
      toast.success('Title copied');
    } catch {
      toast.error('Clipboard blocked — copy manually');
    }
  }

  return (
    <div className="bg-gray-900/60 border border-gray-700/50 rounded-2xl p-4 mb-6 shadow-lg">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className={`h-5 w-5 text-${cfg.color}-400`} />
          <h3 className="text-sm font-bold text-gray-100">
            Should list on {cfg.label} — {candidates.length} item{candidates.length === 1 ? '' : 's'}
          </h3>
        </div>
        <a
          href={cfg.createUrl}
          target="_blank"
          rel="noreferrer"
          className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border border-${cfg.color}-700/50 text-${cfg.color}-200 hover:bg-${cfg.color}-900/30`}
        >
          <ExternalLink className="h-3 w-3" />
          Open {cfg.label} create page
        </a>
      </div>
      <div className="text-[10px] text-gray-500 mb-2">
        Real stock &gt; 0 and not yet listed on {cfg.label}. No <span className="font-mono">{cfg.bindingKey}</span> is
        written here — bind via the {cfg.label} Import modal after you create the listing.
      </div>
      <ul className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
        {candidates.map((it: any) => {
          const img = itemImage(it);
          const stock = stockOnHand(it);
          const isCopied = copiedId === it.id;
          return (
            <li key={it.id} className="flex items-center gap-3 bg-gray-800/40 hover:bg-gray-800/70 border border-gray-700/40 rounded-lg px-3 py-2 transition-colors">
              {img && <img src={img} alt="" className="h-9 w-9 rounded object-cover flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-100 truncate" title={itemTitleOf(it)}>{itemTitleOf(it)}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2 truncate">
                  <span>stock: <span className="text-gray-300">{stock}</span></span>
                  {it.sku && <span>· SKU <span className="font-mono">{it.sku}</span></span>}
                  {it.ebayUrl && (
                    <a href={it.ebayUrl} target="_blank" rel="noreferrer" className="hover:text-gray-200 underline-offset-2 hover:underline">
                      eBay
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyTitle(it)}
                className="flex items-center gap-1 px-2 py-1 rounded border border-gray-700/60 hover:border-gray-500/60 text-gray-300 hover:text-gray-100 text-[11px]"
                title="Copy the title to paste into the create-listing form"
              >
                {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {isCopied ? 'Copied' : 'Copy title'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ShouldListWidget;
