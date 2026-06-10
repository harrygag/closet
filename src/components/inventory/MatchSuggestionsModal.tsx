import React, { useState } from 'react';
import { Check, X, SkipForward } from 'lucide-react';

export interface MatchSuggestion {
  id: string; // unique key for the suggestion (listingId)
  platform: 'poshmark' | 'depop';
  listingId: string;
  listingTitle: string;
  ebayItemId: string;
  ebayItemTitle: string;
  score: number; // 0..1
}

interface MatchSuggestionsModalProps {
  open: boolean;
  suggestions: MatchSuggestion[];
  onAccept: (s: MatchSuggestion) => Promise<void> | void;
  onReject: (s: MatchSuggestion) => void;
  onSkip: (s: MatchSuggestion) => void;
  onClose: () => void;
}

const truncate = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + '…' : s;

export const MatchSuggestionsModal: React.FC<MatchSuggestionsModalProps> = ({
  open,
  suggestions,
  onAccept,
  onReject,
  onSkip,
  onClose,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!open) return null;

  const handleAccept = async (s: MatchSuggestion) => {
    setBusyId(s.id);
    try {
      await onAccept(s);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-xl border border-purple-500/40 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div>
            <h3 className="text-xl font-bold text-white tracking-wide">
              Match Suggestions
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {suggestions.length} pair{suggestions.length === 1 ? '' : 's'} need a quick yes/no
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {suggestions.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              All caught up.
            </div>
          ) : (
            suggestions.map((s) => {
              const pct = Math.round(s.score * 100);
              const isBusy = busyId === s.id;
              return (
                <div
                  key={s.id}
                  className="bg-gray-800/70 border border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                        s.platform === 'poshmark'
                          ? 'bg-pink-500/20 text-pink-300'
                          : 'bg-orange-500/20 text-orange-300'
                      }`}
                    >
                      {s.platform}
                    </span>
                    <span className="text-xs text-purple-300 font-mono">
                      {pct}% match
                    </span>
                  </div>
                  <div className="text-sm text-white font-medium mb-1">
                    {truncate(s.listingTitle, 80)}
                  </div>
                  <div className="text-xs text-gray-400 mb-3">
                    → suggests eBay item:{' '}
                    <span className="text-gray-200">
                      {truncate(s.ebayItemTitle, 80)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(s)}
                      disabled={isBusy}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Accept
                    </button>
                    <button
                      onClick={() => onReject(s)}
                      disabled={isBusy}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => onSkip(s)}
                      disabled={isBusy}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
                    >
                      <SkipForward className="w-4 h-4" />
                      Skip
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
