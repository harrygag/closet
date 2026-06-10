/**
 * UnifiedCheckPanel — ONE bottom-right widget that reconciles every site for the
 * scoped items against our real stock (stockOnHand = eBay available − non-eBay
 * unit sales). Opens immediately; each row shows per-site chips (eBay / Posh /
 * Depop) with a spinner on the site being verified — like the delist walk.
 *
 * Phases:
 *  0) eBay — run the bulk eBay mirror (onEbayCheck) once; eBay chips show
 *     "checking" until it returns, then resolve from the freshly-updated store:
 *       gone (delisted/qty 0) · mismatch (live but real stock ≤ 0) · ok.
 *  1) Poshmark/Depop — verified per item via the extension. Gone → clear that
 *     binding (+ live store patch via immer mutation) so Should-List / delist
 *     queue update mid-walk. Live but real ≤ 0 → amber mismatch.
 *  done) onDone() — parent flags eBay delist candidates for the confirm popup.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Check, X, AlertTriangle, RotateCcw } from 'lucide-react';
import { getFirestore, doc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { checkPoshmarkListing } from '../../lib/extension/poshmarkActions';
import { checkDepopListing } from '../../lib/extension/depopActions';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { stockOnHand } from '../../services/inventory/stockOnHand';
import { toast } from 'sonner';
import type { Item } from '../../types/item';

const db = getFirestore(app);

interface Props {
  items: Item[];
  onClose: () => void;
  onDone: () => void;
  /** Bulk eBay mirror (ClosetView.handleCheckEbayQuantities) — run as step 0. */
  onEbayCheck: () => Promise<void>;
}

type CellState = 'na' | 'pending' | 'checking' | 'ok' | 'cleared' | 'gone' | 'mismatch';

function depopSlug(it: any): string {
  const m = (it.depopUrl || '').match(/products\/([^/?#]+)/);
  return m ? m[1] : String(it.depopListingId || '');
}

function ebayCellFrom(it: any): CellState {
  if (!it || !(it.ebayListingId || it.ebayItemId)) return 'na';
  if (it.ebayDelisted === true || (it.ebayQuantity ?? 0) <= 0) return 'gone';
  if (stockOnHand(it) <= 0) return 'mismatch';
  return 'ok';
}

function Chip({ label, state, color }: { label: string; state: CellState; color: string }) {
  if (state === 'na') return <span className="w-[52px]" />;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-gray-700 w-[52px] justify-center">
      <span style={{ color }}>{label}</span>
      {state === 'checking' && <Loader2 className="h-3 w-3 animate-spin text-blue-400" />}
      {state === 'ok' && <Check className="h-3 w-3 text-emerald-400" />}
      {state === 'cleared' && <RotateCcw className="h-3 w-3 text-amber-400" />}
      {state === 'gone' && <X className="h-3 w-3 text-red-400" />}
      {state === 'mismatch' && <AlertTriangle className="h-3 w-3 text-amber-400" />}
      {state === 'pending' && <span className="block h-1.5 w-1.5 rounded-full bg-gray-600" />}
    </span>
  );
}

export function UnifiedCheckPanel({ items, onClose, onDone, onEbayCheck }: Props) {
  const { user } = useAuthStore();
  const { initializeStore } = useItemStore();
  const [ebay, setEbay] = useState<Record<string, CellState>>({});
  const [posh, setPosh] = useState<Record<string, CellState>>({});
  const [depop, setDepop] = useState<Record<string, CellState>>({});
  const [phase, setPhase] = useState<'ebay' | 'walk' | 'done'>('ebay');
  const [idx, setIdx] = useState(0);
  const cancelledRef = useRef(false);
  const liveRef = useRef(0);
  const clearedRef = useRef(0);

  useEffect(() => {
    cancelledRef.current = false;
    let active = true;

    // Seed: eBay "checking", Posh/Depop "pending" for bound sites.
    const e0: Record<string, CellState> = {};
    const p0: Record<string, CellState> = {};
    const d0: Record<string, CellState> = {};
    for (const it of items as any[]) {
      e0[it.id] = (it.ebayListingId || it.ebayItemId) ? 'checking' : 'na';
      p0[it.id] = it.poshmarkListingId ? 'pending' : 'na';
      d0[it.id] = it.depopListingId ? 'pending' : 'na';
    }
    setEbay(e0); setPosh(p0); setDepop(d0);

    const freshById = () => {
      const all = useItemStore.getState().items as any[];
      const m = new Map<string, any>();
      for (const i of all) m.set(i.id, i);
      return m;
    };

    const clearBinding = async (it: any, platform: 'poshmark' | 'depop') => {
      const patch: Record<string, any> = { updatedAt: serverTimestamp() };
      if (platform === 'poshmark') {
        patch.poshmarkListingId = deleteField();
        patch.poshmarkUrl = deleteField();
        patch.poshmarkQuantity = deleteField();
        patch.poshmarkDelistedAt = new Date().toISOString();
      } else {
        patch.depopListingId = deleteField();
        patch.depopUrl = deleteField();
        patch.depopQuantity = deleteField();
        patch.depopDelistedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'Item', it.id), patch);
      // Live store patch — IMMER mutation pattern (store uses immer middleware,
      // so we must mutate the draft, NOT return a new object).
      useItemStore.setState((state: any) => {
        const strip = (x: any) => {
          if (platform === 'poshmark') { delete x.poshmarkListingId; delete x.poshmarkUrl; delete x.poshmarkQuantity; }
          else { delete x.depopListingId; delete x.depopUrl; delete x.depopQuantity; }
        };
        for (const x of state.items) if (x.id === it.id) strip(x);
        for (const x of state.filteredItems) if (x.id === it.id) strip(x);
      });
    };

    // eBay bulk mirror runs IN PARALLEL — it can be slow (Trading API fetchAll),
    // so we never block the per-item Posh/Depop walk on it. eBay chips resolve
    // whenever it returns.
    const ebayPromise = (async () => {
      try { await onEbayCheck(); } catch (e) { console.error('[UnifiedCheck] eBay step failed', e); }
      if (!active || cancelledRef.current) return;
      const fresh0 = freshById();
      setEbay(() => {
        const next: Record<string, CellState> = {};
        for (const it of items as any[]) next[it.id] = ebayCellFrom(fresh0.get(it.id) || it);
        return next;
      });
    })();

    (async () => {
      // ── Poshmark/Depop per-item walk (starts immediately) ──
      setPhase('walk');
      const byId = freshById();
      for (let i = 0; i < items.length; i++) {
        if (cancelledRef.current || !active) return;
        const base = items[i] as any;
        const it = byId.get(base.id) || base;
        setIdx(i);

        if (it.poshmarkListingId) {
          setPosh((s) => ({ ...s, [it.id]: 'checking' }));
          try {
            const res = await checkPoshmarkListing(String(it.poshmarkListingId));
            if (!active || cancelledRef.current) return;
            if (res.exists) { liveRef.current++; setPosh((s) => ({ ...s, [it.id]: stockOnHand(it) <= 0 ? 'mismatch' : 'ok' })); }
            else { await clearBinding(it, 'poshmark'); clearedRef.current++; setPosh((s) => ({ ...s, [it.id]: 'cleared' })); }
          } catch { setPosh((s) => ({ ...s, [it.id]: 'gone' })); }
          await new Promise((r) => setTimeout(r, 350));
        }

        if (it.depopListingId) {
          if (cancelledRef.current || !active) return;
          setDepop((s) => ({ ...s, [it.id]: 'checking' }));
          try {
            const res = await checkDepopListing(depopSlug(it));
            if (!active || cancelledRef.current) return;
            if (res.exists) { liveRef.current++; setDepop((s) => ({ ...s, [it.id]: stockOnHand(it) <= 0 ? 'mismatch' : 'ok' })); }
            else { await clearBinding(it, 'depop'); clearedRef.current++; setDepop((s) => ({ ...s, [it.id]: 'cleared' })); }
          } catch { setDepop((s) => ({ ...s, [it.id]: 'gone' })); }
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      if (!active || cancelledRef.current) return;
      // Make sure the eBay mirror has finished so onDone's delist-candidate scan
      // sees fresh quantities.
      await ebayPromise;
      if (!active || cancelledRef.current) return;
      setPhase('done');
      toast.success(`Check complete — ${liveRef.current} live · ${clearedRef.current} cleared`);
      if (clearedRef.current > 0 && user) await initializeStore(user.id);
      onDone();
    })();

    return () => { active = false; };
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = items.length;
  const header = phase === 'ebay' ? 'Checking eBay…'
    : phase === 'walk' ? `Checking Posh/Depop ${Math.min(idx + 1, total)}/${total}`
    : 'Check complete';

  return (
    <div className="fixed bottom-4 right-4 z-[1200] w-[360px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="text-sm font-bold text-gray-100">{header}</div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-200" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="max-h-[360px] overflow-y-auto py-1">
        {(items as any[]).map((it) => (
          <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-xs">
            <span className="flex-1 truncate text-gray-300" title={it.name || it.ebayFullTitle || it.id}>
              {it.name || it.ebayFullTitle || it.id}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Chip label="eBay" state={ebay[it.id] || 'na'} color="#5B9BD5" />
              <Chip label="Posh" state={posh[it.id] || 'na'} color="#C45A9C" />
              <Chip label="Depop" state={depop[it.id] || 'na'} color="#E0796B" />
            </div>
          </li>
        ))}
      </ul>

      <div className="px-4 py-2.5 border-t border-gray-800 flex items-center justify-between">
        <span className="text-[11px] text-gray-500">{liveRef.current} live · {clearedRef.current} cleared</span>
        {phase !== 'done' ? (
          <button onClick={() => { cancelledRef.current = true; setPhase('done'); onClose(); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800">
            Cancel
          </button>
        ) : (
          <button onClick={onClose}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-black border border-gray-700 text-gray-100 hover:bg-gray-800">
            Done
          </button>
        )}
      </div>
    </div>
  );
}

export default UnifiedCheckPanel;
