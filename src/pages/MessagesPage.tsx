/**
 * Unified Messages page — cross-platform buyer/seller conversations.
 *
 * v0: read-only thread list + selected-thread reader, sourced from the
 * `messageThreads/` collection the extension content scripts will populate
 * (Facebook first, paired with the new /facebook page; Poshmark + Depop in a
 * later pass). Replies open the platform's UI in a new tab — sending DMs from
 * here is deferred.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, ShoppingBag, MessagesSquare, Search, ExternalLink } from 'lucide-react';
import { collection, onSnapshot, query, where, orderBy, doc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase/client';
import { useAuthStore } from '../store/useAuthStore';
import type { MessageThread, MessageEntry, MessagePlatform } from '../types/messages';

const PLATFORM_LABEL: Record<MessagePlatform, string> = {
  ebay: 'eBay',
  poshmark: 'Poshmark',
  depop: 'Depop',
  facebook: 'Facebook',
  whatnot: 'Whatnot',
};

const PLATFORM_COLOR: Record<MessagePlatform, string> = {
  ebay: 'text-blue-400',
  poshmark: 'text-purple-400',
  depop: 'text-red-400',
  facebook: 'text-sky-400',
  whatnot: 'text-yellow-400',
};

type Filter = 'all' | MessagePlatform;

export function MessagesPage() {
  const { user } = useAuthStore();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Subscribe to the user's threads (newest first by lastMessageAt).
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    // Query userId only and sort client-side to avoid a composite-index requirement.
    const q = query(collection(db, 'messageThreads'), where('userId', '==', user.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as MessageThread))
          .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
        setThreads(rows);
        setLoading(false);
      },
      (err) => {
        console.warn('[MessagesPage] subscription error', err);
        setLoading(false);
      },
    );
    return () => unsub();
    // intentionally exclude orderBy import from deps
  }, [user]);

  // Suppress unused-import warnings for symbols kept for the next-pass write path.
  void orderBy; void doc; void getDocs;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (filter !== 'all' && t.platform !== filter) return false;
      if (!q) return true;
      return (
        t.otherPartyHandle?.toLowerCase().includes(q) ||
        t.lastMessageSnippet?.toLowerCase().includes(q)
      );
    });
  }, [threads, filter, search]);

  const selected = useMemo(() => threads.find((t) => t.id === selectedId) || null, [threads, selectedId]);

  // Load the selected thread's messages.
  useEffect(() => {
    if (!user || !selected) { setMessages([]); return; }
    setLoadingMessages(true);
    const q = query(collection(db, 'messageThreads', selected.id, 'messages'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as MessageEntry))
          .sort((a, b) => (a.sentAt || '').localeCompare(b.sentAt || ''));
        setMessages(rows);
        setLoadingMessages(false);
      },
      () => setLoadingMessages(false),
    );
    return () => unsub();
  }, [user, selected]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
              <MessagesSquare className="h-8 w-8 text-cyan-400" />
              Messages
            </h1>
            <p className="text-gray-400 text-sm">
              Unified buyer/seller conversations across eBay, Poshmark, Depop, and Facebook Marketplace.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4 min-h-[70vh]">
          {/* LEFT — thread list */}
          <div className="col-span-12 md:col-span-5 lg:col-span-4 bg-gray-900/60 border border-gray-700/50 rounded-2xl p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-4 w-4 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by handle or message…"
                className="flex-1 bg-gray-800/40 border border-gray-700/60 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500/60"
              />
            </div>
            <div className="flex items-center gap-1 mb-3 flex-wrap">
              {(['all', 'facebook', 'poshmark', 'depop', 'ebay'] as Filter[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFilter(p)}
                  className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                    filter === p
                      ? 'border-cyan-500/60 bg-cyan-900/30 text-cyan-100'
                      : 'border-gray-700/60 bg-gray-800/40 text-gray-400 hover:text-gray-100 hover:border-gray-500/60'
                  }`}
                >
                  {p === 'all' ? 'All' : PLATFORM_LABEL[p]}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 pr-1">
              {loading ? (
                <div className="text-gray-500 text-sm p-3">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-gray-500 text-sm py-12 px-3 text-center">
                  <Mail className="h-10 w-10 mb-3 opacity-40" />
                  <div className="font-medium text-gray-300 mb-1">No conversations yet</div>
                  <p>
                    The extension will write threads here once the per-platform inbox scrape is wired
                    (Facebook is first, paired with the new /facebook page).
                  </p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {filtered.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                          selectedId === t.id
                            ? 'border-cyan-500/60 bg-cyan-900/20'
                            : 'border-gray-700/40 bg-gray-800/40 hover:bg-gray-800/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <ShoppingBag className={`h-3.5 w-3.5 ${PLATFORM_COLOR[t.platform]} flex-shrink-0`} />
                            <span className="text-sm text-gray-100 truncate">{t.otherPartyHandle || '(unknown)'}</span>
                          </div>
                          {t.unreadCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/30 text-cyan-100 font-bold flex-shrink-0">
                              {t.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5 truncate">{t.lastMessageSnippet || '—'}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* RIGHT — selected thread reader */}
          <div className="col-span-12 md:col-span-7 lg:col-span-8 bg-gray-900/60 border border-gray-700/50 rounded-2xl p-4 flex flex-col">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm text-center">
                <MessagesSquare className="h-12 w-12 mb-3 opacity-40" />
                <div className="font-medium text-gray-300">Select a conversation</div>
                <p>Threads from each platform will show up on the left.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-700/40">
                  <div>
                    <div className="text-sm text-gray-100 font-semibold flex items-center gap-2">
                      <ShoppingBag className={`h-4 w-4 ${PLATFORM_COLOR[selected.platform]}`} />
                      {selected.otherPartyHandle}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {PLATFORM_LABEL[selected.platform]}
                      {selected.listingId ? ` · listing ${selected.listingId}` : ''}
                    </div>
                  </div>
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    title="Replying from the app is deferred — open the conversation on the platform"
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-100 px-2 py-1 rounded border border-gray-700/60 hover:border-gray-500/60"
                  >
                    Open in {PLATFORM_LABEL[selected.platform]}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loadingMessages ? (
                    <div className="text-gray-500 text-sm">Loading messages…</div>
                  ) : messages.length === 0 ? (
                    <div className="text-gray-500 text-sm">No messages in this thread yet.</div>
                  ) : (
                    <ul className="space-y-2">
                      {messages.map((m) => (
                        <motion.li
                          key={m.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            m.fromMe
                              ? 'ml-auto bg-cyan-900/30 border border-cyan-500/40 text-cyan-50'
                              : 'mr-auto bg-gray-800/60 border border-gray-700/50 text-gray-100'
                          }`}
                        >
                          {m.text}
                          <div className="text-[10px] text-gray-500 mt-1">{m.sentAt}</div>
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
