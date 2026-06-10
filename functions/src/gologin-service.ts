/**
 * GoLogin AI Browser Automation Service
 *
 * Manages GoLogin anti-detect browser profiles and provides an AI-powered
 * browser agent for automating Depop and Poshmark actions (delist, mark sold,
 * sync inventory). GoLogin handles fingerprinting, proxies, and reCAPTCHA.
 * The AI (Claude via @anthropic-ai/sdk) reads the page and decides what to
 * click/type.
 *
 * Note: admin.initializeApp() is called in index.ts — do not call it here.
 */

import * as functions from 'firebase-functions';
import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// GoLogin SDK + REST API configuration
// ---------------------------------------------------------------------------

const GOLOGIN_API = 'https://api.gologin.com';
const GOLOGIN_TOKEN = process.env.GOLOGIN_API_TOKEN || '';

function gologinHeaders(): Record<string, string> {
  if (!GOLOGIN_TOKEN) {
    throw new Error('GoLogin API token not configured. Set GOLOGIN_API_TOKEN env var.');
  }
  return {
    Authorization: `Bearer ${GOLOGIN_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoLoginProfile {
  id: string;
  name: string;
  os: string;
  [key: string]: unknown;
}

export interface GoLoginStartResult {
  wsUrl: string;
  port: number;
  [key: string]: unknown;
}

export interface BrowserAgentTask {
  action: 'DELIST' | 'MARK_SOLD' | 'GET_LISTINGS' | 'LIST_ITEM';
  platform: 'depop' | 'poshmark';
  profileId: string;
  itemData?: {
    title: string;
    sku: string;
    url?: string;
    price?: number;
  };
}

export interface BrowserAgentResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// GoLogin REST API wrapper
// ---------------------------------------------------------------------------

/**
 * List all GoLogin browser profiles.
 */
export async function listProfiles(): Promise<GoLoginProfile[]> {
  const res = await fetch(`${GOLOGIN_API}/browser/v2`, {
    method: 'GET',
    headers: gologinHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GoLogin listProfiles failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { profiles?: GoLoginProfile[] };
  return json.profiles ?? (json as unknown as GoLoginProfile[]);
}

/**
 * Create a new GoLogin browser profile with anti-detect settings.
 * Uses REST API with required navigator + proxy fields.
 */
export async function createProfile(
  name: string,
  os: string,
  proxy?: { mode: string; host?: string; port?: number; username?: string; password?: string }
): Promise<GoLoginProfile> {
  const payload = {
    name,
    os,
    browserType: 'chrome',
    navigator: {
      language: 'en-US,en',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      resolution: '1920x1080',
      platform: os === 'mac' ? 'MacIntel' : 'Win32',
    },
    proxy: proxy || { mode: 'none' },
  };

  const res = await fetch(`${GOLOGIN_API}/browser`, {
    method: 'POST',
    headers: gologinHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GoLogin createProfile failed (${res.status}): ${body}`);
  }

  const profile = (await res.json()) as GoLoginProfile;
  functions.logger.info(`[GoLogin] Created profile ${profile.id} — ${name}`);
  return profile;
}

/**
 * Start a GoLogin profile in the cloud and return the WebSocket URL.
 */
export async function startProfile(
  profileId: string
): Promise<GoLoginStartResult> {
  const res = await fetch(`${GOLOGIN_API}/browser/${profileId}/web`, {
    method: 'POST',
    headers: gologinHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GoLogin startProfile failed for ${profileId} (${res.status}): ${body}`
    );
  }

  return (await res.json()) as GoLoginStartResult;
}

/**
 * Stop a running GoLogin cloud profile.
 * Uses DELETE /browser/{id}/web per GoLogin API docs for cloud profiles.
 */
export async function stopProfile(profileId: string): Promise<void> {
  const res = await fetch(`${GOLOGIN_API}/browser/${profileId}/web`, {
    method: 'DELETE',
    headers: gologinHeaders(),
  });

  // 204 No Content is the expected success response
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    throw new Error(
      `GoLogin stopProfile failed for ${profileId} (${res.status}): ${body}`
    );
  }
}

/**
 * Delete a GoLogin profile.
 */
export async function deleteProfile(profileId: string): Promise<void> {
  const res = await fetch(`${GOLOGIN_API}/browser/${profileId}`, {
    method: 'DELETE',
    headers: gologinHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GoLogin deleteProfile failed for ${profileId} (${res.status}): ${body}`
    );
  }
}

/**
 * Get a GoLogin profile by ID. Returns full profile info.
 */
export async function getProfile(profileId: string): Promise<GoLoginProfile> {
  const res = await fetch(`${GOLOGIN_API}/browser/${profileId}`, {
    method: 'GET',
    headers: gologinHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GoLogin getProfile failed for ${profileId} (${res.status}): ${body}`
    );
  }

  return (await res.json()) as GoLoginProfile;
}

/**
 * Update a GoLogin profile with partial parameters.
 * Uses PUT /browser/{id}/custom per GoLogin API docs.
 */
export async function updateProfile(
  profileId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${GOLOGIN_API}/browser/${profileId}/custom`, {
    method: 'PUT',
    headers: gologinHeaders(),
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GoLogin updateProfile failed for ${profileId} (${res.status}): ${body}`
    );
  }
}

// ---------------------------------------------------------------------------
// Anthropic client (lazy, same pattern as ai-assistant.ts)
// ---------------------------------------------------------------------------

const getAnthropicClient = (): Anthropic => {
  const apiKey =
    process.env.ANTHROPIC_API_KEY || functions.config().anthropic?.api_key;
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }
  return new Anthropic({ apiKey });
};

// ---------------------------------------------------------------------------
// Platform URL helpers
// ---------------------------------------------------------------------------

function platformBaseUrl(platform: 'depop' | 'poshmark'): string {
  switch (platform) {
    case 'depop':
      return 'https://www.depop.com';
    case 'poshmark':
      return 'https://poshmark.com';
  }
}

// ---------------------------------------------------------------------------
// AI prompt builders — one per action
// ---------------------------------------------------------------------------

function buildAgentPrompt(task: BrowserAgentTask): string {
  const base = platformBaseUrl(task.platform);
  const platformName = task.platform === 'depop' ? 'Depop' : 'Poshmark';

  switch (task.action) {
    case 'DELIST':
      return [
        `You are controlling a browser on ${platformName} (${base}).`,
        `Your goal: DELIST (remove/delete) the listing at URL: ${task.itemData?.url ?? 'UNKNOWN'}.`,
        `Item title: "${task.itemData?.title ?? ''}", SKU: "${task.itemData?.sku ?? ''}".`,
        '',
        'Steps:',
        `1. Navigate to the listing URL.`,
        `2. Find the option to delete / remove / delist the item.`,
        `3. Confirm the deletion if prompted.`,
        `4. Verify the listing is no longer active.`,
        '',
        'Report back with { "success": true/false, "message": "..." }.',
      ].join('\n');

    case 'MARK_SOLD':
      return [
        `You are controlling a browser on ${platformName} (${base}).`,
        `Your goal: MARK AS SOLD the listing at URL: ${task.itemData?.url ?? 'UNKNOWN'}.`,
        `Item title: "${task.itemData?.title ?? ''}", SKU: "${task.itemData?.sku ?? ''}".`,
        '',
        'Steps:',
        `1. Navigate to the listing URL.`,
        `2. Find the option to mark the item as sold.`,
        `3. Confirm if prompted.`,
        `4. Verify the listing now shows as sold.`,
        '',
        'Report back with { "success": true/false, "message": "..." }.',
      ].join('\n');

    case 'GET_LISTINGS':
      return [
        `You are controlling a browser on ${platformName} (${base}).`,
        `Your goal: Retrieve ALL active listings from the seller's closet/shop.`,
        '',
        'Steps:',
        `1. Navigate to the seller's listing/closet page.`,
        `2. Scroll through and collect every listing's title, price, URL, and status.`,
        `3. Handle pagination if needed.`,
        '',
        'Return the listings as a JSON array: [{ "title": "...", "price": ..., "url": "...", "status": "active" }, ...]',
      ].join('\n');

    case 'LIST_ITEM':
      return [
        `You are controlling a browser on ${platformName} (${base}).`,
        `Your goal: CREATE A NEW LISTING for the following item:`,
        `  Title: "${task.itemData?.title ?? ''}"`,
        `  SKU: "${task.itemData?.sku ?? ''}"`,
        `  Price: ${task.itemData?.price ?? 'NOT SET'}`,
        '',
        'Steps:',
        `1. Navigate to the "Sell" / "List an item" page.`,
        `2. Fill in the item details.`,
        `3. Submit the listing.`,
        `4. Verify the listing is live.`,
        '',
        'Report back with { "success": true/false, "message": "...", "listingUrl": "..." }.',
      ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// AI Browser Agent
// ---------------------------------------------------------------------------

/**
 * Run the AI browser agent for a given task.
 *
 * Flow:
 * 1. Start GoLogin profile (gets WebSocket URL for the cloud browser)
 * 2. Build an action-specific prompt for Claude
 * 3. Send the prompt to Claude (the actual browser control bridge will be
 *    wired in once GoLogin profiles are provisioned — for now the AI returns
 *    a structured plan of what it *would* do)
 * 4. Stop the GoLogin profile
 * 5. Return success / failure with details
 */
export async function runBrowserAgent(
  task: BrowserAgentTask
): Promise<BrowserAgentResult> {
  let profileStarted = false;

  try {
    // 1. Start GoLogin profile
    functions.logger.info(
      `[GoLogin] Starting profile ${task.profileId} for ${task.action} on ${task.platform}`
    );
    const startResult = await startProfile(task.profileId);
    profileStarted = true;

    functions.logger.info(
      `[GoLogin] Profile ${task.profileId} running — wsUrl: ${startResult.wsUrl}, port: ${startResult.port}`
    );

    // 2. Build the prompt
    const agentPrompt = buildAgentPrompt(task);

    // 3. Send to Claude
    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: [
        'You are an AI browser automation agent.',
        'You are connected to an anti-detect browser via GoLogin.',
        `WebSocket URL: ${startResult.wsUrl}`,
        `Port: ${startResult.port}`,
        '',
        'For now, describe what actions you WOULD take step-by-step.',
        'Return your answer as valid JSON matching: { "success": boolean, "message": string, "steps": string[], "data"?: any }',
      ].join('\n'),
      messages: [{ role: 'user', content: agentPrompt }],
    });

    // Extract text content from the response
    const textBlock = response.content.find((block) => block.type === 'text');
    const rawText = textBlock ? textBlock.text : '';

    // Try to parse structured JSON from the AI response
    let parsed: { success?: boolean; message?: string; data?: unknown } = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // AI returned prose instead of JSON — wrap it
      parsed = { success: true, message: rawText };
    }

    functions.logger.info(
      `[GoLogin] Agent completed ${task.action} on ${task.platform}: ${parsed.message ?? 'no message'}`
    );

    return {
      success: parsed.success ?? true,
      message: parsed.message ?? 'Agent task completed',
      data: parsed.data,
    };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown error during browser agent execution';
    functions.logger.error(`[GoLogin] Agent error: ${errorMessage}`);

    return {
      success: false,
      message: errorMessage,
    };
  } finally {
    // 4. Always stop the profile, even on error
    if (profileStarted) {
      try {
        await stopProfile(task.profileId);
        functions.logger.info(
          `[GoLogin] Profile ${task.profileId} stopped`
        );
      } catch (stopErr: unknown) {
        const stopMsg =
          stopErr instanceof Error ? stopErr.message : 'Unknown error stopping profile';
        functions.logger.error(
          `[GoLogin] Failed to stop profile ${task.profileId}: ${stopMsg}`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience helpers — ready to be called from index.ts Cloud Functions
// ---------------------------------------------------------------------------

/**
 * Delist (remove) a listing from Depop or Poshmark.
 */
export async function delistFromPlatform(
  platform: 'depop' | 'poshmark',
  itemUrl: string,
  profileId: string
): Promise<boolean> {
  const result = await runBrowserAgent({
    action: 'DELIST',
    platform,
    profileId,
    itemData: { title: '', sku: '', url: itemUrl },
  });
  return result.success;
}

/**
 * Retrieve all active listings from a seller's Depop or Poshmark shop.
 */
export async function getListingsFromPlatform(
  platform: 'depop' | 'poshmark',
  profileId: string
): Promise<unknown[]> {
  const result = await runBrowserAgent({
    action: 'GET_LISTINGS',
    platform,
    profileId,
  });

  if (result.success && Array.isArray(result.data)) {
    return result.data;
  }
  return [];
}

/**
 * Mark a listing as sold on Depop or Poshmark.
 */
export async function markSoldOnPlatform(
  platform: 'depop' | 'poshmark',
  itemUrl: string,
  profileId: string
): Promise<boolean> {
  const result = await runBrowserAgent({
    action: 'MARK_SOLD',
    platform,
    profileId,
    itemData: { title: '', sku: '', url: itemUrl },
  });
  return result.success;
}
