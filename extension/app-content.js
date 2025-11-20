// Announce the extension ID to the web app
// This allows the app to auto-configure the ID without user copy-paste
window.postMessage({
  type: 'CLOSET_EXTENSION_ID',
  extensionId: chrome.runtime.id
}, '*');

