/**
 * Cross-platform conversation types. The extension scrapes each platform's
 * inbox (Poshmark conversations, Depop DMs, FB Marketplace messages, eBay
 * messages) and writes thread heads + per-thread messages to Firestore.
 *
 * Path scheme:
 *   messageThreads/{threadDocId}            — one row per (userId, platform, threadId)
 *   messageThreads/{threadDocId}/messages/{messageId}
 */

import type { SaleSnapshotPlatform } from './saleSnapshot';

export type MessagePlatform = Exclude<SaleSnapshotPlatform, 'ebay'> | 'ebay';

export interface MessageThread {
  id: string;
  userId: string;
  platform: MessagePlatform;
  /** Platform-side thread/conversation id. */
  threadId: string;
  otherPartyHandle: string;
  otherPartyAvatar?: string;
  /** Listing id the conversation is about, if discoverable from the scrape. */
  listingId?: string;
  /** Local Item id this thread links to (best-effort match via listingId). */
  itemId?: string;
  /** ISO timestamp of the most recent message in the thread. */
  lastMessageAt: string;
  lastMessageSnippet: string;
  unreadCount: number;
  archivedAt?: string;
  firstSeenAt: string;
}

export interface MessageEntry {
  id: string;
  threadId: string;
  fromMe: boolean;
  text: string;
  attachments?: string[];
  sentAt: string;
}

export function threadDocId(userId: string, platform: MessagePlatform, threadId: string): string {
  return `${userId}:${platform}:${threadId}`;
}
