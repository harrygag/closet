import React, { useState, useEffect, useCallback } from 'react';
import { ExternalLink, CheckCircle, XCircle, RefreshCw, Cookie, Shield, Clock, AlertCircle, Chrome, HelpCircle, Download, Import, Terminal } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { database } from '../lib/database/client';
import { toast } from 'sonner';
import { DiagnosticsModal } from '../components/DiagnosticsModal';

interface MarketplaceConnection {
  marketplace: 'ebay' | 'poshmark' | 'depop';
  connected: boolean;
  lastValidated?: string;
  expiresAt?: string;
  cookieCount?: number;
  email?: string;
}

interface MarketplaceCredential {
  marketplace: string;
  last_validated_at?: string;
  expires_at?: string;
  email?: string;
  cookies_encrypted?: string;
}

interface ExtensionMarketplaceStatus {
  lastSync: number | null;
  lastAttempt: number | null;
  lastError: string | null;
  cookieCount: number;
  lastSource: string | null;
}

interface ExtensionStatusPayload {
  success: boolean;
  extensionId: string;
  version?: string;
  isAuthenticated: boolean;
  marketplaces: Record<string, ExtensionMarketplaceStatus>;
  timestamp?: number;
  error?: string;
}

const marketplaceData = {
  ebay: {
    name: 'eBay',
    url: 'https://www.ebay.com/sh/lst/active',
    color: 'from-yellow-500 to-red-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    textColor: 'text-yellow-400',
    icon: '🏷️',
    description: 'Online auction and shopping',
  },
  poshmark: {
    name: 'Poshmark',
    url: 'https://poshmark.com/closet',
    color: 'from-pink-500 to-purple-500',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/30',
    textColor: 'text-pink-400',
    icon: '👗',
    description: 'Social marketplace for fashion',
  },
  depop: {
    name: 'Depop',
    url: 'https://www.depop.com',
    color: 'from-red-500 to-orange-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    textColor: 'text-red-400',
    icon: '🛍️',
    description: 'Fashion marketplace community',
  }
};

export const MarketplacesPage: React.FC = () => {
  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [extensionId, setExtensionId] = useState('');
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatusPayload | null>(null);
  const [extensionError, setExtensionError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [loginWindows, setLoginWindows] = useState<Record<string, { window: Window | null, toastId: string | number }>>({});

  // Diagnostics State
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsReport, setDiagnosticsReport] = useState(null);

  const fetchExtensionStatus = useCallback(() => {
    if (!extensionId) return;
    if (!(window as any).chrome || !(window as any).chrome.runtime) return;

    (window as any).chrome.runtime.sendMessage(
      extensionId,
      { type: 'GET_STATUS' },
      (response: ExtensionStatusPayload) => {
        const runtime = (window as any).chrome?.runtime;
        if (runtime?.lastError) {
          const errorMsg = runtime.lastError.message;
          
          if (errorMsg.includes('Receiving end does not exist') || errorMsg.includes('Could not establish connection')) {
            console.warn('[MarketplacesPage] Extension disconnected, clearing stored ID');
            setExtensionId('');
            setExtensionError('Extension disconnected');
          setExtensionStatus(null);
            localStorage.removeItem('extension_id');
          } else {
            setExtensionError(errorMsg);
            setExtensionStatus(null);
          }
          return;
        }
        if (!response || response.success === false) {
          setExtensionError(response?.error || 'Extension returned an error');
          setExtensionStatus(null);
          return;
        }
        setExtensionStatus(response);
        setExtensionError(null);
      }
    );
  }, [extensionId]);

  useEffect(() => {
    const storedId = localStorage.getItem('extension_id');
    if (storedId) {
      setExtensionId(storedId);
    }
    loadConnections();
  }, []);

  useEffect(() => {
    let contextLostShown = false;
    let hasConnected = false;

    const handleMessage = async (event: MessageEvent) => {
      if (event.source !== window) return;
      
      console.log('[MarketplacesPage] Received message:', event.data.type);
      
      // Handle extension context lost (only once)
      if (event.data.type === 'CLOSET_EXTENSION_CONTEXT_LOST') {
        if (contextLostShown) return;
        contextLostShown = true;
        
        console.error('[MarketplacesPage] Extension context lost:', event.data.reason);
        setExtensionId('');
        setExtensionError('Extension context lost');
        setExtensionStatus(null);
        localStorage.removeItem('extension_id');
        
        toast.error('Extension Disconnected', {
          description: 'Refresh page to reconnect',
          duration: 10000,
          action: {
            label: 'Refresh',
            onClick: () => window.location.reload()
          }
        });
        return;
      }

      // Handle extension errors
      if (event.data.type === 'CLOSET_EXTENSION_ERROR') {
        console.error('[MarketplacesPage] Extension error:', event.data.error);
        return;
      }

      // Handle login success
      if (event.data.type === 'CLOSET_LOGIN_SUCCESS') {
        console.log('[MarketplacesPage] Extension authenticated successfully');
        toast.success('Extension authenticated!', { duration: 2000 });
        return;
      }

      // Handle extension ID announcement
      if (event.data.type === 'CLOSET_EXTENSION_ID' && event.data.extensionId) {
        const id = event.data.extensionId as string;
        const storedId = localStorage.getItem('extension_id');
        
        console.log('[MarketplacesPage] Extension ID received:', id);
        console.log('[MarketplacesPage] Stored ID:', storedId);
        console.log('[MarketplacesPage] Has connected:', hasConnected);
        
        // Only process once per page load
        if (hasConnected) {
          console.log('[MarketplacesPage] Already connected, ignoring');
          return;
        }
        
        // Skip if we already have this ID stored
        if (storedId === id) {
          console.log('[MarketplacesPage] Same ID, sending READY');
          window.postMessage({ type: 'CLOSET_READY' }, '*');
          hasConnected = true;
          return;
        }
        
        hasConnected = true;
        setExtensionId(id);
            localStorage.setItem('extension_id', id);
        console.log('[MarketplacesPage] Extension connected, sending READY');
        toast.success('Extension connected!', { duration: 2000 });
            window.postMessage({ type: 'CLOSET_READY' }, '*');
        
        // Auto-authenticate with delay
        setTimeout(async () => {
          const { data: { session } } = await database.auth.getSession();
          if (session?.access_token && session?.user) {
            console.log('[MarketplacesPage] Auto-authenticating extension...');
            window.postMessage({
              type: 'LOGIN_EXTENSION',
              token: session.access_token,
              user: session.user
            }, '*');
          }
        }, 1000);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!extensionId) {
      console.log('[MarketplacesPage] Extension not connected, starting ping interval');
      let pingCount = 0;
      const interval = setInterval(() => {
        pingCount++;
        if (pingCount > 30) { // Stop after 60 seconds
          console.log('[MarketplacesPage] Stopped pinging after 60 seconds');
          clearInterval(interval);
          return;
        }
        window.postMessage({ type: 'CLOSET_PING_EXTENSION' }, '*');
      }, 2000);
      return () => clearInterval(interval);
    } else {
      console.log('[MarketplacesPage] Extension connected, fetching status');
      // Fetch status once when extension connects
    fetchExtensionStatus();
    }
  }, [extensionId, fetchExtensionStatus]);

  const handleExtensionIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.trim();
    setExtensionId(newValue);
    localStorage.setItem('extension_id', newValue);
    setTimeout(() => fetchExtensionStatus(), 200);
  };

  const loadConnections = async () => {
    let session = null;
    let credentials: MarketplaceCredential[] = [];

    try {
      const sessionResult = await database.auth.getSession();
      session = sessionResult.data.session;

      if (session) {
        const result = await (database
          .from('user_marketplace_credentials')
          .select('marketplace, last_validated_at, expires_at, email, cookies_encrypted')
          .eq('user_uuid', session.user.id) as any);
        const { data, error } = result;

        if (error) {
           if (error.message.includes('does not exist')) {
             console.error('Table missing:', error);
             // Fallback: just assume empty if table doesn't exist yet
             credentials = [];
           } else {
             throw error;
           }
        } else {
          credentials = data as MarketplaceCredential[] || [];
        }
      }
    } catch (error: any) {
      console.error('Error loading connections:', error);
      toast.error('Failed to load marketplace connections');
    } finally {
      const allMarketplaces: MarketplaceConnection[] = ['ebay', 'poshmark', 'depop'].map(mp => {
        const cred = credentials.find(c => c.marketplace === mp);
        const now = new Date();
        const expiresAt = cred?.expires_at ? new Date(cred.expires_at) : null;
        const isExpired = expiresAt ? now > expiresAt : false;

        return {
          marketplace: mp as any,
          connected: !!cred && !!cred.cookies_encrypted && !isExpired,
          lastValidated: cred?.last_validated_at,
          expiresAt: cred?.expires_at,
          email: cred?.email,
          cookieCount: safeCookieCount(cred?.cookies_encrypted),
        };
      });

      setConnections(allMarketplaces);
      setLoading(false);
    }
  };

  const handleSyncCookies = async (marketplace: string, existingToastId?: string | number) => {
    if (!extensionId) {
      toast.error('Please enter your Extension ID first');
      return;
    }

    setSyncing(marketplace);
    const toastId = existingToastId || toast.loading(`Connecting to extension for ${marketplaceData[marketplace as keyof typeof marketplaceData].name}...`);

    const timeoutId = setTimeout(() => {
      setSyncing((current) => {
        if (current === marketplace) {
          toast.error('Extension timed out', {
            id: toastId,
            description: 'The extension is installed but not responding. Try reloading the page.'
          });
          return null;
        }
        return current;
      });
    }, 5000);

    try {
      if (!(window as any).chrome || !(window as any).chrome.runtime) {
        clearTimeout(timeoutId);
        throw new Error('Chrome runtime not found. Are you in Chrome?');
      }

      (window as any).chrome.runtime.sendMessage(
        extensionId,
        { type: 'SYNC_MARKETPLACE', marketplace },
        async (response: any) => {
          clearTimeout(timeoutId);
          
          const runtime = (window as any).chrome.runtime;
          if (runtime.lastError) {
            const errorMsg = runtime.lastError.message;
            console.error('Extension Error:', errorMsg);
            
            if (errorMsg.includes('Receiving end does not exist') || errorMsg.includes('Could not establish connection')) {
              toast.error('Extension Disconnected', {
                id: toastId,
                description: 'Extension was reloaded. Please refresh this page.',
                duration: 10000,
                action: {
                  label: 'Refresh Page',
                  onClick: () => window.location.reload()
                }
              });
              setExtensionId('');
              localStorage.removeItem('extension_id');
            } else {
            toast.error('Connection Failed', {
              id: toastId,
                description: `Chrome says: ${errorMsg}`
            });
            }
            setSyncing(null);
            return;
          }

          if (response && response.success) {
            // Extension now handles saving directly to backend
            toast.success(
              `✅ Connected ${marketplaceData[marketplace as keyof typeof marketplaceData].name}! (${response.cookieCount ?? 0} cookies saved)`,
              { id: toastId }
            );
            loadConnections();
            fetchExtensionStatus();
          } else {
            toast.error('Sync failed', { 
              id: toastId, 
              description: response?.error || 'No cookies found. Please visit the marketplace first.' 
            });
            fetchExtensionStatus();
          }
          setSyncing(null);
        }
      );
    } catch (error: any) {
      console.error('Sync Error:', error);
      toast.error('Sync error', { id: toastId, description: error.message });
      setSyncing(null);
      fetchExtensionStatus();
    }
  };

  const handleImportFromMarketplace = async (marketplace: string) => {
    if (marketplace !== 'ebay') {
      toast.info('Import currently only supported for eBay');
      return;
    }

    if (!extensionId) {
      toast.error('Extension not connected');
      return;
    }

    setImporting(marketplace);
    const toastId = toast.loading(`Importing items from ${marketplaceData[marketplace as keyof typeof marketplaceData].name}...`);

    try {
      const { data: { session } } = await database.auth.getSession();
      if (!session) throw new Error('No session found');

      toast.loading('Waiting for extension to fetch items...', { id: toastId });
      
      const items = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Extension timed out')), 15000);
        
        (window as any).chrome.runtime.sendMessage(
          extensionId,
          { type: 'IMPORT_MARKETPLACE', marketplace },
          (response: any) => {
            clearTimeout(timeout);
            const err = (window as any).chrome.runtime.lastError;
            if (err) {
              const errorMsg = err.message;
              if (errorMsg.includes('Receiving end does not exist') || errorMsg.includes('Could not establish connection')) {
                return reject(new Error('Extension disconnected. Please refresh this page.'));
              }
              return reject(new Error(errorMsg));
            }
            if (!response) return reject(new Error('No response from extension'));
            if (!response.success) return reject(new Error(response.error || 'Import failed'));
            
            resolve(response.items || []);
          }
        );
      });

      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('No items found. Please check your active listings tab.');
      }

      toast.loading(`Saving ${items.length} items...`, { id: toastId });

      const response = await fetch('http://localhost:3001/api/ebay/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ items }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save imported items');
      }

      toast.success(`Successfully imported ${result.count} items!`, { id: toastId });
      
    } catch (error: any) {
      console.error('Import Error:', error);
      toast.error('Import failed', { 
        id: toastId, 
        description: error.message,
        duration: 5000 
      });
    } finally {
      setImporting(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadConnections();
    fetchExtensionStatus();
    setRefreshing(false);
    toast.success('Connections refreshed');
  };

  const handleDisconnect = async (marketplace: string) => {
    try {
      const { data: { session } } = await database.auth.getSession();
      if (!session) return;

      const result = await (database
        .from('user_marketplace_credentials')
        .delete()
        .eq('user_uuid', session.user.id)
        .eq('marketplace', marketplace) as any);
      const { error } = result;

      if (error) throw error;

      toast.success(`Disconnected from ${marketplaceData[marketplace as keyof typeof marketplaceData].name}`);
      await loadConnections();
    } catch (error: any) {
      toast.error(error.message || 'Failed to disconnect');
    }
  };

  const openMarketplace = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleLoginAndSync = async (marketplace: string) => {
    if (!extensionId) {
      toast.error('Extension not detected', {
        description: 'Please install and enable the extension first.'
      });
      return;
    }

    const info = marketplaceData[marketplace as keyof typeof marketplaceData];
    const toastId = toast.loading(`Opening ${info.name}...`, {
      description: 'Log in, then we\'ll capture your session automatically.'
    });

    // Open the marketplace in a new window
    const loginWindow = window.open(info.url, '_blank', 'width=1200,height=800,noopener,noreferrer');

    // Store the window reference
    setLoginWindows(prev => ({
      ...prev,
      [marketplace]: { window: loginWindow, toastId }
    }));

    // Wait 3 seconds for the user to start logging in
    setTimeout(() => {
      toast.loading(`Waiting for you to log in to ${info.name}...`, {
        id: toastId,
        description: 'Click "Capture Cookies" when you\'re logged in.'
      });
    }, 2000);

    // Auto-sync after 8 seconds (giving time for login)
    setTimeout(async () => {
      const currentWindow = loginWindows[marketplace]?.window;
      if (!currentWindow || currentWindow.closed) {
        toast.error('Login window was closed', {
          id: toastId,
          description: 'Please try again and keep the window open.'
        });
        setLoginWindows(prev => {
          const next = { ...prev };
          delete next[marketplace];
          return next;
        });
        return;
      }

      // Trigger the sync
      toast.loading(`Capturing cookies from ${info.name}...`, {
        id: toastId
      });
      
      await handleSyncCookies(marketplace, toastId);
      
      // Clean up
      setLoginWindows(prev => {
        const next = { ...prev };
        delete next[marketplace];
        return next;
      });
    }, 8000);
  };

  const handleCaptureNow = async (marketplace: string, event?: React.MouseEvent) => {
    // Prevent any default button behavior
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const loginWindow = loginWindows[marketplace];
    if (!loginWindow) return;

    const info = marketplaceData[marketplace as keyof typeof marketplaceData];
    const toastId = loginWindow.toastId;

    toast.loading(`Capturing cookies from ${info.name}...`, {
      id: toastId
    });

    await handleSyncCookies(marketplace, toastId);

    setLoginWindows(prev => {
      const next = { ...prev };
      delete next[marketplace];
      return next;
    });
  };

  const handleDownloadExtension = () => {
    const link = document.createElement('a');
    link.href = '/extension.zip';
    link.download = 'VirtualCloset-Extension.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Downloading extension...', {
      description: 'Unzip this folder to install in Chrome',
    });
  };

  const handlePingExtension = () => {
    if (!extensionId) {
      toast.error('Extension ID not detected yet');
      return;
    }
    if (!(window as any).chrome || !(window as any).chrome.runtime) {
      toast.error('Chrome runtime unavailable');
      return;
    }

    const toastId = toast.loading('Pinging extension...');
    
    const timeoutId = setTimeout(() => {
      toast.error('Ping timed out', {
        id: toastId,
        description: 'Extension not responding. Try refreshing the page.'
      });
    }, 3000);

    (window as any).chrome.runtime.sendMessage(
      extensionId,
      { type: 'PING' },
      (response: any) => {
        clearTimeout(timeoutId);
        const runtime = (window as any).chrome?.runtime;
        if (runtime?.lastError) {
          const errorMsg = runtime.lastError.message;
          console.error('[Ping] Extension error:', errorMsg);
          
          if (errorMsg.includes('Receiving end does not exist') || errorMsg.includes('Could not establish connection')) {
            toast.error('Extension Disconnected', {
              id: toastId,
              description: 'Please refresh this page to reconnect.',
              action: {
                label: 'Refresh',
                onClick: () => window.location.reload()
              }
            });
            setExtensionId('');
            localStorage.removeItem('extension_id');
          } else {
            toast.error(`Ping failed: ${errorMsg}`, { id: toastId });
          }
          setExtensionError(errorMsg);
          return;
        }
        if (response?.success) {
          toast.success(`Extension online (version ${response.version || 'unknown'})`, { id: toastId });
          setExtensionStatus(response);
          setExtensionError(null);
        } else {
          toast.error('Extension responded with an error', { id: toastId });
        }
      }
    );
  };

  const handleRunDiagnostics = () => {
    if (!extensionId) {
      toast.error('Extension not detected', {
        description: 'The extension ID is not available. Please refresh the page or install the extension.',
        duration: 5000
      });
      return;
    }

    if (!(window as any).chrome || !(window as any).chrome.runtime) {
      toast.error('Chrome runtime not available', {
        description: 'Are you running this in Chrome?',
        duration: 5000
      });
      return;
    }
    
    setDiagnosticsLoading(true);
    setDiagnosticsReport(null);

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setDiagnosticsLoading(false);
      toast.error('Diagnostics timed out', {
        description: 'Extension did not respond. Try refreshing the page.',
        duration: 5000
      });
    }, 5000);

    try {
    (window as any).chrome.runtime.sendMessage(
      extensionId,
      { type: 'DIAGNOSE_CONNECTION' },
      (response: any) => {
          clearTimeout(timeoutId);
         setDiagnosticsLoading(false);
          
         const runtime = (window as any).chrome?.runtime;
         if (runtime?.lastError) {
            const errorMsg = runtime.lastError.message;
            console.error('[Diagnostics] Extension error:', errorMsg);
            
            if (errorMsg.includes('Receiving end does not exist') || errorMsg.includes('Could not establish connection')) {
              toast.error('Extension Not Connected', {
                description: 'The extension was reloaded or disconnected. Please refresh this page.',
                duration: 10000,
                action: {
                  label: 'Refresh Page',
                  onClick: () => window.location.reload()
                }
              });
              // Clear the stored extension ID since it's stale
              setExtensionId('');
              localStorage.removeItem('extension_id');
            } else {
              toast.error('Diagnostics failed: ' + errorMsg, { duration: 5000 });
            }
           return;
         }
          
         if (response) {
           setDiagnosticsReport(response);
            setIsDiagnosticsOpen(true);
          } else {
            toast.error('No response from extension', {
              description: 'Try refreshing the page.',
              duration: 5000
            });
         }
      }
    );
    } catch (error: any) {
      clearTimeout(timeoutId);
      setDiagnosticsLoading(false);
      console.error('[Diagnostics] Exception:', error);
      toast.error('Failed to run diagnostics: ' + error.message);
    }
  };

  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 2592000)}mo ago`;
  };

  const formatExpiresIn = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((date.getTime() - now.getTime()) / 1000);
    
    if (seconds < 0) return 'Expired';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const formatTimestamp = (timestamp?: number | null) => {
    if (!timestamp) return 'Never';
    const delta = Math.floor((Date.now() - timestamp) / 1000);
    if (delta < 60) return 'Just now';
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
    return `${Math.floor(delta / 86400)}d ago`;
  };

  const safeCookieCount = (payload?: string) => {
    if (!payload) return 0;
    try {
      const parsed = JSON.parse(payload);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/50">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">🔗 Marketplaces</h1>
              <p className="text-gray-400 text-sm">Sync your accounts securely via Chrome Extension</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleRefresh}
                variant="secondary"
                disabled={refreshing}
                size="sm"
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border-gray-600"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Extension Status Bar - Clean Design */}
          <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 p-4 mb-6">
            <div className="flex flex-col gap-4">
              {/* Top Row: Status & Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${extensionId ? 'bg-green-500/10 text-green-400' : 'bg-gray-700/50 text-gray-400'}`}>
                     <Chrome className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white flex items-center gap-2">
                      Extension Status: 
                      {extensionId ? (
                        <span className="text-green-400 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="text-gray-400">Not Detected</span>
                      )}
                    </div>
                    {extensionId && (
                      <div className="text-xs text-gray-500 font-mono mt-0.5">ID: {extensionId}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {!extensionId && (
                     <div className="flex items-center gap-2">
                       <input
                          type="text"
                          value={extensionId}
                          onChange={handleExtensionIdChange}
                          placeholder="Manual ID entry..."
                          className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 w-48 font-mono"
                        />
                     </div>
                  )}
                  <Button
                    onClick={handleDownloadExtension}
                    variant="secondary"
                    size="sm"
                    className="text-xs flex items-center gap-2 hover:bg-purple-500/10 hover:text-purple-400 hover:border-purple-500/30 transition-all"
                  >
                    <Download className="h-3 w-3" />
                    {extensionId ? 'Update Extension' : 'Download Extension'}
                  </Button>
                </div>
              </div>

              {/* Debug Actions Row */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-700/30 flex-wrap">
                <span className="text-xs text-gray-500 font-mono">DEBUG</span>
                <Button
                  onClick={() => setIsDiagnosticsOpen(true)}
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs bg-purple-900/20 border-purple-700/50 text-purple-300"
                >
                  <Terminal className="h-3 w-3 mr-1" /> Diagnostics
                </Button>
                <Button
                  onClick={handlePingExtension}
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs bg-gray-800 border-gray-700"
                >
                  📡 Test Connectivity
                </Button>
                <Button
                  onClick={fetchExtensionStatus}
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs bg-gray-800 border-gray-700"
                  disabled={!extensionId}
                >
                  🔄 Refresh Status
                </Button>
                {extensionStatus?.version ? (
                  <span className="text-[11px] text-gray-400">
                    v{extensionStatus.version} · {formatTimestamp(extensionStatus.timestamp)}
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-500">No status yet</span>
                )}
                {extensionError && (
                  <span className="text-[11px] text-red-400 truncate max-w-[220px]" title={extensionError}>
                    {extensionError}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Grid - More Compact */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
              <div className="text-2xl font-bold text-green-400">
                {connections.filter(c => c.connected).length}
              </div>
              <div className="text-sm text-gray-400">Connected</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
              <div className="text-2xl font-bold text-gray-400">
                {connections.filter(c => !c.connected).length}
              </div>
              <div className="text-sm text-gray-400">Not Connected</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
              <div className="text-2xl font-bold text-purple-400">
                {connections.length}
              </div>
              <div className="text-sm text-gray-400">Total</div>
            </div>
          </div>
        </div>
      </div>

      {/* Marketplace Cards */}
      <div className="p-6 space-y-4">
        {connections.map((connection) => {
          const info = marketplaceData[connection.marketplace];
          const isExpired = connection.expiresAt && new Date(connection.expiresAt) < new Date();
          const isSyncing = syncing === connection.marketplace;
          const isImporting = importing === connection.marketplace;
          const extStatus = extensionStatus?.marketplaces?.[connection.marketplace];
          const isExtensionReady = !!extensionId;
          
          return (
            <div
              key={connection.marketplace}
              className={`
                relative overflow-hidden rounded-xl border-2 transition-all
                ${connection.connected && !isExpired
                  ? `${info.borderColor} ${info.bgColor}`
                  : 'border-gray-700/50 bg-gray-800/30'
                }
                hover:scale-[1.02] hover:shadow-xl
              `}
            >
              {/* Gradient Overlay */}
              {connection.connected && !isExpired && (
                <div className={`absolute inset-0 bg-gradient-to-br ${info.color} opacity-5`} />
              )}

              <div className="relative p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="text-5xl">{info.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                        {info.name}
                        {connection.connected && !isExpired ? (
                          <CheckCircle className="h-5 w-5 text-green-400" />
                        ) : isExpired ? (
                          <AlertCircle className="h-5 w-5 text-yellow-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-gray-500" />
                        )}
                      </h3>
                      <p className="text-gray-400 text-sm">{info.description}</p>
                    </div>
                  </div>
                  
                  {/* Quick Actions - Show if connected OR extension ready */}
                  {((connection.connected && !isExpired) || (isExtensionReady && connection.marketplace === 'ebay')) && (
                    <Button
                      onClick={() => handleImportFromMarketplace(connection.marketplace)}
                      variant="primary"
                      size="sm"
                      disabled={isImporting}
                      className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border-0"
                    >
                      <Import className={`h-4 w-4 ${isImporting ? 'animate-bounce' : ''}`} />
                      {isImporting ? 'Importing...' : 'Import Items'}
                    </Button>
                  )}
                </div>

                {/* Connection Status */}
                <div className="space-y-3">
                  {connection.connected && !isExpired ? (
                    <>
                      {/* Connected Info */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                          <div className="flex items-center gap-2 mb-1">
                            <Cookie className="h-4 w-4 text-purple-400" />
                            <span className="text-xs text-gray-400">Cookies</span>
                          </div>
                          <div className="text-lg font-bold text-white">
                            {extStatus?.cookieCount ?? connection.cookieCount ?? 0}
                          </div>
                          <div className="text-[10px] text-gray-500 mt-1">
                            {extStatus?.lastSource ? `Source: ${extStatus.lastSource}` : 'Stored copy'}
                          </div>
                        </div>

                        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-blue-400" />
                            <span className="text-xs text-gray-400">Last Capture</span>
                          </div>
                          <div className="text-sm font-semibold text-white">
                            {extStatus?.lastSync ? formatTimestamp(extStatus.lastSync) : formatTimeAgo(connection.lastValidated)}
                          </div>
                          {extStatus?.lastError && (
                            <div className="text-[10px] text-red-400 mt-1 truncate">{extStatus.lastError}</div>
                          )}
                        </div>

                        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                          <div className="flex items-center gap-2 mb-1">
                            <Shield className="h-4 w-4 text-green-400" />
                            <span className="text-xs text-gray-400">Expires</span>
                          </div>
                          <div className={`text-sm font-semibold ${
                            formatExpiresIn(connection.expiresAt) === 'Expired' 
                              ? 'text-red-400' 
                              : 'text-white'
                          }`}>
                            {formatExpiresIn(connection.expiresAt)}
                          </div>
                        </div>

                        {connection.email && (
                          <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                            <div className="text-xs text-gray-400 mb-1">Email</div>
                            <div className="text-sm font-semibold text-white truncate">
                              {connection.email}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3 pt-2">
                        <Button
                          onClick={() => handleSyncCookies(connection.marketplace)}
                          variant="primary"
                          size="sm"
                          disabled={isSyncing}
                          className="flex-1 flex items-center justify-center gap-2"
                        >
                          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                          {isSyncing ? 'Syncing...' : 'Re-Sync Cookies'}
                        </Button>
                        <Button
                          onClick={() => openMarketplace(info.url)}
                          variant="secondary"
                          size="sm"
                          className="flex-1 flex items-center justify-center gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open {info.name}
                        </Button>
                        <Button
                          onClick={() => handleDisconnect(connection.marketplace)}
                          variant="secondary"
                          size="sm"
                          className="px-6 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          Disconnect
                        </Button>
                      </div>
                    </>
                  ) : isExpired ? (
                    <>
                      {/* Expired State */}
                      <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-yellow-400 mb-2">
                          <AlertCircle className="h-5 w-5" />
                          <span className="font-semibold">Connection Expired</span>
                        </div>
                        <p className="text-sm text-gray-300 mb-4">
                          Your cookies have expired. Visit {info.name} to refresh them, then click Re-Sync.
                        </p>
                        <div className="flex gap-3">
                           <Button
                            onClick={() => handleSyncCookies(connection.marketplace)}
                            variant="primary"
                            size="sm"
                            disabled={isSyncing}
                            className="flex-1 flex items-center justify-center gap-2"
                          >
                            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? 'Syncing...' : 'Re-Sync'}
                          </Button>
                          <Button
                            onClick={() => openMarketplace(info.url)}
                            variant="secondary"
                            size="sm"
                            className="flex-1 flex items-center justify-center gap-2"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open {info.name}
                          </Button>
                          <Button
                            onClick={() => handleDisconnect(connection.marketplace)}
                            variant="secondary"
                            size="sm"
                            className="px-6 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Not Connected State */}
                      <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-gray-400 mb-2">
                          {isExtensionReady ? (
                            <CheckCircle className="h-5 w-5 text-purple-400" />
                          ) : (
                            <XCircle className="h-5 w-5 text-gray-500" />
                          )}
                          <span className="font-semibold">
                            {isExtensionReady ? 'Extension Ready' : 'Not Connected'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mb-4">
                          {isExtensionReady 
                            ? `Click "Login & Capture" to open ${info.name} and automatically save your session.`
                            : `Install extension first, then use "Login & Capture" to connect.`
                          }
                        </p>
                        
                        {/* If login window is open for this marketplace */}
                        {loginWindows[connection.marketplace] && (
                          <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                            <p className="text-sm text-yellow-400 font-medium mb-2">
                              🔐 Login window is open
                            </p>
                            <p className="text-xs text-yellow-300/80 mb-3">
                              We'll automatically capture cookies in a few seconds, or click below when you're logged in.
                            </p>
                            <Button
                              onClick={(e) => handleCaptureNow(connection.marketplace, e)}
                              variant="primary"
                              size="sm"
                              className="w-full bg-yellow-600 hover:bg-yellow-700"
                              type="button"
                            >
                              Capture Cookies Now
                            </Button>
                          </div>
                        )}

                        <div className="flex gap-3">
                          <Button
                            onClick={() => handleLoginAndSync(connection.marketplace)}
                            variant="primary"
                            size="sm"
                            disabled={isSyncing || !!loginWindows[connection.marketplace]}
                            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                            type="button"
                          >
                            <Shield className="h-4 w-4" />
                            {loginWindows[connection.marketplace] ? 'Login Window Open' : 'Login & Capture'}
                          </Button>
                          <Button
                            onClick={() => handleSyncCookies(connection.marketplace)}
                            variant="secondary"
                            size="sm"
                            disabled={isSyncing}
                            className="flex items-center justify-center gap-2"
                            title="Manual sync if you're already logged in"
                          >
                            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? 'Syncing...' : 'Manual Sync'}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Help Section */}
      <div className="p-6 pb-24">
        <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-700/30 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-purple-400" />
            How to Connect
          </h3>
          <ol className="space-y-3 text-sm text-gray-300">
            <li className="flex gap-3">
              <span className="text-purple-400 font-bold min-w-[24px]">1.</span>
              <div>
                <div className="font-semibold text-white mb-1">Install Extension</div>
                <div>Click "Download Extension" above. Unzip and load in <span className="font-mono bg-gray-900 px-1 rounded">chrome://extensions</span></div>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="text-purple-400 font-bold min-w-[24px]">2.</span>
              <div>
                <div className="font-semibold text-white mb-1">Auto-Connect</div>
                <div>Reload this page. The extension should automatically connect. If not, enter the ID manually.</div>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="text-purple-400 font-bold min-w-[24px]">3.</span>
              <div>
                <div className="font-semibold text-white mb-1">Visit Marketplace</div>
                <div>Log in to eBay, Poshmark, or Depop in another tab. The extension will capture your session.</div>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="text-purple-400 font-bold min-w-[24px]">4.</span>
              <div>
                <div className="font-semibold text-white mb-1">Sync</div>
                <div>Come back here and click "Sync Cookies" on the marketplace card.</div>
              </div>
            </li>
          </ol>
        </div>
      </div>

      <DiagnosticsModal 
        open={isDiagnosticsOpen} 
        onClose={() => setIsDiagnosticsOpen(false)} 
        report={diagnosticsReport}
        isLoading={diagnosticsLoading}
        onRunDiagnostics={handleRunDiagnostics}
      />
    </div>
  );
};
