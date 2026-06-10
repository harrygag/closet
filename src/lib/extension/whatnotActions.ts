/**
 * App → Chrome-extension bridge for Whatnot listing actions.
 *
 * Mirrors `facebookActions.ts`. Whatnot is a live-selling platform; the
 * content-script scrape + delete macro is pending a recording, so the
 * liveness check currently always reports "live" and delete posts an action
 * the extension will handle once `_whatnotDeleteInPage` is wired.
 */

export class ExtensionUnavailableError extends Error {
  constructor(msg = 'Extension not connected. In chrome://extensions reload the extension, then hard-refresh this page and retry.') {
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
      () => reject(new Error('Extension timed out — is the Whatnot tab/session active?')),
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
 * Liveness check is not implemented for Whatnot yet (content script pending).
 * Treat the listing as live; delete is the source of truth.
 */
export async function checkWhatnotListing(_listingId: string): Promise<{ exists: boolean }> {
  return { exists: true };
}

/**
 * Delete a Whatnot listing via the extension macro (`_whatnotDeleteInPage`,
 * pending a recording).
 */
export async function deleteWhatnotListing(listingId: string): Promise<{ success: boolean; error?: string }> {
  const r = await sendToExtension<{ success: boolean; error?: string }>(
    { action: 'deleteWhatnotListing', listingId: String(listingId) },
    90000,
  );
  return { success: !!r.success, error: r.error };
}

export function extensionConnected(): boolean {
  return !!localStorage.getItem('extension_id') && !!(window as any).chrome?.runtime?.sendMessage;
}
