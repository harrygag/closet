/**
 * Sentry Error Tracking for Depop Extension Popup
 */

// Initialize Sentry for popup context
if (typeof Sentry !== 'undefined') {
  Sentry.init({
    dsn: "https://90db4901ac85b08411a08a533f431358@o4510479986720768.ingest.us.sentry.io/4510480007495680",
    environment: 'chrome-extension-popup',
    release: chrome.runtime.getManifest().version,

    beforeSend(event) {
      event.tags = event.tags || {};
      event.tags.source = 'depop-extension';
      event.tags.component = 'popup-ui';
      event.tags.extension_version = chrome.runtime.getManifest().version;
      return event;
    },
  });

  console.log('✅ [Sentry] Popup error tracking initialized');

  // Capture unhandled errors
  window.addEventListener('error', (event) => {
    console.log('[Sentry] Capturing window error:', event.error);
    Sentry.captureException(event.error || new Error(event.message));
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.log('[Sentry] Capturing unhandled rejection:', event.reason);
    Sentry.captureException(event.reason);
  });

  // Test error
  console.log('[Sentry] Sending popup test event...');
  Sentry.captureMessage('[Extension] Popup opened', 'info');
} else {
  console.warn('[Sentry] Not loaded in popup');
}
