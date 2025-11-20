/**
 * Content Script - Runs on Virtual Closet Web App
 * Bridges communication between the web app and the extension
 */

console.log('[VirtualCloset Extension] App content script loaded');

// Inject a marker to let the app know the extension is installed
document.documentElement.setAttribute('data-extension-installed', 'true');

// Listen for token events from the web app
window.addEventListener('CLOSET_SEND_TOKEN', function(event) {
  const token = event.detail;
  if (token) {
    console.log('[VirtualCloset Extension] Received token from app');
    
    // Send to background script
    chrome.runtime.sendMessage({ 
      type: 'SAVE_TOKEN', 
      token: token 
    }, (response) => {
      console.log('[VirtualCloset Extension] Token save response:', response);
      
      // Notify app back
      window.dispatchEvent(new CustomEvent('CLOSET_EXTENSION_CONNECTED', {
        detail: { success: response?.success }
      }));
    });
  }
});

