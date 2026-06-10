/**
 * OpenClaw Integration Service
 * Connects to the local OpenClaw gateway (localhost:18789) for:
 *  - Marketplace scraping (depop-sync, poshmark-sync skills)
 *  - AI chat with Clawd Bot via the OpenAI-compatible /v1/chat/completions endpoint
 *
 * Gateway token is stored in .env.local as VITE_OPENCLAW_TOKEN
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase/client';

export const OPENCLAW_URL = 'http://localhost:18789';

// Token from .env.local — set VITE_OPENCLAW_TOKEN=<your gateway token>
const OPENCLAW_TOKEN = import.meta.env.VITE_OPENCLAW_TOKEN as string | undefined;

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OPENCLAW_TOKEN) {
    headers['Authorization'] = `Bearer ${OPENCLAW_TOKEN}`;
  }
  return headers;
}

export type OpenClawPlatform = 'depop' | 'poshmark';

export interface OpenClawSyncResult {
  count: number;
  platform: OpenClawPlatform;
  username: string;
}

/** Check if OpenClaw gateway is running */
export async function isOpenClawRunning(): Promise<boolean> {
  try {
    // The gateway serves the control UI at root — a 200 or 401 both mean it's up
    const res = await fetch(`${OPENCLAW_URL}/`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Use an OpenClaw skill to extract listings from Depop or Poshmark,
 * then save the results to Firestore via an authenticated Cloud Function.
 */
export async function syncMarketplace(
  platform: OpenClawPlatform,
  username: string
): Promise<OpenClawSyncResult> {
  const skillName = platform === 'depop' ? 'depop-sync' : 'poshmark-sync';

  // 1. Send the request to Clawd Bot via the chat completions endpoint.
  //    The skill instructions live in ~/.openclaw/agents/main/skills/<skillName>/SKILL.md
  //    and OpenClaw will invoke them when we ask it to run the skill.
  const prompt = `Run the ${skillName} skill for username: ${username}. Return only the JSON array of listings.`;

  let chatResponse: Response;
  try {
    chatResponse = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        model: 'openclaw:main',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000), // 2 min — scraping takes time
    });
  } catch {
    throw new Error(
      'OpenClaw is not reachable. Make sure it is running on localhost:18789.\n' +
        'See OPENCLAW_SETUP.md for installation instructions.',
    );
  }

  if (!chatResponse.ok) {
    const text = await chatResponse.text().catch(() => '');
    throw new Error(`OpenClaw returned an error: ${chatResponse.status} ${text}`);
  }

  const chatData = await chatResponse.json();
  const rawContent: string = chatData?.choices?.[0]?.message?.content ?? '[]';

  // Parse the JSON array from the response
  let listings: unknown[] = [];
  try {
    const match = rawContent.match(/\[[\s\S]*\]/);
    listings = match ? JSON.parse(match[0]) : [];
  } catch {
    console.warn('[openclawService] Could not parse listings JSON from response:', rawContent);
  }

  // 2. Save listings to Firestore via authenticated Cloud Function
  const functions = getFunctions(app);
  const saveSync = httpsCallable<
    { platform: string; username: string; listings: unknown[] },
    { success: boolean; count: number }
  >(functions, 'saveMarketplaceSync');

  const result = await saveSync({ platform, username, listings });

  return {
    count: result.data.count,
    platform,
    username,
  };
}

// ─── Clawd Bot Chat ────────────────────────────────────────────────────────────

export interface ClawdMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClawdChatResponse {
  message: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Chat with Clawd Bot (the local AI assistant) directly from the control panel.
 * Uses the OpenAI-compatible /v1/chat/completions endpoint with the main agent session.
 *
 * @param messages - Full conversation history (role + content)
 * @param sessionKey - Optional stable session key for persistent context (e.g. user UID)
 */
export async function chatWithClawd(
  messages: ClawdMessage[],
  sessionKey?: string,
): Promise<ClawdChatResponse> {
  if (!OPENCLAW_TOKEN) {
    throw new Error(
      'VITE_OPENCLAW_TOKEN is not set. Add it to .env.local to connect to Clawd Bot.',
    );
  }

  const body: Record<string, unknown> = {
    model: 'openclaw:main',
    messages,
    stream: false,
  };

  // Pass a stable user key so the gateway routes to the same session
  if (sessionKey) {
    body.user = sessionKey;
  }

  const res = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Clawd Bot error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    message: data?.choices?.[0]?.message?.content ?? '',
    usage: data?.usage,
  };
}
