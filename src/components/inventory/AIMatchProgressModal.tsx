import { useEffect, useState, useRef } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase/client';
import { X as XIcon, Bot, Wrench, Link2, CheckCircle2, AlertCircle, Activity } from 'lucide-react';

export interface AIMatchProgressModalProps {
  runId: string;
  open: boolean;
  onClose: () => void;
}

interface ProgressEvent {
  id: string;
  idx: number;
  type: string;
  summary: string;
  payload?: any;
  ts?: any;
}

interface RunMeta {
  status?: 'running' | 'complete' | 'error';
  startedAt?: any;
  endedAt?: any;
  stats?: {
    itemsConsidered?: number;
    listingsConsidered?: number;
    tier1Bound?: number;
    tier2Bound?: number;
    tier2MediumPending?: number;
    hardRejected?: number;
    unmatched?: number;
    durationMs?: number;
    stopReason?: string;
  };
  summary?: string;
  scope?: 'all' | 'selected';
}

function eventIcon(ev: ProgressEvent) {
  if (ev.type === 'start') return <Activity className="h-4 w-4 text-cyan-400" />;
  if (ev.type === 'finish') return <CheckCircle2 className="h-4 w-4 text-green-400" />;
  if (ev.type === 'iteration_done' || ev.type === 'tier1_done') return <CheckCircle2 className="h-4 w-4 text-purple-400" />;
  if (ev.type === 'error' || ev.type === 'bind_rejected' || ev.type === 'tier2_error') return <AlertCircle className="h-4 w-4 text-red-400" />;
  if (ev.type === 'tier1_bind') return <Link2 className="h-4 w-4 text-emerald-400" />;
  if (ev.type === 'tier2_bind') return <Link2 className="h-4 w-4 text-amber-400" />;
  if (ev.type === 'tier2_medium') return <Link2 className="h-4 w-4 text-yellow-400" />;
  if (ev.type === 'tier2_skip') return <Bot className="h-4 w-4 text-gray-500" />;
  if (ev.type === 'bind') return <Link2 className="h-4 w-4 text-amber-400" />;
  if (ev.type === 'tool_call') return <Wrench className="h-4 w-4 text-blue-400" />;
  return <Bot className="h-4 w-4 text-gray-400" />;
}

function eventBg(ev: ProgressEvent) {
  if (ev.type === 'start') return 'bg-cyan-900/20 border-cyan-500/30';
  if (ev.type === 'finish') return 'bg-green-900/20 border-green-500/30';
  if (ev.type === 'iteration_done' || ev.type === 'tier1_done') return 'bg-purple-900/20 border-purple-500/30';
  if (ev.type === 'error' || ev.type === 'bind_rejected' || ev.type === 'tier2_error') return 'bg-red-900/20 border-red-500/30';
  if (ev.type === 'tier1_bind') return 'bg-emerald-900/20 border-emerald-500/30';
  if (ev.type === 'tier2_bind') return 'bg-amber-900/20 border-amber-500/30';
  if (ev.type === 'tier2_medium') return 'bg-yellow-900/20 border-yellow-500/30';
  if (ev.type === 'tier2_skip') return 'bg-gray-900/30 border-gray-700/30';
  if (ev.type === 'bind') {
    return ev.payload?.confidence === 'medium'
      ? 'bg-yellow-900/20 border-yellow-500/30'
      : 'bg-amber-900/20 border-amber-500/30';
  }
  return 'bg-gray-900/40 border-gray-700/50';
}

export function AIMatchProgressModal({ runId, open, onClose }: AIMatchProgressModalProps) {
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Subscribe to run meta + events while open.
  useEffect(() => {
    if (!open || !runId) return;
    const metaRef = doc(db, 'aiMatchRuns', runId);
    const unsubMeta = onSnapshot(metaRef, snap => {
      if (snap.exists()) setMeta(snap.data() as RunMeta);
    });
    const eventsRef = collection(db, 'aiMatchRuns', runId, 'events');
    const eventsQ = query(eventsRef, orderBy('idx', 'asc'));
    const unsubEvents = onSnapshot(eventsQ, snap => {
      const next: ProgressEvent[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setEvents(next);
    });
    return () => {
      unsubMeta();
      unsubEvents();
    };
  }, [open, runId]);

  // Auto-scroll to bottom on new events unless user scrolled up.
  useEffect(() => {
    if (!scrollRef.current || userScrolledUpRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events.length]);

  if (!open) return null;

  const stats = meta?.stats || {};
  const highBinds = events.filter(e => e.type === 'tier1_bind').length;
  const mediumBinds = events.filter(e => e.type === 'tier2_medium').length;
  const scannedCount = stats.listingsConsidered ?? events.filter(e => e.type === 'start').length;
  const hardRejected = stats.hardRejected ?? 0;
  const unmatchedCount = stats.unmatched ?? 0;

  const statusLabel =
    meta?.status === 'complete' ? 'Complete' :
    meta?.status === 'error' ? 'Failed' :
    'Running…';
  const statusColor =
    meta?.status === 'complete' ? 'text-green-400' :
    meta?.status === 'error' ? 'text-red-400' :
    'text-cyan-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f23] border-2 border-amber-500/40 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-amber-100">Matcher · Live</h2>
              <p className={`text-xs ${statusColor}`}>
                {statusLabel}
                {meta?.scope === 'selected' ? ' · scope: selected items' : meta?.scope === 'all' ? ' · scope: all inventory' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-100"
            title="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Counters strip */}
        <div className="grid grid-cols-5 gap-2 p-3 border-b border-amber-500/20 text-center">
          <div className="bg-gray-900/40 rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Scanned</div>
            <div className="text-xl font-bold text-cyan-300">{scannedCount || '—'}</div>
          </div>
          <div className="bg-gray-900/40 rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Bound (high)</div>
            <div className="text-xl font-bold text-green-400">{highBinds}</div>
          </div>
          <div className="bg-gray-900/40 rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Suggested</div>
            <div className="text-xl font-bold text-yellow-400">{mediumBinds}</div>
          </div>
          <div className="bg-gray-900/40 rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Rejected</div>
            <div className="text-xl font-bold text-red-400">{hardRejected || '—'}</div>
          </div>
          <div className="bg-gray-900/40 rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Unmatched</div>
            <div className="text-xl font-bold text-gray-400">{unmatchedCount || '—'}</div>
          </div>
        </div>

        {/* Live event feed */}
        <div
          ref={scrollRef}
          onScroll={e => {
            const el = e.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
            userScrolledUpRef.current = !atBottom;
          }}
          className="flex-1 overflow-y-auto p-3 space-y-1.5"
        >
          {events.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-8">
              Waiting for the agent to start…
            </div>
          )}
          {events.map(ev => (
            <div
              key={ev.id}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${eventBg(ev)}`}
            >
              <div className="mt-0.5 flex-shrink-0">{eventIcon(ev)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-100 break-words">{ev.summary}</div>
                {(ev.type === 'bind' || ev.type === 'bind_rejected') && ev.payload?.reasoning && (
                  <div className="text-xs text-gray-400 mt-0.5 italic">→ {ev.payload.reasoning}</div>
                )}
                {ev.type === 'finish' && meta?.summary && (
                  <div className="text-xs text-gray-300 mt-0.5">{meta.summary}</div>
                )}
              </div>
              <div className="text-[10px] text-gray-500 flex-shrink-0">#{ev.idx}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {meta?.status === 'complete' && stats && (
          <div className="border-t border-amber-500/20 p-3 text-xs text-gray-400 flex items-center justify-between">
            <div>
              {stats.durationMs ? `${(stats.durationMs / 1000).toFixed(1)}s` : ''}
              {typeof stats.tier1Bound === 'number' ? ` · ${stats.tier1Bound} bound · ${stats.tier2MediumPending || 0} suggested · ${stats.unmatched || 0} unmatched` : ''}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded-lg text-amber-100 text-sm"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
