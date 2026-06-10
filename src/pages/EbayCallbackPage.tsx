import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OAUTH_CONFIG } from '../config/ebay';

/**
 * eBay OAuth Callback Page
 *
 * This page handles the redirect from Firebase Functions after OAuth completes.
 * It notifies the opener window and closes itself.
 */
export function EbayCallbackPage() {
  const [searchParams] = useSearchParams();
  const success = searchParams.get('success') === 'true';
  const error = searchParams.get('error');

  useEffect(() => {
    // Notify opener window via postMessage
    if (window.opener) {
      if (success) {
        window.opener.postMessage({ type: OAUTH_CONFIG.MESSAGE_TYPES.AUTH_SUCCESS }, '*');
      } else if (error) {
        window.opener.postMessage({
          type: OAUTH_CONFIG.MESSAGE_TYPES.AUTH_FAILED,
          error: decodeURIComponent(error)
        }, '*');
      }
    }

    // Try BroadcastChannel
    try {
      const bc = new BroadcastChannel(OAUTH_CONFIG.BROADCAST_CHANNEL);
      if (success) {
        bc.postMessage({ type: OAUTH_CONFIG.MESSAGE_TYPES.AUTH_SUCCESS });
      } else if (error) {
        bc.postMessage({ type: OAUTH_CONFIG.MESSAGE_TYPES.AUTH_FAILED, error: decodeURIComponent(error) });
      }
      bc.close();
    } catch (e) {
      console.warn('BroadcastChannel not available');
    }

    // Set localStorage flag (fallback method)
    if (success) {
      localStorage.setItem(OAUTH_CONFIG.STORAGE_KEYS.AUTH_COMPLETE, Date.now().toString());
    }

    // Auto-close after 1.5 seconds
    const timer = setTimeout(() => {
      window.close();
    }, 1500);

    return () => clearTimeout(timer);
  }, [success, error]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-purple-700 flex flex-col items-center justify-center text-white">
      {success ? (
        <>
          <div className="text-6xl mb-4 animate-bounce">✓</div>
          <h1 className="text-2xl font-bold mb-2">eBay Connected!</h1>
          <p className="text-lg opacity-90">This window will close automatically...</p>
        </>
      ) : (
        <>
          <div className="text-6xl mb-4">✗</div>
          <h1 className="text-2xl font-bold mb-2">Connection Failed</h1>
          <p className="text-lg opacity-90">{error ? decodeURIComponent(error) : 'Unknown error'}</p>
          <p className="text-sm mt-4 opacity-75">Please close this window and try again.</p>
        </>
      )}
    </div>
  );
}
