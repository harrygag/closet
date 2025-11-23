// Virtual Closet - App Content Script
// Runs on localhost:5173 to bridge React app <-> Extension background

const log = (msg, ...args) => console.log(`%c[VirtualCloset] ${msg}`, 'color: #a855f7; font-weight: bold;', ...args);

log('Content script loaded on', window.location.href);

// Declare interval at top scope
let announceInterval = null;
let contextLostNotified = false;
let appReady = false; // Track if app has acknowledged

// Check if extension context is valid
function isExtensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

try {
  if (!isExtensionContextValid()) {
    throw new Error('Extension context is not valid');
  }

  const extensionId = chrome.runtime.id;
  log('Extension ID:', extensionId);

  const announceExtension = () => {
    try {
      // Stop if app already acknowledged
      if (appReady) {
        log('App already ready, skipping announce');
        if (announceInterval) {
          clearInterval(announceInterval);
          announceInterval = null;
        }
        return;
      }

      // Re-check context validity before announcing
      if (!isExtensionContextValid()) {
        if (announceInterval) {
          clearInterval(announceInterval);
          announceInterval = null;
        }
        // Only notify once
        if (!contextLostNotified) {
          contextLostNotified = true;
          log('⚠️ Extension context lost');
          window.postMessage({ 
            type: 'CLOSET_EXTENSION_CONTEXT_LOST',
            reason: 'Extension was reloaded. Refresh this page.'
          }, '*');
        }
        return;
      }

      log('Announcing extension ID:', extensionId);
      window.postMessage({ 
        type: 'CLOSET_EXTENSION_ID', 
        extensionId 
      }, '*');
    } catch (err) {
      console.error('[VirtualCloset] Failed to announce:', err);
      if (announceInterval) {
        clearInterval(announceInterval);
        announceInterval = null;
      }
    }
  };

  // Announce once immediately
  announceExtension();

  // Announce periodically but stop when acknowledged
  let announceCount = 0;
  announceInterval = setInterval(() => {
    if (appReady || announceCount >= 20) { // Stop after 20 tries (10 seconds)
      if (announceCount >= 20) {
        log('Stopped announcing after 10 seconds');
      }
      clearInterval(announceInterval);
      announceInterval = null;
      return;
    }
    announceCount++;
    announceExtension();
  }, 500);

  // Listen for messages from React app
  window.addEventListener('message', (event) => {
    // Only accept messages from same window
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;

    const { type, token, user } = event.data;

    try {
      switch (type) {
        case 'CLOSET_PING_EXTENSION':
          log('Ping received, responding');
          announceExtension();
          break;

        case 'CLOSET_READY':
          log('App ready, stopping announcements');
          appReady = true;
          if (announceInterval) {
            clearInterval(announceInterval);
            announceInterval = null;
          }
          break;

        case 'LOGIN_EXTENSION':
          log('LOGIN_EXTENSION received, forwarding to background');
          
          // Check if runtime is still available
          if (!isExtensionContextValid()) {
            console.error('[VirtualCloset] Extension context not valid for login');
            return;
          }

          try {
          chrome.runtime.sendMessage({
            type: 'LOGIN_EXTENSION',
            token,
            user
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('[VirtualCloset] Failed to forward login:', chrome.runtime.lastError);
            } else {
              log('Login forwarded successfully', response);
                // Notify React that login succeeded
                window.postMessage({ 
                  type: 'CLOSET_LOGIN_SUCCESS'
                }, '*');
            }
          });
          } catch (err) {
            console.error('[VirtualCloset] Exception forwarding login:', err);
          }
          break;

        case 'LOGOUT_EXTENSION':
          log('LOGOUT_EXTENSION received, forwarding to background');
          
          // Check if runtime is still available
          if (!isExtensionContextValid()) {
            console.error('[VirtualCloset] Extension context lost. Please refresh the page.');
            window.postMessage({ 
              type: 'CLOSET_EXTENSION_CONTEXT_LOST',
              reason: 'Extension context lost during logout. Please refresh this page.'
            }, '*');
            return;
          }

          chrome.runtime.sendMessage({
            type: 'LOGOUT_EXTENSION'
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('[VirtualCloset] Failed to forward logout:', chrome.runtime.lastError);
              window.postMessage({ 
                type: 'CLOSET_EXTENSION_ERROR',
                error: chrome.runtime.lastError.message
              }, '*');
            } else {
              log('Logout forwarded successfully', response);
            }
          });
          break;
      }
    } catch (err) {
      console.error('[VirtualCloset] Error handling message:', err);
    }
  });

  log('Content script ready, listening for messages');

} catch (err) {
  console.error('[VirtualCloset] Extension context is invalid:', err);
  console.error('[VirtualCloset] Please refresh the page after reloading the extension.');
}
