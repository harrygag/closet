/**
 * App → Chrome-extension bridge for Facebook Marketplace listing actions.
 *
 * Mirrors `depopActions.ts` / `poshmarkActions.ts`. The delete macro lives in
 * the extension at `_facebookDeleteInPage` (drives the recorded seller-hub
 * flow: ... menu → Delete listing → confirm → "I'd rather not" → Next).
 * Listing-exists check is NOT implemented for Facebook yet — the seller hub
 * doesn't expose a per-item manage URL, so we always treat the listing as
 * "live" (the walk will attempt delete; success/failure is the source of truth).
 */

export class ExtensionUnavailableError extends Error {
  constructor(msg = 'Extension not connected. In chrome://extensions reload the extension (v2.44+), then hard-refresh this page and retry.') {
    super(msg);
    this.name = 'ExtensionUnavailableError';
  }
}

function sendToExtension<T>(message: Record<string, unknown>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const extensionId = localStorage.getItem('extension_id');
    const runtime = (window as any).chrome?.runtime;
    if (!extensionId || !runtime?.sendMessage) {
      reject(new ExtensionUnavailableError());
      return;
    }
    const timer = setTimeout(
      () => reject(new Error('Extension timed out — is the Facebook tab/session active?')),
      timeoutMs,
    );
    try {
      runtime.sendMessage(extensionId, message, (response: any) => {
        clearTimeout(timer);
        const err = runtime.lastError;
        if (err) return reject(new Error(err.message || 'Extension messaging error'));
        if (!response) return reject(new Error('No response from extension (reload it after updating).'));
        if (response.error) return reject(new Error(response.error));
        resolve(response as T);
      });
    } catch (e: any) {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * Liveness check is not implemented for Facebook — FB's seller hub doesn't
 * have a per-item manage URL like Depop's `/products/{slug}/manage/`. The walk
 * assumes the listing exists and lets `deleteFacebookListing` be the source of
 * truth: a successful delete confirms it WAS live; a "card not found on seller
 * hub" error confirms it was already gone.
 */
export async function checkFacebookListing(_listingId: string): Promise<{ exists: boolean }> {
  return { exists: true };
}

/**
 * Delete a Facebook Marketplace listing via the seller hub macro
 * (`_facebookDeleteInPage` in background.js). 5-click flow: ... menu →
 * Delete listing → confirm → "I'd rather not" survey skip → Next.
 */
export async function deleteFacebookListing(listingId: string): Promise<{ success: boolean; error?: string }> {
  const r = await sendToExtension<{ success: boolean; error?: string }>(
    { action: 'deleteFacebookListing', listingId: String(listingId) },
    90000,
  );
  return { success: !!r.success, error: r.error };
}

export function extensionConnected(): boolean {
  return !!localStorage.getItem('extension_id') && !!(window as any).chrome?.runtime?.sendMessage;
}
