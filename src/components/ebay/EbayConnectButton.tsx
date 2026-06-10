import { useState, useEffect } from 'react';
import { ShoppingBag, ChevronDown } from 'lucide-react';
import { useEbayStore } from '../../store/useEbayStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Button } from '../ui/Button';

interface EbayConnectButtonProps {
  onImportClick: () => void;
  onSettingsClick: () => void;
}

export const EbayConnectButton = ({ onImportClick, onSettingsClick }: EbayConnectButtonProps) => {
  const { isConnected, checkConnection } = useEbayStore();
  const { user } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (user) {
      checkConnection(user.id);
    }
  }, [user, checkConnection]);

  const handleButtonClick = () => {
    if (isConnected) {
      setShowDropdown(!showDropdown);
    } else {
      onSettingsClick();
    }
  };

  return (
    <div className="relative">
      <Button
        onClick={handleButtonClick}
        variant="secondary"
        size="lg"
        className="border border-gray-600"
      >
        <ShoppingBag className="h-5 w-5" />
        <span className="ml-2 hidden sm:inline">
          {isConnected ? 'eBay' : 'Connect eBay'}
        </span>
        {isConnected && (
          <>
            <span className="ml-1 text-green-400">✓</span>
            <ChevronDown className="ml-1 h-4 w-4" />
          </>
        )}
      </Button>

      {showDropdown && isConnected && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
            <button
              onClick={() => {
                setShowDropdown(false);
                onImportClick();
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-700 rounded-t-lg transition-colors"
            >
              Import from eBay
            </button>
            <button
              onClick={() => {
                setShowDropdown(false);
                onSettingsClick();
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-700 rounded-b-lg transition-colors border-t border-gray-700"
            >
              Marketplace Settings
            </button>
          </div>
        </>
      )}
    </div>
  );
};



