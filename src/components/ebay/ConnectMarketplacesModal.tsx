import { useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useEbayStore } from '../../store/useEbayStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ShoppingBag, AlertCircle } from 'lucide-react';

interface ConnectMarketplacesModalProps {
  open: boolean;
  onClose: () => void;
  onImportClick: () => void;
}

export const ConnectMarketplacesModal = ({ 
  open, 
  onClose,
  onImportClick 
}: ConnectMarketplacesModalProps) => {
  const { isConnected, isLoading, checkConnection, connectEbay, disconnect } = useEbayStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (open && user) {
      checkConnection(user.id);
    }
  }, [open, user, checkConnection]);

  const handleConnect = async () => {
    if (user) {
      await connectEbay(user.id);
    }
  };

  const handleDisconnect = async () => {
    if (user) {
      await disconnect(user.id);
    }
  };

  const handleImport = () => {
    onClose();
    onImportClick();
  };

  return (
    <Modal open={open} onOpenChange={onClose} title="Connected Marketplaces">
      <div className="space-y-6">
        {/* eBay Section */}
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-3">
                <ShoppingBag className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">eBay</h3>
                <p className="mt-1 text-sm text-gray-400">
                  Import your active listings
                </p>
              </div>
            </div>
            
            {isConnected && (
              <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
                Connected
              </span>
            )}
          </div>

          {isConnected ? (
            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                <Button
                  onClick={handleImport}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Import Now
                </Button>
                <Button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  variant="secondary"
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <Button
                onClick={handleConnect}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Connecting...' : 'Connect eBay Account'}
              </Button>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-500/10 p-3">
                <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-300">
                  You'll be redirected to eBay to authorize access to your listings. 
                  We'll only import data you select.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Coming Soon Section */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-400">Coming Soon</h4>
          
          <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 opacity-50">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-700/50 p-2">
                <ShoppingBag className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <h5 className="text-sm font-medium text-gray-400">Poshmark</h5>
                <p className="text-xs text-gray-500">Import from Poshmark</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 opacity-50">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-700/50 p-2">
                <ShoppingBag className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <h5 className="text-sm font-medium text-gray-400">Mercari</h5>
                <p className="text-xs text-gray-500">Import from Mercari</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};



