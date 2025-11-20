import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { supabase } from '../lib/supabase/client';
import { Loader2, Download, Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface MarketplaceImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

type Marketplace = 'ebay' | 'poshmark' | 'depop';
type Action = 'import' | 'fill-links';

interface ScrapeResult {
  success: boolean;
  scrapedCount: number;
  importedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errors?: string[];
  items?: Array<{
    title: string;
    action: string;
    itemId?: string;
    similarity?: number;
  }>;
}

export const MarketplaceImporter: React.FC<MarketplaceImporterProps> = ({
  open,
  onOpenChange,
  onImportComplete,
}) => {
  const [selectedMarketplace, setSelectedMarketplace] = useState<Marketplace>('ebay');
  const [selectedAction, setSelectedAction] = useState<Action>('fill-links');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shopUrl, setShopUrl] = useState('');
  const [saveCredentials, setSaveCredentials] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  const handleScrape = async () => {
    if (!username && !shopUrl) {
      toast.error('Please enter credentials or shop URL');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to continue');
        return;
      }

      // Save credentials if requested
      if (saveCredentials && username && password) {
        const { error: saveError } = await fetch('/api/marketplace/save-credentials', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            marketplace: selectedMarketplace,
            email: username,
            password: password,
          }),
        }).then(res => res.json());

        if (saveError) {
          console.error('Failed to save credentials:', saveError);
        } else {
          toast.success('Credentials saved securely');
        }
      }

      // Trigger scraping
      const endpoint = `/api/${selectedMarketplace}/scrape-listings`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: selectedAction,
          username: username || undefined,
          password: password || undefined,
          shopUrl: shopUrl || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Scraping failed');
      }

      setResult(data);
      
      if (data.success) {
        const message = selectedAction === 'import'
          ? `Imported ${data.importedCount} new items`
          : `Updated ${data.updatedCount} items with ${selectedMarketplace} URLs`;
        toast.success(message);
        
        if (onImportComplete) {
          onImportComplete();
        }
      }
    } catch (error: any) {
      console.error('Scraping error:', error);
      toast.error(error.message || 'Failed to scrape marketplace');
      setResult({
        success: false,
        scrapedCount: 0,
        errors: [error.message],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const marketplaceInfo = {
    ebay: {
      name: 'eBay',
      color: 'bg-yellow-600',
      description: 'Scrape your eBay seller hub listings',
    },
    poshmark: {
      name: 'Poshmark',
      color: 'bg-pink-600',
      description: 'Import items from your Poshmark closet',
    },
    depop: {
      name: 'Depop',
      color: 'bg-red-600',
      description: 'Scrape your Depop shop listings',
    },
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Marketplace Importer"
      size="lg"
    >
      <div className="space-y-4">
        {/* Marketplace Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">Select Marketplace</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(marketplaceInfo) as Marketplace[]).map((marketplace) => (
              <button
                key={marketplace}
                onClick={() => setSelectedMarketplace(marketplace)}
                className={`rounded-lg p-3 text-center transition-all ${
                  selectedMarketplace === marketplace
                    ? `${marketplaceInfo[marketplace].color} text-white shadow-lg`
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <div className="font-bold">{marketplaceInfo[marketplace].name}</div>
                <div className="mt-1 text-xs">{marketplaceInfo[marketplace].description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Action Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">Action</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectedAction('fill-links')}
              className={`flex items-center justify-center gap-2 rounded-lg p-3 transition-all ${
                selectedAction === 'fill-links'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Link2 className="h-4 w-4" />
              Fill Links Only
            </button>
            <button
              onClick={() => setSelectedAction('import')}
              className={`flex items-center justify-center gap-2 rounded-lg p-3 transition-all ${
                selectedAction === 'import'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Download className="h-4 w-4" />
              Import New Items
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {selectedAction === 'fill-links'
              ? 'Match scraped items to existing inventory and add marketplace URLs'
              : 'Create new items from scraped listings (skips duplicates)'}
          </p>
        </div>

        {/* Credentials Input */}
        <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
          <h3 className="text-sm font-medium text-gray-300">Credentials</h3>
          
          {selectedMarketplace === 'depop' && (
            <Input
              label="Shop URL (Optional)"
              type="url"
              value={shopUrl}
              onChange={(e) => setShopUrl(e.target.value)}
              placeholder="https://depop.com/@username"
            />
          )}
          
          <Input
            label={`${marketplaceInfo[selectedMarketplace].name} Username/Email`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username@example.com"
            disabled={!!shopUrl}
          />
          
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={!!shopUrl}
          />

          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={saveCredentials}
              onChange={(e) => setSaveCredentials(e.target.checked)}
              className="rounded"
            />
            Save credentials securely (encrypted)
          </label>
        </div>

        {/* Start Scraping Button */}
        <Button
          onClick={handleScrape}
          disabled={isLoading}
          className="w-full"
          variant="primary"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Scraping {marketplaceInfo[selectedMarketplace].name}...
            </>
          ) : (
            `Start Scraping ${marketplaceInfo[selectedMarketplace].name}`
          )}
        </Button>

        {/* Results */}
        {result && (
          <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <h3 className="font-semibold text-green-500">Scraping Complete</h3>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <h3 className="font-semibold text-red-500">Scraping Failed</h3>
                </>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Scraped:</span>
                <span className="font-medium text-white">{result.scrapedCount}</span>
              </div>
              {result.importedCount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Imported:</span>
                  <span className="font-medium text-green-500">{result.importedCount}</span>
                </div>
              )}
              {result.updatedCount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Updated:</span>
                  <span className="font-medium text-blue-500">{result.updatedCount}</span>
                </div>
              )}
              {result.skippedCount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Skipped:</span>
                  <span className="font-medium text-gray-500">{result.skippedCount}</span>
                </div>
              )}
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="mt-3 rounded bg-red-900/20 p-2">
                <p className="text-xs font-semibold text-red-400">Errors:</p>
                <ul className="mt-1 space-y-1 text-xs text-red-300">
                  {result.errors.slice(0, 5).map((error, idx) => (
                    <li key={idx}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.items && result.items.length > 0 && (
              <div className="mt-3 max-h-48 overflow-y-auto">
                <p className="mb-2 text-xs font-semibold text-gray-400">Processed Items:</p>
                <div className="space-y-1">
                  {result.items.slice(0, 10).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded bg-gray-800 p-2 text-xs">
                      <span className="truncate text-gray-300">{item.title}</span>
                      <div className="flex items-center gap-2">
                        {item.similarity && (
                          <span className="text-green-400">{(item.similarity * 100).toFixed(0)}%</span>
                        )}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          item.action === 'imported' ? 'bg-green-600/20 text-green-400' : 'bg-blue-600/20 text-blue-400'
                        }`}>
                          {item.action}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end gap-2 border-t border-gray-700 pt-3">
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
              setResult(null);
            }}
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

