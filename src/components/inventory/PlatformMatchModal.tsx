import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X as XIcon, RefreshCw, Edit3, CheckCircle2, Loader2, Search, Package } from 'lucide-react';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { writeBatch, doc, getFirestore } from 'firebase/firestore';
import { app } from '../../lib/firebase/client';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';
import { bulkSetListingItemIds } from '../../services/inventory/platformListing';
import { toast } from 'sonner';

interface SignalContribs {
  S1_descPrefix: number;
  S2_titlePrefix: number;
  S3_identifier: number;
  S4_jaccard: number;
  S5_allStructured: number;
  S6_jerseyNumber: number;
  S7_substring?: number;
}

interface Candidate {
  itemId: string;
  itemTitle: string;
  score: number;
  contribs: SignalContribs;
}

interface ProposedMatch {
  listingId: string;
  platform: 'depop' | 'poshmark';
  listingTitle: string;
  itemId: string;
  itemTitle: string;
  confidence: 'high' | 'medium';
}

interface PlatformMatchModalProps {
  open: boolean;
  platform: 'depop' | 'poshmark';
  onClose: () => void;
  onApplied?: () => void;
}

type Selection = string | 'none' | { manual: string; manualTitle: string };

const PLATFORM_LABEL = { depop: 'Depop', poshmark: 'Poshmark' } as const;
const PLATFORM_ACCENT = {
  depop: 'border-red-500/40 bg-red-900/20 text-red-100',
  poshmark: 'border-purple-500/40 bg-purple-900/20 text-purple-100',
} as const;

function ContribLine({ contribs, score }: { contribs: SignalContribs; score: number }) {
  const parts: string[] = [];
  if (contribs.S1_descPrefix > 0) parts.push(`S1=${contribs.S1_descPrefix}`);
  if (contribs.S2_titlePrefix > 0) parts.push(`S2=${contribs.S2_titlePrefix}`);
  if (contribs.S3_identifier > 0) parts.push(`S3=${contribs.S3_identifier}`);
  if (contribs.S4_jaccard > 0) parts.push(`S4=${contribs.S4_jaccard}`);
  if (contribs.S5_allStructured > 0) parts.push(`S5=${contribs.S5_allStructured}`);
  if (contribs.S6_jerseyNumber > 0) parts.push(`S6=${contribs.S6_jerseyNumber}`);
  if (contribs.S7_substring && contribs.S7_substring > 0) parts.push(`S7=${contribs.S7_substring}`);
  return (
    <span className="text-[10px] text-gray-500 font-mono ml-2">
      {parts.join(' · ')} → <span className="text-amber-300 font-semibold">{score}</span>
    </span>
  );
}

export const PlatformMatchModal = ({ open, platform, onClose, onApplied }: PlatformMatchModalProps) => {
  const { user } = useAuthStore();
  const { items, initializeStore } = useItemStore();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [candidatesByListing, setCandidatesByListing] = useState<Record<string, Candidate[]>>({});
  const [proposedMatches, setProposedMatches] = useState<ProposedMatch[]>([]);
  const [selection, setSelection] = useState<Record<string, Selection>>({});
  const [excludeMap, setExcludeMap] = useState<Record<string, string[]>>({});
  const [reloadingListingId, setReloadingListingId] = useState<string | null>(null);
  const [manualPickerListingId, setManualPickerListingId] = useState<string | null>(null);
  const [manualSearch, setManualSearch] = useState('');
  const [applying, setApplying] = useState(false);

  // Index items by id for the manual picker + selection display.
  const itemsById = useMemo(() => {
    const map = new Map<string, { id: string; title: string; imageUrl?: string }>();
    for (const it of items) {
      const anyIt = it as any;
      const imageUrl =
        anyIt.imageUrl ||
        anyIt.ebayPrimaryImage ||
        anyIt.ebayPhotos?.[0]?.firebaseStorageUrl ||
        anyIt.ebayPhotos?.[0]?.ebayUrl ||
        undefined;
      map.set(it.id, {
        id: it.id,
        title: anyIt.ebayFullTitle || it.name || it.id,
        imageUrl,
      });
    }
    return map;
  }, [items]);

  const filteredItemsForManual = useMemo(() => {
    if (!manualSearch.trim()) return items.slice(0, 30);
    const q = manualSearch.toLowerCase();
    return items.filter(it => {
      const t = ((it as any).ebayFullTitle || it.name || '').toLowerCase();
      return t.includes(q);
    }).slice(0, 30);
  }, [items, manualSearch]);

  // Run matcher when modal opens.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setCandidatesByListing({});
      setProposedMatches([]);
      setSelection({});
      setExcludeMap({});
      try {
        const cf = httpsCallable(getFunctions(app), 'matchListingsWithAI', { timeout: 540000 });
        // No runId passed — matcher runs read-only. The CF only writes to aiMatchRuns
        // when runId is present; without it, no Firestore writes happen here. Bindings
        // are only persisted later when the user clicks Apply.
        const result = await cf({ onlyPlatform: platform });
        if (cancelled) return;
        const data = result.data as { success: boolean; proposedMatches?: ProposedMatch[]; candidatesByListing?: Record<string, Candidate[]>; stats?: any; error?: string };
        if (!data.success) {
          toast.error(`Match run failed: ${data.error || 'unknown'}`);
          return;
        }
        const cbl = data.candidatesByListing || {};
        const proposals = data.proposedMatches || [];
        setCandidatesByListing(cbl);
        setProposedMatches(proposals);
        // Default selection per listing = top candidate (or 'none' if no candidates).
        const initialSel: Record<string, Selection> = {};
        for (const [listingId, cands] of Object.entries(cbl)) {
          initialSel[listingId] = cands.length > 0 ? cands[0].itemId : 'none';
        }
        setSelection(initialSel);
        toast.info(`Found candidates for ${Object.keys(cbl).length} ${PLATFORM_LABEL[platform]} listing${Object.keys(cbl).length === 1 ? '' : 's'}.`);
      } catch (err: any) {
        if (!cancelled) toast.error(`Match run failed: ${err?.message || 'unknown'}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user, platform]);

  if (!open) return null;

  const listingIds = Object.keys(candidatesByListing);

  // Per-card reload: re-run matcher for just this listing, excluding the currently-shown candidates.
  const handleReloadCard = async (listingId: string) => {
    if (!user) return;
    setReloadingListingId(listingId);
    try {
      const currentCands = candidatesByListing[listingId] || [];
      const newExcludes = [...(excludeMap[listingId] || []), ...currentCands.map(c => c.itemId)];
      const nextExcludeMap = { ...excludeMap, [listingId]: newExcludes };
      setExcludeMap(nextExcludeMap);

      const cf = httpsCallable(getFunctions(app), 'matchListingsWithAI', { timeout: 120000 });
      // Read-only: no runId, so no Firestore writes during the per-card reload.
      const result = await cf({
        onlyPlatform: platform,
        onlyListingIds: [listingId],
        excludeMap: nextExcludeMap,
      });
      const data = result.data as { success: boolean; candidatesByListing?: Record<string, Candidate[]>; error?: string };
      if (!data.success) {
        toast.error(`Reload failed: ${data.error || 'unknown'}`);
        return;
      }
      const fresh = data.candidatesByListing?.[listingId] || [];
      if (fresh.length === 0) {
        toast.info('No more candidates left for this listing.');
        setCandidatesByListing(prev => ({ ...prev, [listingId]: [] }));
        setSelection(prev => ({ ...prev, [listingId]: 'none' }));
      } else {
        setCandidatesByListing(prev => ({ ...prev, [listingId]: fresh }));
        setSelection(prev => ({ ...prev, [listingId]: fresh[0].itemId }));
      }
    } catch (err: any) {
      toast.error(`Reload failed: ${err?.message || 'unknown'}`);
    } finally {
      setReloadingListingId(null);
    }
  };

  const handleManualPick = (listingId: string, itemId: string) => {
    const item = itemsById.get(itemId);
    if (!item) return;
    setSelection(prev => ({ ...prev, [listingId]: { manual: itemId, manualTitle: item.title } }));
    setManualPickerListingId(null);
    setManualSearch('');
  };

  const handleApply = async () => {
    if (!user) return;
    // Build the apply set: every listing whose selection is an itemId or {manual: ...}.
    const toApply: Array<{ listingId: string; itemId: string; listingTitle: string; itemTitle: string }> = [];
    for (const listingId of listingIds) {
      const sel = selection[listingId];
      if (!sel || sel === 'none') continue;
      const itemId = typeof sel === 'string' ? sel : sel.manual;
      const proposal = proposedMatches.find(p => p.listingId === listingId);
      const candidate = (candidatesByListing[listingId] || []).find(c => c.itemId === itemId);
      const itemTitle = candidate?.itemTitle || (typeof sel === 'object' ? sel.manualTitle : itemsById.get(itemId)?.title) || '(no title)';
      toApply.push({
        listingId,
        itemId,
        listingTitle: proposal?.listingTitle || '(no title)',
        itemTitle,
      });
    }
    if (toApply.length === 0) {
      toast.info('Nothing selected to apply.');
      return;
    }
    setApplying(true);
    console.log(`[Apply] Starting apply for ${toApply.length} matches on ${platform}. Sample:`, toApply[0]);
    try {
      console.log('[Apply] Step 1/4: writing PlatformListing.itemId via bulkSetListingItemIds');
      await bulkSetListingItemIds(user.id, toApply.map(m => ({ platform, listingId: m.listingId, itemId: m.itemId })));
      console.log('[Apply] Step 1/4 done.');

      console.log('[Apply] Step 2/4: writing Item back-pointers via writeBatch');
      const firestore = getFirestore(app);
      const itemPatches = new Map<string, Record<string, any>>();
      for (const m of toApply) {
        const patch = itemPatches.get(m.itemId) || {};
        if (platform === 'poshmark') {
          patch.poshmarkListingId = m.listingId;
          patch.poshmarkUrl = `https://poshmark.com/listing/${m.listingId}`;
        } else {
          patch.depopListingId = m.listingId;
          patch.depopUrl = `https://www.depop.com/products/${m.listingId}`;
        }
        itemPatches.set(m.itemId, patch);
      }
      const entries = Array.from(itemPatches.entries());
      console.log(`[Apply] Step 2/4: ${entries.length} unique items to patch`);
      const BATCH_SIZE = 400;
      for (let start = 0; start < entries.length; start += BATCH_SIZE) {
        const slice = entries.slice(start, start + BATCH_SIZE);
        const batch = writeBatch(firestore);
        for (const [itemId, patch] of slice) {
          batch.update(doc(firestore, 'Item', itemId), patch);
        }
        await batch.commit();
        console.log(`[Apply] Step 2/4: committed batch ${Math.floor(start / BATCH_SIZE) + 1}`);
      }
      console.log('[Apply] Step 2/4 done.');

      console.log('[Apply] Step 3/4: refreshing item store');
      await initializeStore(user.id);
      console.log('[Apply] Step 3/4 done.');

      console.log('[Apply] Step 4/4: closing modal + navigating to /closet');
      toast.success(`Applied ${toApply.length} match${toApply.length === 1 ? '' : 'es'} — viewing inventory.`);
      onApplied?.();
      onClose();
      navigate('/closet');
      console.log('[Apply] All done.');
    } catch (err: any) {
      console.error('[Apply] FAILED:', err);
      toast.error(`Apply failed: ${err?.message || 'unknown'}`);
    } finally {
      setApplying(false);
    }
  };

  const totalSelected = listingIds.filter(id => {
    const s = selection[id];
    return s && s !== 'none';
  }).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f23] border-2 border-amber-500/40 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <div className={`px-2 py-1 rounded text-xs font-semibold border ${PLATFORM_ACCENT[platform]}`}>
              {PLATFORM_LABEL[platform]}
            </div>
            <div>
              <h2 className="text-lg font-bold text-amber-100">Match listings</h2>
              <p className="text-xs text-gray-400">
                {loading
                  ? 'Finding candidates…'
                  : `${listingIds.length} unmatched listing${listingIds.length === 1 ? '' : 's'} · ${totalSelected} selected`}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={applying} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-100 disabled:opacity-50">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Scoring candidates for every {PLATFORM_LABEL[platform]} listing…</p>
            </div>
          )}
          {!loading && listingIds.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-12">
              No unmatched {PLATFORM_LABEL[platform]} listings to review.
            </div>
          )}
          {!loading && listingIds.length > 0 && (
            <div className="divide-y divide-gray-800/60">
              {listingIds.map(listingId => {
                const cands = candidatesByListing[listingId] || [];
                const proposal = proposedMatches.find(p => p.listingId === listingId);
                const sel = selection[listingId];
                const isReloading = reloadingListingId === listingId;
                const isManual = typeof sel === 'object' && sel !== null && 'manual' in sel;
                const selectedCandidate = typeof sel === 'string' && sel !== 'none' ? cands.find(c => c.itemId === sel) : undefined;

                return (
                  <div key={listingId} className="px-3 py-3 hover:bg-gray-900/40">
                    {/* Listing header (one line, like an inventory row) */}
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-100 truncate" title={proposal?.listingTitle || listingId}>
                          {proposal?.listingTitle || listingId}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleReloadCard(listingId)}
                          disabled={isReloading || applying}
                          title="Reload — swap in next 3 candidates"
                          className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isReloading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setManualPickerListingId(listingId); setManualSearch(''); }}
                          disabled={applying}
                          title="Manual match — pick any item from inventory"
                          className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-50"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Candidate rows — each one is an inventory-style row with image + title */}
                    <div className="space-y-1">
                      {cands.map(c => {
                        const isSelected = sel === c.itemId;
                        const itemMeta = itemsById.get(c.itemId);
                        const img = itemMeta?.imageUrl;
                        return (
                          <label
                            key={c.itemId}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${
                              isSelected
                                ? 'bg-amber-900/30 border border-amber-500/40'
                                : 'bg-gray-900/30 border border-gray-800 hover:border-gray-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`sel-${listingId}`}
                              checked={isSelected}
                              onChange={() => setSelection(prev => ({ ...prev, [listingId]: c.itemId }))}
                              className="flex-shrink-0"
                            />
                            {img ? (
                              <img src={img} alt="" className="h-9 w-9 object-cover rounded flex-shrink-0" loading="lazy" />
                            ) : (
                              <div className="h-9 w-9 bg-gray-800 rounded flex items-center justify-center flex-shrink-0">
                                <Package className="h-4 w-4 text-gray-600" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm truncate ${isSelected ? 'text-amber-100' : 'text-gray-200'}`}>
                                {c.itemTitle}
                              </div>
                              <ContribLine contribs={c.contribs} score={c.score} />
                            </div>
                            <span className="text-xs font-mono text-amber-300 flex-shrink-0">{c.score}</span>
                          </label>
                        );
                      })}
                      {/* Manually-picked option */}
                      {isManual && (() => {
                        const manualItemId = (sel as { manual: string; manualTitle: string }).manual;
                        const itemMeta = itemsById.get(manualItemId);
                        const img = itemMeta?.imageUrl;
                        return (
                          <label className="flex items-center gap-2 px-2 py-1.5 rounded bg-blue-900/30 border border-blue-500/40 cursor-pointer">
                            <input type="radio" name={`sel-${listingId}`} checked readOnly className="flex-shrink-0" />
                            {img ? (
                              <img src={img} alt="" className="h-9 w-9 object-cover rounded flex-shrink-0" loading="lazy" />
                            ) : (
                              <div className="h-9 w-9 bg-gray-800 rounded flex items-center justify-center flex-shrink-0">
                                <Package className="h-4 w-4 text-gray-600" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-blue-100 truncate">
                                {(sel as { manualTitle: string }).manualTitle}
                              </div>
                              <div className="text-[10px] text-blue-400">manual pick</div>
                            </div>
                          </label>
                        );
                      })()}
                      {/* None of these */}
                      <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${
                        sel === 'none' ? 'bg-gray-700/40 border border-gray-500/40' : 'bg-gray-900/20 border border-gray-800 hover:border-gray-700'
                      }`}>
                        <input
                          type="radio"
                          name={`sel-${listingId}`}
                          checked={sel === 'none'}
                          onChange={() => setSelection(prev => ({ ...prev, [listingId]: 'none' }))}
                          className="flex-shrink-0"
                        />
                        <div className="h-9 w-9 flex items-center justify-center flex-shrink-0">
                          <XIcon className="h-4 w-4 text-gray-500" />
                        </div>
                        <span className="text-sm text-gray-400">None of these</span>
                      </label>
                    </div>

                    {/* Suppress the unused-var lint; selectedCandidate is currently only used for the per-candidate breakdown above */}
                    {selectedCandidate ? null : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-amber-500/20 p-3 flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} disabled={applying} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-100 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || totalSelected === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 rounded-xl text-emerald-100 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-4 w-4" />
            {applying ? 'Applying…' : `Apply ${totalSelected} match${totalSelected === 1 ? '' : 'es'}`}
          </button>
        </div>
      </div>

      {/* Manual picker overlay */}
      {manualPickerListingId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setManualPickerListingId(null)}>
          <div className="bg-[#0f0f23] border-2 border-blue-500/40 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-blue-500/20">
              <h3 className="text-base font-bold text-blue-100">Manual match — pick any item</h3>
              <button type="button" onClick={() => setManualPickerListingId(null)} className="p-1 hover:bg-gray-800 rounded text-gray-400">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 border-b border-blue-500/10">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-gray-500" />
                <input
                  autoFocus
                  type="text"
                  value={manualSearch}
                  onChange={e => setManualSearch(e.target.value)}
                  placeholder="Search by title…"
                  className="w-full pl-8 pr-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredItemsForManual.length === 0 && (
                <div className="text-xs text-gray-500 p-4 text-center">No matches.</div>
              )}
              {filteredItemsForManual.map(it => {
                const title = (it as any).ebayFullTitle || it.name || it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handleManualPick(manualPickerListingId, it.id)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-blue-900/20 text-sm text-gray-100"
                  >
                    {title}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
