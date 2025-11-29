/**
 * useEbayAuth Hook
 * 
 * Handles eBay OAuth flow and connection management
 * Provides authentication state and methods
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { EBAY_ENDPOINTS, OAUTH_CONFIG, POLLING_CONFIG } from '../config/ebay';
import { ebayService, type EbayConnectionStatus } from '../services/ebayService';
import { useAuthStore } from '../store/useAuthStore';

export interface UseEbayAuthReturn {
  // State
  isConnected: boolean;
  isLoading: boolean;
  status: EbayConnectionStatus | null;
  error: string | null;
  
  // Methods
  connect: () => void;
  disconnect: () => Promise<void>;
  checkConnection: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

/**
 * Custom hook for eBay authentication and connection management
 * 
 * Features:
 * - OAuth popup handling
 * - Multi-method communication (postMessage, localStorage, BroadcastChannel)
 * - Auto-reconnect on page load
 * - Periodic status polling
 * - Error handling and recovery
 * 
 * @returns {UseEbayAuthReturn} Authentication state and methods
 */
export function useEbayAuth(): UseEbayAuthReturn {
  const [status, setStatus] = useState<EbayConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthStore();

  /**
   * Check eBay connection status
   */
  const checkConnection = useCallback(async () => {
    try {
      const connectionStatus = await ebayService.checkConnection();
      setStatus(connectionStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check connection');
      console.error('eBay connection check failed:', err);
    }
  }, []);

  /**
   * Refresh connection status manually
   */
  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    await checkConnection();
    setIsLoading(false);
  }, [checkConnection]);

  /**
   * Open OAuth popup and handle authentication flow
   */
  const connect = useCallback(() => {
    if (!user?.id) {
      toast.error('Please sign in first');
      console.error('❌ Cannot connect to eBay: No user signed in');
      return;
    }

    console.log('🔐 Initiating eBay OAuth flow...');
    toast.info('Opening eBay login...');

    // Calculate centered popup position
    const width = OAUTH_CONFIG.POPUP_WIDTH;
    const height = OAUTH_CONFIG.POPUP_HEIGHT;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    // Build OAuth URL with userId
    const oauthUrl = `${EBAY_ENDPOINTS.AUTH_CONNECT}?userId=${encodeURIComponent(user.id)}`;

    // Open OAuth popup
    const popup = window.open(
      oauthUrl,
      OAUTH_CONFIG.POPUP_TITLE,
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    );

    if (!popup) {
      toast.error('Popup blocked! Please allow popups for this site.');
      console.error('❌ Popup was blocked by browser');
      return;
    }

    console.log('✅ OAuth popup opened');

    // Monitor popup closure AND poll localStorage for auth completion
    let authCompleteTime = localStorage.getItem(OAUTH_CONFIG.STORAGE_KEYS.AUTH_COMPLETE);

    const checkAuth = setInterval(() => {
      // Check if popup closed
      if (popup.closed) {
        clearInterval(checkAuth);
        console.log('🚪 OAuth popup closed');
        checkConnection();
        return;
      }

      // Poll localStorage for auth completion (backup method)
      const currentAuthTime = localStorage.getItem(OAUTH_CONFIG.STORAGE_KEYS.AUTH_COMPLETE);
      if (currentAuthTime && currentAuthTime !== authCompleteTime) {
        console.log('✅ OAuth success detected via localStorage polling');
        toast.success('🎉 eBay connected successfully!');
        clearInterval(checkAuth);
        localStorage.removeItem(OAUTH_CONFIG.STORAGE_KEYS.AUTH_COMPLETE);
        popup.close();
        checkConnection();
        authCompleteTime = currentAuthTime;
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!popup.closed) {
        clearInterval(checkAuth);
        popup.close();
        toast.warning('OAuth timeout. Please try again.');
      }
    }, 300000); // 5 minutes
  }, [checkConnection, user?.id]);

  /**
   * Disconnect eBay account
   */
  const disconnect = useCallback(async () => {
    try {
      setIsLoading(true);
      await ebayService.disconnect();
      setStatus({ connected: false, hasToken: false, lastSync: null, tokenExpiry: null });
      toast.success('eBay account disconnected');
      console.log('✅ eBay account disconnected');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to disconnect';
      setError(errorMsg);
      toast.error(errorMsg);
      console.error('❌ Disconnect failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Handle OAuth success messages
   */
  useEffect(() => {
    // Method 1: postMessage listener
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === OAUTH_CONFIG.MESSAGE_TYPES.AUTH_SUCCESS) {
        console.log('✅ OAuth success via postMessage');
        toast.success('🎉 eBay connected successfully!');
        
        // Refresh connection status
        setTimeout(() => {
          checkConnection();
        }, 500);
      }
    };

    // Method 2: localStorage listener
    const handleStorage = (event: StorageEvent) => {
      if (event.key === OAUTH_CONFIG.STORAGE_KEYS.AUTH_COMPLETE) {
        console.log('✅ OAuth success via localStorage');
        toast.success('🎉 eBay connected successfully!');
        
        setTimeout(() => {
          checkConnection();
        }, 500);
      }
    };

    // Method 3: BroadcastChannel listener
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(OAUTH_CONFIG.BROADCAST_CHANNEL);
      bc.onmessage = (event) => {
        if (event.data.type === OAUTH_CONFIG.MESSAGE_TYPES.AUTH_SUCCESS) {
          console.log('✅ OAuth success via BroadcastChannel');
          toast.success('🎉 eBay connected successfully!');
          
          setTimeout(() => {
            checkConnection();
          }, 500);
        }
      };
    } catch (e) {
      console.warn('⚠️ BroadcastChannel not available');
    }

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
    };
  }, [checkConnection]);

  /**
   * Initial connection check and polling
   */
  useEffect(() => {
    // Check connection on mount
    checkConnection();

    // Poll connection status periodically
    const pollInterval = setInterval(() => {
      checkConnection();
    }, POLLING_CONFIG.STATUS_INTERVAL);

    return () => {
      clearInterval(pollInterval);
    };
  }, [checkConnection]);

  return {
    isConnected: status?.connected ?? false,
    isLoading,
    status,
    error,
    connect,
    disconnect,
    checkConnection,
    refreshStatus,
  };
}

