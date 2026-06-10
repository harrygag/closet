import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { ebayService, EbayConnectionStatus, SyncResult } from '../services/ebayService';
import { Loader2, CheckCircle, XCircle, RefreshCw, Unlink } from 'lucide-react';
import { toast } from 'sonner';

interface EbayConnectorProps {
  onSyncComplete?: () => void;
}

export const EbayConnector: React.FC<EbayConnectorProps> = ({ onSyncComplete }) => {
  const [status, setStatus] = useState<EbayConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Check connection status on mount
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const connectionStatus = await ebayService.checkConnection();
      setStatus(connectionStatus);
    } catch (error) {
      console.error('Failed to check eBay connection:', error);
      setStatus({
        connected: false,
        hasToken: false,
        lastSync: null,
        tokenExpiry: null,
      });
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      await ebayService.connectAccount();
      toast.success('eBay account connected successfully!');
      await checkConnectionStatus();
    } catch (error: any) {
      console.error('Failed to connect eBay:', error);
      toast.error(error.message || 'Failed to connect eBay account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await ebayService.syncListings();
      setSyncResult(result);

      if (result.success) {
        toast.success(`Synced ${result.imported + result.updated} listings from eBay`);
        if (onSyncComplete) {
          onSyncComplete();
        }
        await checkConnectionStatus();
      }
    } catch (error: any) {
      console.error('Failed to sync eBay listings:', error);
      toast.error(error.message || 'Failed to sync eBay listings');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your eBay account?')) {
      return;
    }

    setIsLoading(true);
    try {
      await ebayService.disconnect();
      toast.success('eBay account disconnected');
      setStatus({
        connected: false,
        hasToken: false,
        lastSync: null,
        tokenExpiry: null,
      });
      setSyncResult(null);
    } catch (error: any) {
      console.error('Failed to disconnect eBay:', error);
      toast.error(error.message || 'Failed to disconnect eBay account');
    } finally {
      setIsLoading(false);
    }
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {status.connected ? (
              <CheckCircle className="h-6 w-6 text-green-500" />
            ) : (
              <XCircle className="h-6 w-6 text-gray-500" />
            )}
            <div>
              <h3 className="font-semibold text-white">
                {status.connected ? 'eBay Connected' : 'eBay Not Connected'}
              </h3>
              {status.connected && status.lastSync && (
                <p className="text-sm text-gray-400">
                  Last synced: {new Date(status.lastSync).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {status.connected ? (
              <>
                <Button
                  onClick={handleSync}
                  disabled={isSyncing || isLoading}
                  variant="primary"
                  size="sm"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Listings
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleDisconnect}
                  disabled={isLoading || isSyncing}
                  variant="secondary"
                  size="sm"
                >
                  <Unlink className="mr-2 h-4 w-4" />
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={isLoading}
                variant="primary"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect eBay'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Sync Results */}
      {syncResult && (
        <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
          <h4 className="mb-3 font-semibold text-white">Sync Results</h4>
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded bg-gray-800 p-3 text-center">
              <div className="text-2xl font-bold text-white">{syncResult.total}</div>
              <div className="text-xs text-gray-400">Total</div>
            </div>
            <div className="rounded bg-green-900/30 p-3 text-center">
              <div className="text-2xl font-bold text-green-500">{syncResult.imported}</div>
              <div className="text-xs text-gray-400">Imported</div>
            </div>
            <div className="rounded bg-blue-900/30 p-3 text-center">
              <div className="text-2xl font-bold text-blue-500">{syncResult.updated}</div>
              <div className="text-xs text-gray-400">Updated</div>
            </div>
            <div className="rounded bg-gray-800 p-3 text-center">
              <div className="text-2xl font-bold text-gray-500">{syncResult.skipped}</div>
              <div className="text-xs text-gray-400">Skipped</div>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-900/10 p-3 text-sm text-yellow-200">
        <p className="font-semibold">How it works:</p>
        <ol className="ml-4 mt-2 list-decimal space-y-1 text-yellow-200/80">
          <li>Click "Connect eBay" to authorize access to your eBay account</li>
          <li>Complete the OAuth flow in the popup window</li>
          <li>Click "Sync Listings" to import your eBay inventory</li>
          <li>Your listings will be automatically synced to your inventory</li>
        </ol>
      </div>
    </div>
  );
};
