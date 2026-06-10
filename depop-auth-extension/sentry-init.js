/**
 * Sentry Error Tracking for Depop Extension
 * Initialized in service worker context
 */

// Import lightweight Sentry implementation
importScripts('./sentry-browser.min.js');

// Initialize Sentry
if (typeof Sentry !== 'undefined') {
  Sentry.init({
    dsn: "https://90db4901ac85b08411a08a533f431358@o4510479986720768.ingest.us.sentry.io/4510480007495680",
    environment: 'chrome-extension-background',
    release: chrome.runtime.getManifest().version,

    // Tag all errors as coming from extension
    beforeSend(event) {
      event.tags = event.tags || {};
      event.tags.source = 'depop-extension';
      event.tags.component = 'background-worker';
      event.tags.extension_version = chrome.runtime.getManifest().version;
      return event;
    },
  });

  console.log('✅ [Sentry] Error tracking initialized in background worker');

  // Wrap console.error to capture errors
  const originalError = console.error;
  console.error = function(...args) {
    originalError.apply(console, args);

    // Capture error in Sentry
    try {
      if (args[0] instanceof Error) {
        Sentry.captureException(args[0]);
      } else {
        Sentry.captureMessage('[Extension Error] ' + args.join(' '), 'error');
      }
    } catch (e) {
      console.warn('[Sentry] Failed to capture error:', e);
    }
  };

  // Test error on load to verify it's working
  console.log('[Sentry] Sending test event...');
  Sentry.captureMessage('[Extension] Depop extension loaded successfully', 'info');
} else {
  console.warn('[Sentry] Failed to load - error tracking disabled');
}
