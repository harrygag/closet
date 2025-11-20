/**
 * Content Script - Runs on Virtual Closet Web App
 * Bridges communication between the web app and the extension
 */

console.log('[VirtualCloset Extension] App content script loaded');

// Inject a marker to let the app know the extension is installed
// We use a hidden input field which is more reliable for React to find
const marker = document.createElement('input');
marker.type = 'hidden';
marker.id = 'vc-extension-installed';
marker.value = '1.0.0';
document.body.appendChild(marker);
console.log('[VirtualCloset Extension] Marker injected');

// Listen for messages from the web app via window.postMessage
window.addEventListener('message', function(event) {
  // We only accept messages from ourselves
  if (event.source !== window) return;

  if (event.data.type && (event.data.type === 'CLOSET_SEND_TOKEN')) {
    console.log('[VirtualCloset Extension] Received token via postMessage');
    
    const token = event.data.token;
    if (token) {
      // Send to background script
      chrome.runtime.sendMessage({ 
        type: 'SAVE_TOKEN', 
        token: token 
      }, (response) => {
        console.log('[VirtualCloset Extension] Token save response:', response);
        
        // Notify app back
        window.postMessage({
            type: 'CLOSET_EXTENSION_CONNECTED',
            success: response?.success
        }, '*');
      });
    }
  }
});
