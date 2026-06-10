/**
 * App → Chrome-extension bridge for Depop listing actions.
 *
 * Depop's product/manage pages can only be driven from a logged-in browser
 * session — the server side is 403'd and stores no session cookies. The
 * extension (externally_connectable from this app) is the only place with that
 * session, so the real "is it still up?" check and the "/manage/ delete" macro
 * run there. These helpers wrap `chrome.runtime.sendMessage(extensionId, …)`
 * (same channel StatsDashboard already uses) as awaitable promises.
 *
 * The extension key in localStorage is `extension_id` (set when the user
 * connects the extension on the Marketplaces page).
 */

export class ExtensionUnavailableError extends Error {
  constructor(msg = 'Depop extension not connected. In chrome://extensions reload the Depop extension (v2.14+), then hard-refresh this page and retry.') {
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
      () => reject(new Error('Extension timed out — is the Depop tab/session active?')),
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

/** Is the Depop listing still live? Drives a logged-in tab to /products/{slug}/manage/. */
export async function checkDepopListing(slug: string): Promise<{ exists: boolean }> {
  const r = await sendToExtension<{ exists: boolean }>(
    { action: 'checkDepopListing', slug: String(slug) },
    45000,
  );
  return { exists: !!r.exists };
}

/** Delete the Depop listing via the /manage/ → Delete → confirm macro. */
export async function deleteDepopListing(slug: string): Promise<{ success: boolean }> {
  const r = await sendToExtension<{ success: boolean }>(
    { action: 'deleteDepopListing', slug: String(slug) },
    60000,
  );
  return { success: !!r.success };
}

export function extensionConnected(): boolean {
  return !!localStorage.getItem('extension_id') && !!(window as any).chrome?.runtime?.sendMessage;
}
