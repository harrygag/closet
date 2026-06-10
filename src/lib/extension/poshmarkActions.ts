/**
 * App → Chrome-extension bridge for Poshmark listing actions.
 *
 * Mirrors `depopActions.ts`. Poshmark's edit/delete UI is owner-only and can
 * only be driven from a logged-in browser session — the server side can't.
 * The extension (externally_connectable from this app) drives a throwaway
 * logged-in tab through the recorded flow: open `/edit-listing/{id}` → click
 * "Delete Listing" → confirm "Yes". These helpers wrap
 * `chrome.runtime.sendMessage(extensionId, …)` as awaitable promises.
 *
 * The extension id lives in localStorage as `extension_id` (set when the user
 * connects the extension on the Marketplaces page) — same key depopActions uses.
 */

export class ExtensionUnavailableError extends Error {
  constructor(msg = 'Extension not connected. In chrome://extensions reload the extension (v2.19+), then hard-refresh this page and retry.') {
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
      () => reject(new Error('Extension timed out — is the Poshmark tab/session active?')),
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

/** Is the Poshmark listing still live? Drives a logged-in tab to /edit-listing/{id}. */
export async function checkPoshmarkListing(listingId: string): Promise<{ exists: boolean }> {
  const r = await sendToExtension<{ exists: boolean }>(
    { action: 'checkPoshmarkListing', listingId: String(listingId) },
    45000,
  );
  return { exists: !!r.exists };
}

/**
 * Delete the Poshmark listing via the /edit-listing → Delete Listing → Yes macro.
 *
 * `blockedByMultistock: true` means Poshmark refused the delete because the
 * listing is a multistock SKU with at least one unit already sold — the caller
 * should fall back to {@link setPoshmarkListingQuantityZero} so the listing
 * still exits the delist queue without leaving stock buyable.
 */
export async function deletePoshmarkListing(
  listingId: string,
): Promise<{ success: boolean; blockedByMultistock?: boolean; error?: string }> {
  const r = await sendToExtension<{ success: boolean; blockedByMultistock?: boolean; error?: string }>(
    { action: 'deletePoshmarkListing', listingId: String(listingId) },
    60000,
  );
  return {
    success: !!r.success,
    blockedByMultistock: !!r.blockedByMultistock,
    error: r.error,
  };
}

/**
 * Fallback used when {@link deletePoshmarkListing} returns
 * `blockedByMultistock: true` (Poshmark won't let you delete a multistock SKU
 * that already has sold units). Drives the recorded edit-listing flow to set
 * the visible quantity to 0 and confirm via the "List This Item" modal.
 */
export async function setPoshmarkListingQuantityZero(
  listingId: string,
): Promise<{ success: boolean; error?: string }> {
  const r = await sendToExtension<{ success: boolean; error?: string }>(
    { action: 'setPoshmarkQuantityZero', listingId: String(listingId) },
    90000,
  );
  return { success: !!r.success, error: r.error };
}

export function extensionConnected(): boolean {
  return !!localStorage.getItem('extension_id') && !!(window as any).chrome?.runtime?.sendMessage;
}
