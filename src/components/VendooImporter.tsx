import React, { useState, useEffect } from 'react';
import { X, Lock, Download, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { Button } from './ui/Button';
import { useVendooStore } from '../store/useVendooStore';

interface VendooImporterProps {
  open: boolean;
  onClose: () => void;
}

export const VendooImporter: React.FC<VendooImporterProps> = ({ open, onClose }) => {
  const {
    hasCredentials,
    isCheckingCredentials,
    items,
    isLoading,
    error,
    lastScrapedAt,
    checkCredentials,
    saveCredentials,
    deleteCredentials,
    fetchVendooLinks,
    clearError,
  } = useVendooStore();

  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (open) {
      checkCredentials();
    }
  }, [open, checkCredentials]);

  if (!open) return null;

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    
    if (!email || !password) {
      setSaveError('Please enter both email and password');
      return;
    }

    try {
      await saveCredentials(email, password);
      setEmail('');
      setPassword('');
      setShowCredentialsForm(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save credentials');
    }
  };

  const handleFetchLinks = async () => {
    try {
      await fetchVendooLinks();
    } catch (error) {
      // Error is handled in store
    }
  };

  const handleDeleteCredentials = async () => {
    if (confirm('Are you sure you want to delete your Vendoo credentials?')) {
      try {
        await deleteCredentials();
      } catch (error) {
        // Error is handled in store
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-gray-800 border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-6 py-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Vendoo Importer</h2>
            <p className="text-sm text-gray-400">
              Automatically fetch your Vendoo inventory links
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Error Alert */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/50 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
              <button
                onClick={clearError}
                className="text-red-400 hover:text-red-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Credentials Section */}
          {isCheckingCredentials ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="text-gray-400 mt-4">Checking credentials...</p>
            </div>
          ) : !hasCredentials || showCredentialsForm ? (
            <div className="rounded-lg bg-gray-900 border border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Lock className="h-5 w-5 text-blue-400" />
                <h3 className="text-lg font-semibold text-white">
                  {hasCredentials ? 'Update Credentials' : 'Save Vendoo Credentials'}
                </h3>
              </div>
              
              <form onSubmit={handleSaveCredentials} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Vendoo Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your-email@example.com"
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Vendoo Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {saveError && (
                  <p className="text-red-400 text-sm">{saveError}</p>
                )}

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1"
                  >
                    {isLoading ? 'Saving...' : 'Save Credentials'}
                  </Button>
                  
                  {hasCredentials && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowCredentialsForm(false)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </form>

              <p className="text-xs text-gray-500 mt-4">
                🔒 Your credentials are encrypted and stored securely. They are only used to fetch your inventory.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-gray-900 border border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <h3 className="text-lg font-semibold text-white">
                    Vendoo Connected
                  </h3>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCredentialsForm(true)}
                  >
                    Update
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDeleteCredentials}
                    className="text-red-400 hover:text-red-300"
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleFetchLinks}
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                <Download className="h-5 w-5 mr-2" />
                {isLoading ? 'Fetching from Vendoo...' : 'Fetch Inventory Links'}
              </Button>

              {lastScrapedAt && (
                <p className="text-xs text-gray-500 mt-3 text-center">
                  Last fetched: {new Date(lastScrapedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Results Section */}
          {items.length > 0 && (
            <div className="rounded-lg bg-gray-900 border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Fetched Items ({items.length})
              </h3>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-lg bg-gray-800 border border-gray-700 p-4 flex items-start gap-4 hover:border-gray-600 transition-colors"
                  >
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-16 h-16 rounded object-cover flex-shrink-0"
                      />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium truncate">
                        {item.title}
                      </h4>
                      {item.price && (
                        <p className="text-green-400 text-sm mt-1">
                          {item.price}
                        </p>
                      )}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 mt-2"
                      >
                        View on Vendoo
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-700">
                <p className="text-sm text-gray-400 mb-3">
                  Import these {items.length} items to your inventory?
                </p>
                <Button
                  className="w-full"
                  onClick={() => {
                    // TODO: Implement import to Item table
                    alert('Import functionality coming next!');
                  }}
                >
                  Import to Inventory
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

