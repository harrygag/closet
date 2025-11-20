import React, { useState, useEffect } from 'react';
import { ExternalLink, CheckCircle, XCircle, RefreshCw, Cookie, Shield, Clock, AlertCircle, Chrome, Key, HelpCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { supabase } from '../lib/supabase/client';
import { toast } from 'sonner';

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
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    const storedId = localStorage.getItem('extension_id');
    if (storedId) setExtensionId(storedId);
    loadConnections();

    // Listen for extension ID broadcast
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'CLOSET_EXTENSION_ID' && event.data.extensionId) {
        const id = event.data.extensionId;
        if (id !== extensionId) {
          setExtensionId(id);
          localStorage.setItem('extension_id', id);
          toast.success('Extension detected automatically!');
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleExtensionIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.trim();
    setExtensionId(newValue);
    localStorage.setItem('extension_id', newValue);
  };

  const loadConnections = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('user_marketplace_credentials')
        .select('marketplace, last_validated_at, expires_at, email, cookies_encrypted')
        .eq('user_uuid', session.user.id);

      if (error) throw error;

      // Map all marketplaces to connection status
      const allMarketplaces: MarketplaceConnection[] = ['ebay', 'poshmark', 'depop'].map(mp => {
        const cred = (data as MarketplaceCredential[] | null)?.find(c => c.marketplace === mp);
        const now = new Date();
        const expiresAt = cred?.expires_at ? new Date(cred.expires_at) : null;
        const isExpired = expiresAt ? now > expiresAt : false;

        return {
          marketplace: mp as any,
          connected: !!cred && !!cred.cookies_encrypted && !isExpired,
          lastValidated: cred?.last_validated_at,
          expiresAt: cred?.expires_at,
          email: cred?.email,
          cookieCount: cred?.cookies_encrypted ? JSON.parse(cred.cookies_encrypted).length : 0,
        };
      });

      setConnections(allMarketplaces);
    } catch (error: any) {
      console.error('Error loading connections:', error);
      toast.error('Failed to load marketplace connections');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCookies = async (marketplace: string) => {
    if (!extensionId) {
      toast.error('Please enter your Extension ID first');
      return;
    }

    setSyncing(marketplace);
    const toastId = toast.loading(`Connecting to extension for ${marketplaceData[marketplace as keyof typeof marketplaceData].name}...`);

    try {
      // Check if chrome runtime is available
      if (!(window as any).chrome || !(window as any).chrome.runtime) {
        throw new Error('Chrome runtime not found. Are you in Chrome?');
      }

      // Send message to extension
      (window as any).chrome.runtime.sendMessage(
        extensionId,
        { type: 'GET_MARKETPLACE_COOKIES', marketplace },
        async (response: any) => {
          // Handle Chrome runtime errors (e.g., extension not installed or wrong ID)
          if ((window as any).chrome.runtime.lastError) {
            console.error('Extension Error:', (window as any).chrome.runtime.lastError);
            toast.error('Could not connect to extension', {
              id: toastId,
              description: 'Check if the Extension ID is correct and the extension is installed.'
            });
            setSyncing(null);
            return;
          }

          if (response && response.success) {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) throw new Error('No session found');

              // Upsert credentials to Supabase
              const { error } = await (supabase
                .from('user_marketplace_credentials') as any)
                .upsert({
                  user_uuid: session.user.id,
                  marketplace: marketplace,
                  cookies_encrypted: JSON.stringify(response.cookies),
                  last_validated_at: new Date().toISOString(),
                  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Approx 30 days
                }, {
                  onConflict: 'user_uuid,marketplace'
                });

              if (error) throw error;

              toast.success(`Successfully synced ${marketplaceData[marketplace as keyof typeof marketplaceData].name}!`, { id: toastId });
              loadConnections();
            } catch (err: any) {
              console.error('Supabase Error:', err);
              toast.error('Failed to save credentials', { id: toastId, description: err.message });
            }
          } else {
            toast.error('Sync failed', { 
              id: toastId, 
              description: response?.error || 'No cookies found. Please visit the marketplace first.' 
            });
          }
          setSyncing(null);
        }
      );
    } catch (error: any) {
      console.error('Sync Error:', error);
      toast.error('Sync error', { id: toastId, description: error.message });
      setSyncing(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadConnections();
    setRefreshing(false);
    toast.success('Connections refreshed');
  };

  const handleDisconnect = async (marketplace: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/marketplace/save-credentials', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ marketplace }),
      });

      if (!response.ok) throw new Error('Failed to disconnect');

      toast.success(`Disconnected from ${marketplaceData[marketplace as keyof typeof marketplaceData].name}`);
      await loadConnections();
    } catch (error: any) {
      toast.error(error.message || 'Failed to disconnect');
    }
  };

  const openMarketplace = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">🔗 Marketplaces</h1>
              <p className="text-gray-400">Passive cookie sync via Chrome extension</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleDownloadExtension}
                variant="primary"
                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                <Chrome className="h-4 w-4" />
                Download Extension
              </Button>
              <Button
                onClick={handleRefresh}
                variant="secondary"
                disabled={refreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Extension Configuration */}
          <div className="mt-6 bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                {extensionId ? <CheckCircle className="h-6 w-6 text-green-400" /> : <Key className="h-6 w-6 text-purple-400" />}
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">Extension Connection</h3>
                {extensionId ? (
                  <div className="text-sm text-green-400 flex items-center gap-2">
                     Extension linked successfully. ID: <span className="font-mono bg-gray-900 px-1 rounded text-gray-400">{extensionId.substring(0, 8)}...</span>
                     <button onClick={() => setExtensionId('')} className="text-xs text-gray-500 underline hover:text-gray-300">Change</button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-400 mb-2">
                      Install the extension and reload this page to auto-connect. Or enter ID manually:
                    </p>
                    <input
                      type="text"
                      value={extensionId}
                      onChange={handleExtensionIdChange}
                      placeholder="Extension ID (auto-detected if installed)"
                      className="w-full max-w-xl bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors font-mono text-sm"
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-3 gap-4">
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
                            {connection.cookieCount || 0}
                          </div>
                        </div>

                        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-blue-400" />
                            <span className="text-xs text-gray-400">Last Used</span>
                          </div>
                          <div className="text-sm font-semibold text-white">
                            {formatTimeAgo(connection.lastValidated)}
                          </div>
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
                          <XCircle className="h-5 w-5" />
                          <span className="font-semibold">Not Connected</span>
                        </div>
                        <p className="text-sm text-gray-400 mb-4">
                          Install extension, visit {info.name}, then click Sync.
                        </p>
                        <div className="flex gap-3">
                          <Button
                            onClick={() => handleSyncCookies(connection.marketplace)}
                            variant="primary"
                            size="sm"
                            disabled={isSyncing}
                            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600"
                          >
                            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? 'Syncing...' : 'Sync Cookies'}
                          </Button>
                          <Button
                            onClick={() => openMarketplace(info.url)}
                            variant="secondary"
                            size="sm"
                            className="px-6 flex items-center gap-2"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open
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
    </div>
  );
};

