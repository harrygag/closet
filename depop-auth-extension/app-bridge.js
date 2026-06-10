/**
 * App-domain bridge. Runs ONLY on the Virtual Closet web app. Its single job:
 * expose this extension's runtime id to the page so the app can use
 * chrome.runtime.sendMessage(extensionId, …) (externally_connectable is already
 * granted for these origins in the manifest). Without this, the app has no way
 * to learn the id and every extension call fails with "not connected".
 */
(function () {
  try {
    var id = chrome.runtime && chrome.runtime.id;
    if (!id) return;
    // The app reads localStorage 'extension_id' (see src/lib/extension/depopActions.ts
    // and StatsDashboard). Content scripts share the page's localStorage/DOM.
    if (localStorage.getItem('extension_id') !== id) {
      localStorage.setItem('extension_id', id);
    }
    document.documentElement.setAttribute('data-extension-installed', 'true');
    document.documentElement.setAttribute('data-extension-id', id);
    console.log('[Depop Ext] app-bridge connected — extension_id set:', id);
  } catch (e) {
    // localStorage can throw in rare sandboxed states — non-fatal.
    console.warn('[Depop Ext] app-bridge failed:', e && e.message);
  }
})();
