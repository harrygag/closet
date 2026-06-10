import { useState, useMemo } from 'react';
import { X as XIcon, CheckCircle2, Square, CheckSquare, Bot, RefreshCw } from 'lucide-react';

export interface SignalContribs {
  S1_descPrefix: number;
  S2_titlePrefix: number;
  S3_identifier: number;
  S4_jaccard: number;
  S5_allStructured: number;
  S6_jerseyNumber: number;
  S7_substring?: number;
}

export interface ProposedMatch {
  listingId: string;
  platform: 'poshmark' | 'depop';
  listingTitle: string;
  itemId: string;
  itemTitle: string;
  confidence: 'high' | 'medium';
  source: 'tier1_prefix' | 'tier1_structured' | 'tier2_ai';
  reasoning?: string;
  score?: number;
  contribs?: SignalContribs;
}

interface AIMatchConfirmModalProps {
  open: boolean;
  matches: ProposedMatch[];
  onConfirm: (selected: ProposedMatch[]) => void;
  onCancel: () => void;
  isApplying?: boolean;
  // Optional Redo handler — when provided, a "Redo unchecked" button appears.
  // Receives the unchecked matches (each one is a listing with its rejected itemId);
  // implementation re-runs the matcher excluding those itemIds and updates the parent state.
  onRedoUnchecked?: (rejected: ProposedMatch[]) => Promise<void>;
  isRedoing?: boolean;
}

const SOURCE_LABEL: Record<ProposedMatch['source'], string> = {
  tier1_prefix: 'Prefix',
  tier1_structured: 'Structured',
  tier2_ai: 'Multi-signal',
};

const SOURCE_BG: Record<ProposedMatch['source'], string> = {
  tier1_prefix: 'bg-emerald-700/40 text-emerald-100',
  tier1_structured: 'bg-cyan-700/40 text-cyan-100',
  tier2_ai: 'bg-amber-700/40 text-amber-100',
};

function ScoreBreakdown({ score, contribs }: { score?: number; contribs?: SignalContribs }) {
  if (typeof score !== 'number' || !contribs) return null;
  const parts: string[] = [];
  if (contribs.S1_descPrefix > 0) parts.push(`S1=${contribs.S1_descPrefix}`);
  if (contribs.S2_titlePrefix > 0) parts.push(`S2=${contribs.S2_titlePrefix}`);
  if (contribs.S3_identifier > 0) parts.push(`S3=${contribs.S3_identifier}`);
  if (contribs.S4_jaccard > 0) parts.push(`S4=${contribs.S4_jaccard}`);
  if (contribs.S5_allStructured > 0) parts.push(`S5=${contribs.S5_allStructured}`);
  if (contribs.S6_jerseyNumber > 0) parts.push(`S6=${contribs.S6_jerseyNumber}`);
  if (contribs.S7_substring && contribs.S7_substring > 0) parts.push(`S7=${contribs.S7_substring}`);
  return (
    <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
      {parts.join(' · ')} → <span className="text-amber-300 font-semibold">{score}</span>
    </div>
  );
}

export function AIMatchConfirmModal({ open, matches, onConfirm, onCancel, isApplying = false, onRedoUnchecked, isRedoing = false }: AIMatchConfirmModalProps) {
  const initialChecked = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) set.add(m.listingId);
    return set;
  }, [matches]);
  const [checked, setChecked] = useState<Set<string>>(initialChecked);

  // Re-init when matches change (new run).
  useMemo(() => { setChecked(initialChecked); }, [initialChecked]);

  if (!open) return null;

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const checkAll = () => setChecked(new Set(matches.map(m => m.listingId)));
  const uncheckAll = () => setChecked(new Set());
  const submit = () => {
    const selected = matches.filter(m => checked.has(m.listingId));
    onConfirm(selected);
  };
  const submitAll = () => onConfirm(matches);
  const redo = async () => {
    if (!onRedoUnchecked) return;
    const rejected = matches.filter(m => !checked.has(m.listingId));
    if (rejected.length === 0) return;
    await onRedoUnchecked(rejected);
  };

  const highCount = matches.filter(m => m.confidence === 'high').length;
  const mediumCount = matches.length - highCount;
  const checkedCount = checked.size;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f23] border-2 border-amber-500/40 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-amber-100">Confirm matches</h2>
              <p className="text-xs text-gray-400">
                {matches.length} proposed · {highCount} high confidence · {mediumCount} medium
              </p>
            </div>
          </div>
          <button type="button" onClick={onCancel} disabled={isApplying} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-100 disabled:opacity-50">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-amber-500/20">
          <div className="flex items-center gap-2">
            <button type="button" onClick={checkAll} disabled={isApplying} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-50">Check all</button>
            <button type="button" onClick={uncheckAll} disabled={isApplying} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-50">Uncheck all</button>
          </div>
          <span className="text-xs text-gray-400">{checkedCount} of {matches.length} selected</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {matches.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-8">No matches to review.</div>
          )}
          {matches.map(m => {
            const isChecked = checked.has(m.listingId);
            return (
              <div
                key={m.listingId}
                className={`flex items-start gap-3 px-3 py-2 rounded-lg border ${isChecked ? 'bg-amber-900/15 border-amber-500/30' : 'bg-gray-900/40 border-gray-700/40 opacity-60'}`}
              >
                <button type="button" onClick={() => toggle(m.listingId)} disabled={isApplying} className="mt-0.5 flex-shrink-0">
                  {isChecked ? <CheckSquare className="h-5 w-5 text-amber-400" /> : <Square className="h-5 w-5 text-gray-500" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${SOURCE_BG[m.source]}`}>{SOURCE_LABEL[m.source]}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${m.confidence === 'high' ? 'bg-green-700/40 text-green-100' : 'bg-yellow-700/40 text-yellow-100'}`}>{m.confidence}</span>
                    <span className="text-[10px] text-gray-500 uppercase">{m.platform}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-100 break-words">
                    <span className="text-gray-400">listing:</span> {m.listingTitle.slice(0, 100)}
                  </div>
                  <div className="text-sm text-amber-200 break-words">
                    <span className="text-gray-400">→ item:</span> {m.itemTitle}
                  </div>
                  <ScoreBreakdown score={m.score} contribs={m.contribs} />
                  {m.reasoning && !m.contribs && (
                    <div className="text-xs text-gray-400 mt-0.5 italic">{m.reasoning}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-amber-500/20 p-3 flex items-center justify-between gap-2 flex-wrap">
          <button type="button" onClick={onCancel} disabled={isApplying || isRedoing} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-100 disabled:opacity-50">
            Cancel
          </button>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {onRedoUnchecked && (
              <button
                type="button"
                onClick={redo}
                disabled={isApplying || isRedoing || checkedCount === matches.length || matches.length === 0}
                title="Re-evaluate the unchecked listings, excluding the items currently proposed for them. Won't erase your other matches."
                className="flex items-center gap-2 px-3 py-2 bg-blue-700/30 hover:bg-blue-700/50 border border-blue-500/40 rounded-xl text-blue-100 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-4 w-4 ${isRedoing ? 'animate-spin' : ''}`} />
                {isRedoing ? 'Redoing...' : `Redo ${matches.length - checkedCount} unchecked`}
              </button>
            )}
            <button
              type="button"
              onClick={submitAll}
              disabled={isApplying || isRedoing || matches.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-700/30 hover:bg-emerald-700/50 border border-emerald-500/40 rounded-xl text-emerald-100 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirm all ({matches.length})
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isApplying || isRedoing || checkedCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 rounded-xl text-amber-100 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isApplying ? 'Applying...' : `Confirm ${checkedCount} selected`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
