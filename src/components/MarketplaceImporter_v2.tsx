import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { supabase } from '../lib/supabase/client';
import { Loader2, Download, Link2, CheckCircle2, AlertCircle, Cookie, ExternalLink, Info } from 'lucide-react';
import { toast } from 'sonner';

interface MarketplaceImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

type Marketplace = 'ebay' | 'poshmark' | 'depop';
type Action = 'import' | 'fill-links';
type AuthMethod = 'cookies' | 'password';

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
  const [authMethod, setAuthMethod] = useState<AuthMethod>('cookies');
  
  // Cookie-based auth
  const [cookiesJson, setCookiesJson] = useState('');
  
  // Legacy password auth (fallback)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shopUrl, setShopUrl] = useState('');
  
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  const marketplaceInfo = {
    ebay: {
      name: 'eBay',
      url: 'https://www.ebay.com/sh/lst/active',
      cookieGuide: 'Log into eBay Seller Hub, then export cookies',
    },
    poshmark: {
      name: 'Poshmark',
      url: 'https://poshmark.com/closet',
      cookieGuide: 'Log into your Poshmark closet, then export cookies',
    },
    depop: {
      name: 'Depop',
      url: 'https://www.depop.com/',
      cookieGuide: 'Log into your Depop shop, then export cookies',
    },
  };

  const openCookieExporter = () => {
    window.open('/cookie-exporter.html', '_blank', 'width=1000,height=800');
  };

  const openMarketplace = () => {
    const url = marketplaceInfo[selectedMarketplace].url;
    window.open(url, '_blank');
  };

  const validateCookies = (cookiesString: string): boolean => {
    try {
      const parsed = JSON.parse(cookiesString);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        toast.error('Cookies must be a non-empty array');
        return false;
      }
      
      const hasValidFormat = parsed.every(c => 
        c && typeof c === 'object' && c.name && c.value
      );
      
      if (!hasValidFormat) {
        toast.error('Invalid cookie format. Each cookie must have "name" and "value"');
        return false;
      }
      
      return true;
    } catch (err) {
      toast.error('Invalid JSON format');
      return false;
    }
  };

  const handleSaveCookies = async () => {
    if (!cookiesJson) {
      toast.error('Please paste your cookies JSON');
      return;
    }

    if (!validateCookies(cookiesJson)) {
      return;
    }

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to continue');
        return;
      }

      const response = await fetch('/api/marketplace/save-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          marketplace: selectedMarketplace,
          cookies: cookiesJson,
          expiresInDays: 7,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save cookies');
      }

      toast.success(`✅ Saved ${data.data.cookieCount} cookies for ${marketplaceInfo[selectedMarketplace].name}`);
    } catch (error: any) {
      console.error('Error saving cookies:', error);
      toast.error(error.message || 'Failed to save cookies');
    } finally {
      setIsLoading(false);
    }
  };

  const handleScrape = async () => {
    if (authMethod === 'cookies' && !cookiesJson) {
      toast.error('Please paste your cookies or use password authentication');
      return;
    }

    if (authMethod === 'password' && !username) {
      toast.error('Please enter your username/email');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to continue');
        return;
      }

      // Save credentials if requested and using cookies
      if (saveCredentials && authMethod === 'cookies' && cookiesJson) {
        await handleSaveCookies();
      } else if (saveCredentials && authMethod === 'password' && username && password) {
        await fetch('/api/marketplace/save-credentials', {
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
        });
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
          cookies: authMethod === 'cookies' ? cookiesJson : undefined,
          username: authMethod === 'password' ? username : undefined,
          password: authMethod === 'password' ? password : undefined,
          shopUrl: shopUrl || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Scraping failed');
      }

      setResult(data);
      toast.success(`✅ Scraped ${data.scrapedCount} items!`);
      
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (error: any) {
      console.error('Scraping error:', error);
      toast.error(error.message || 'Failed to scrape');
      setResult({
        success: false,
        scrapedCount: 0,
        errors: [error.message],
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="🛍️ Marketplace Importer"
      size="lg"
    >
      <div className="space-y-6">
        {/* Step 1: Select Marketplace */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            1. Select Marketplace
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['ebay', 'poshmark', 'depop'] as Marketplace[]).map((mp) => (
              <button
                key={mp}
                onClick={() => setSelectedMarketplace(mp)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedMarketplace === mp
                    ? 'border-purple-500 bg-purple-500/20'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="font-semibold capitalize">{marketplaceInfo[mp].name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Select Action */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            2. Select Action
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSelectedAction('fill-links')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedAction === 'fill-links'
                  ? 'border-blue-500 bg-blue-500/20'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <Link2 className="mx-auto mb-2 h-6 w-6" />
              <div className="font-semibold">Fill Links</div>
              <div className="text-xs text-gray-400 mt-1">
                Match and add URLs to existing items
              </div>
            </button>
            <button
              onClick={() => setSelectedAction('import')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedAction === 'import'
                  ? 'border-green-500 bg-green-500/20'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <Download className="mx-auto mb-2 h-6 w-6" />
              <div className="font-semibold">Import New</div>
              <div className="text-xs text-gray-400 mt-1">
                Import as new items
              </div>
            </button>
          </div>
        </div>

        {/* Step 3: Authentication Method */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            3. Authentication Method
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setAuthMethod('cookies')}
              className={`p-4 rounded-lg border-2 transition-all ${
                authMethod === 'cookies'
                  ? 'border-purple-500 bg-purple-500/20'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <Cookie className="mx-auto mb-2 h-6 w-6" />
              <div className="font-semibold">Cookies</div>
              <div className="text-xs text-gray-400 mt-1">
                Recommended - more reliable
              </div>
            </button>
            <button
              onClick={() => setAuthMethod('password')}
              className={`p-4 rounded-lg border-2 transition-all ${
                authMethod === 'password'
                  ? 'border-purple-500 bg-purple-500/20'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="font-semibold">Password</div>
              <div className="text-xs text-gray-400 mt-1">
                Legacy method (may fail)
              </div>
            </button>
          </div>
        </div>

        {/* Cookie Auth UI */}
        {authMethod === 'cookies' && (
          <div className="space-y-3">
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-100">
                  <div className="font-semibold mb-2">How to export cookies:</div>
                  <ol className="list-decimal list-inside space-y-1 text-blue-200">
                    <li>Click "Open {marketplaceInfo[selectedMarketplace].name}" below</li>
                    <li>Log into your account if not already logged in</li>
                    <li>Click "Open Cookie Exporter" to export your cookies</li>
                    <li>Paste the JSON here</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={openMarketplace}
                variant="secondary"
                className="flex-1"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open {marketplaceInfo[selectedMarketplace].name}
              </Button>
              <Button
                onClick={openCookieExporter}
                variant="secondary"
                className="flex-1"
              >
                <Cookie className="h-4 w-4 mr-2" />
                Open Cookie Exporter
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Paste Cookies JSON
              </label>
              <textarea
                value={cookiesJson}
                onChange={(e) => setCookiesJson(e.target.value)}
                placeholder='[{"name": "session_id", "value": "abc123", ...}]'
                className="w-full h-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm font-mono"
              />
            </div>

            <Button
              onClick={handleSaveCookies}
              variant="secondary"
              disabled={isLoading || !cookiesJson}
              className="w-full"
            >
              Save Cookies for Future Use
            </Button>
          </div>
        )}

        {/* Password Auth UI */}
        {authMethod === 'password' && (
          <div className="space-y-3">
            <Input
              label="Username/Email"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your@email.com"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            {selectedMarketplace === 'depop' && (
              <Input
                label="Shop URL (optional)"
                type="text"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                placeholder="https://www.depop.com/username/"
              />
            )}
          </div>
        )}

        {/* Save Credentials Checkbox */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={saveCredentials}
            onChange={(e) => setSaveCredentials(e.target.checked)}
            className="rounded border-gray-700"
          />
          <span className="text-sm text-gray-300">
            Save credentials securely for future use
          </span>
        </label>

        {/* Start Scrape Button */}
        <Button
          onClick={handleScrape}
          disabled={isLoading || (authMethod === 'cookies' && !cookiesJson) || (authMethod === 'password' && !username)}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Scraping...
            </>
          ) : (
            'Start Scraping'
          )}
        </Button>

        {/* Results */}
        {result && (
          <div
            className={`p-4 rounded-lg ${
              result.success
                ? 'bg-green-900/20 border border-green-700'
                : 'bg-red-900/20 border border-red-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {result.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400" />
              )}
              <span className="font-semibold">
                {result.success ? 'Success!' : 'Failed'}
              </span>
            </div>
            <div className="text-sm space-y-1">
              <div>Scraped: {result.scrapedCount} items</div>
              {result.importedCount !== undefined && (
                <div>Imported: {result.importedCount} new items</div>
              )}
              {result.updatedCount !== undefined && (
                <div>Updated: {result.updatedCount} items</div>
              )}
              {result.skippedCount !== undefined && (
                <div>Skipped: {result.skippedCount} items</div>
              )}
              {result.errors && result.errors.length > 0 && (
                <div className="mt-2 text-red-300">
                  Errors: {result.errors.join(', ')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};






