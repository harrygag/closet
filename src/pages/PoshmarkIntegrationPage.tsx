/**
 * Poshmark Integration Page
 * Sync and import Poshmark listings via OpenClaw bot
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Package,
  Download,
  AlertCircle,
  CheckCircle,
  ExternalLink as _ExternalLink,
  Clock,
  ShoppingBag,
  Sparkles,
  Eye,
  ArrowRight,
  Upload,
  FileText,
  BarChart3,
  Search,
  DollarSign,
  Link2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { toast } from 'sonner';
import { useAuthStore } from '../store/useAuthStore';
import { useItemStore } from '../store/useItemStore';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import { syncMarketplace, isOpenClawRunning } from '../services/openclawService';
import { PoshmarkListing, importPoshmarkItems } from '../services/poshmark/import';
import {
  parsePoshmarkCSV,
  summarizePoshmarkCSV,
  detectPoshmarkCSVFormat,
  type PoshmarkCsvItem,
  type PoshmarkCsvSummary,
} from '../services/poshmark/csvParser';
import {
  detectMismatches,
  type MismatchResult,
  type PlatformInventory,
} from '../services/inventory/mismatchDetector';
import { PoshmarkSoldModal } from '../components/poshmark/PoshmarkSoldModal';
import { PoshmarkImportModal } from '../components/poshmark/PoshmarkImportModal';
import { LastSoldWidget } from '../components/inventory/LastSoldWidget';
import { NewSalesSinceBaselineWidget } from '../components/inventory/NewSalesSinceBaselineWidget';
import { DelistQueueWidget } from '../components/inventory/DelistQueueWidget';
import { ShouldListWidget } from '../components/inventory/ShouldListWidget';
import { PlatformMatchModal } from '../components/inventory/PlatformMatchModal';

const db = getFirestore(app);

const POSHMARK_PURPLE = '#7B2E8E';

const formatNumber = (num: number): string => num.toLocaleString('en-US');

const formatRelativeTime = (dateString: string | null): string => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

export function PoshmarkIntegrationPage() {
  const { user } = useAuthStore();
  const { items, initializeStore } = useItemStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [poshmarkListings, setPoshmarkListings] = useState<PoshmarkListing[]>([]);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openClawAvailable, setOpenClawAvailable] = useState<boolean | null>(null);
  const [stats, setStats] = useState({
    totalListings: 0,
    importedItems: 0,
    activeListings: 0,
    soldListings: 0,
  });

  // CSV upload state
  const [csvItems, setCsvItems] = useState<PoshmarkCsvItem[]>([]);
  const [csvSummary, setCsvSummary] = useState<PoshmarkCsvSummary | null>(null);
  const [csvFilename, setCsvFilename] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mismatches, setMismatches] = useState<MismatchResult[]>([]);
  const [showMismatches, setShowMismatches] = useState(false);
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CSV file handling
  const handleCsvFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        toast.error('Please upload a CSV file');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const csvData = e.target?.result as string;
        if (!csvData) {
          toast.error('Could not read file');
          return;
        }

        const format = detectPoshmarkCSVFormat(csvData);
        if (format === 'unknown') {
          toast.error(
            'Unrecognized CSV format. Expected Poshmark "My Sales" or "Closet" export.'
          );
          return;
        }

        const parsed = parsePoshmarkCSV(csvData);
        if (parsed.length === 0) {
          toast.error('No items found in CSV');
          return;
        }

        const summary = summarizePoshmarkCSV(parsed, csvData);
        setCsvItems(parsed);
        setCsvSummary(summary);
        setCsvFilename(file.name);
        setMismatches([]);
        setShowMismatches(false);
        toast.success(
          `Parsed ${parsed.length} items from ${format === 'sales' ? 'Sales Report' : 'Closet Export'}`
        );
      };
      reader.onerror = () => toast.error('Failed to read file');
      reader.readAsText(file);
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleCsvFile(file);
    },
    [handleCsvFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleCsvFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [handleCsvFile]
  );

  // Compare CSV items with local inventory for mismatches
  const handleCompareWithInventory = useCallback(() => {
    if (csvItems.length === 0) {
      toast.error('Upload a CSV first');
      return;
    }

    // Convert PoshmarkCsvItem[] to PlatformInventory[] for the mismatch detector
    const platformItems: PlatformInventory[] = csvItems.map((item) => ({
      sku: '', // Poshmark CSVs don't include SKUs
      title: item.title,
      quantity: item.status === 'Sold' ? 0 : 1,
      price: item.priceCents / 100,
      status: item.status === 'Active' ? 'active' : item.status === 'Sold' ? 'sold' : 'ended',
    }));

    const results = detectMismatches(items, null, platformItems, null);
    setMismatches(results);
    setShowMismatches(true);

    const criticalCount = results.filter((r) => r.severity === 'critical').length;
    const warningCount = results.filter((r) => r.severity === 'warning').length;

    if (results.length === 0) {
      toast.success('No mismatches found - inventory looks good!');
    } else {
      toast.info(
        `Found ${results.length} mismatches: ${criticalCount} critical, ${warningCount} warnings`
      );
    }
  }, [csvItems, items]);

  // Check OpenClaw availability on mount
  useEffect(() => {
    isOpenClawRunning().then(setOpenClawAvailable);
  }, []);

  useEffect(() => {
    loadSyncData();
  }, [user]);

  const loadSyncData = async () => {
    if (!user) return;

    try {
      // Try authenticated location first: users/{userId}/marketplaceData/sync
      const syncRef = doc(db, 'users', user.id, 'marketplaceData', 'sync');
      const syncSnapshot = await getDoc(syncRef);

      let syncData = null;

      if (syncSnapshot.exists()) {
        const data = syncSnapshot.data();
        if (data.platform === 'poshmark') {
          syncData = data;
          console.log('[Poshmark] Found authenticated sync data');
        }
      }

      if (!syncData) {
        // Try fallback: marketplaceData/{userId} where platform is poshmark
        const userDocRef = doc(db, 'marketplaceData', user.id);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          if (data.platform === 'poshmark') {
            syncData = data;
            console.log('[Poshmark] Found sync data at marketplaceData/{userId}');
          }
        }
      }

      if (!syncData) {
        // Try scanning all marketplaceData documents for poshmark
        const publicSnapshot = await getDocs(collection(db, 'marketplaceData'));
        for (const docSnap of publicSnapshot.docs) {
          const data = docSnap.data();
          if (data.platform === 'poshmark' && data.listings?.length > 0) {
            syncData = data;
            console.log('[Poshmark] Found public sync data for:', docSnap.id);
            break;
          }
        }
      }

      if (syncData) {
        console.log('[Poshmark] Sync data:', {
          username: syncData.userInfo?.username || syncData.username,
          listingsCount: syncData.listings?.length,
          lastSync: syncData.lastSync || syncData.syncedAt,
        });

        setLastSync(
          syncData.lastSync?.toDate?.()?.toISOString() ||
          syncData.syncedAt?.toDate?.()?.toISOString() ||
          null
        );
        setSavedUsername(syncData.userInfo?.username || syncData.username || null);

        if (syncData.listings && syncData.listings.length > 0) {
          const listings: PoshmarkListing[] = syncData.listings;
          setPoshmarkListings(listings);
          setStats({
            totalListings: listings.length,
            importedItems: items.filter((i: any) => i.poshmarkListingId).length,
            activeListings: listings.filter(
              (l: any) => !l.sold && l.status !== 'sold' && l.status !== 'SOLD'
            ).length,
            soldListings: listings.filter(
              (l: any) => l.sold || l.status === 'sold' || l.status === 'SOLD'
            ).length,
          });
        } else {
          console.log('[Poshmark] No listings in sync data');
        }
      } else {
        console.log('[Poshmark] No sync data found in any location');
      }
    } catch (err) {
      console.error('[Poshmark] Failed to load sync data:', err);
    }
  };

  const handleRefreshSync = async () => {
    // Open Poshmark closet page via link click (bypasses popup blocker)
    const username = savedUsername || 'retrothriftc0';
    const a1 = document.createElement('a');
    a1.href = `https://poshmark.com/closet/${username}?availability=available#autoScroll`;
    a1.target = '_blank';
    a1.rel = 'noopener noreferrer';
    document.body.appendChild(a1);
    a1.click();
    document.body.removeChild(a1);

    // Also open order/sales for sold items after a short delay
    setTimeout(() => {
      const a2 = document.createElement('a');
      a2.href = 'https://poshmark.com/order/sales#autoScroll';
      a2.target = '_blank';
      a2.rel = 'noopener noreferrer';
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
    }, 2000);

    toast.info('Opening Poshmark closet + sales — extension capturing. Refreshing in 20s...');

    // Wait for extension to capture and sync, then reload data
    setIsLoading(true);
    setTimeout(async () => {
      try {
        await loadSyncData();
        toast.success('Refreshed Poshmark data');
      } catch (error) {
        toast.error('Failed to refresh data');
      } finally {
        setIsLoading(false);
      }
    }, 20000);
  };

  const handleSync = async () => {
    const username = usernameInput.trim() || savedUsername || '';
    if (!username) {
      toast.error('Enter your Poshmark username first');
      return;
    }

    // Check if OpenClaw is running before attempting sync
    const running = await isOpenClawRunning();
    setOpenClawAvailable(running);
    if (!running) {
      toast.error('OpenClaw is not running. Start it on localhost:18789 first.');
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncMarketplace('poshmark', username);
      toast.success(`Synced ${result.count} listings from @${username}`);
      await loadSyncData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      toast.error(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === poshmarkListings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(poshmarkListings.map(l => l.listing_id || l.id)));
    }
  };

  const handleImportSelected = async () => {
    if (!user || selectedIds.size === 0) return;
    setIsImporting(true);
    try {
      const toImport = poshmarkListings.filter(l => selectedIds.has(l.listing_id || l.id));
      const result = await importPoshmarkItems(toImport, user.id);
      toast.success(`Imported ${result.imported} items (${result.skipped} already existed)`);
      setSelectedIds(new Set());
      await initializeStore(user.id);
      await loadSyncData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const getListingImage = (listing: PoshmarkListing): string | null => {
    return listing.cover_shot || listing.imageUrl || listing.images?.[0] || null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: [0.8, 1.1, 1] }}
                transition={{ duration: 0.6 }}
              >
                <ShoppingBag className="h-10 w-10" style={{ color: POSHMARK_PURPLE }} />
              </motion.div>
              Poshmark Integration
            </h1>
            <p className="text-gray-400">Import and manage your Poshmark listings</p>
          </div>

          <div className="flex items-center gap-4">
            {savedUsername && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border"
                style={{
                  backgroundColor: `${POSHMARK_PURPLE}1A`,
                  borderColor: `${POSHMARK_PURPLE}4D`,
                }}
              >
                <CheckCircle className="h-5 w-5" style={{ color: POSHMARK_PURPLE }} />
                <span className="font-medium" style={{ color: POSHMARK_PURPLE }}>
                  Synced as @{savedUsername}
                </span>
              </motion.div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshSync}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Total Listings</p>
                  <p className="text-3xl font-bold text-white">{formatNumber(stats.totalListings)}</p>
                </div>
                <ShoppingBag className="h-12 w-12 opacity-50" style={{ color: POSHMARK_PURPLE }} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Active Listings</p>
                  <p className="text-3xl font-bold text-white">{formatNumber(stats.activeListings)}</p>
                </div>
                <Package className="h-12 w-12 text-green-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Sold Listings</p>
                  <p className="text-3xl font-bold text-red-400">
                    {formatNumber(stats.soldListings)}
                  </p>
                </div>
                <Package className="h-12 w-12 text-red-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card
            className="bg-gray-800/50 border-gray-700 cursor-pointer hover:border-green-500/50 transition-all"
            onClick={() => stats.importedItems > 0 && navigate('/closet')}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Imported to App</p>
                  <p className="text-3xl font-bold text-white">{formatNumber(stats.importedItems)}</p>
                  {stats.importedItems > 0 && (
                    <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      Click to view
                    </p>
                  )}
                </div>
                <Download className="h-12 w-12 text-blue-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-gray-800/50 border-gray-700 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" style={{ color: POSHMARK_PURPLE }} />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* OpenClaw Sync */}
              <div
                className="flex items-start gap-3 p-4 rounded-lg border"
                style={{
                  backgroundColor: `${POSHMARK_PURPLE}14`,
                  borderColor: `${POSHMARK_PURPLE}4D`,
                }}
              >
                <Sparkles className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: POSHMARK_PURPLE }} />
                <div className="flex-1">
                  <p className="font-medium mb-1" style={{ color: '#B87BC9' }}>
                    Sync with OpenClaw Bot
                  </p>
                  <p className="text-gray-400 text-sm mb-3">
                    OpenClaw opens your browser and extracts listings from your Poshmark closet.
                    Make sure OpenClaw is running — see{' '}
                    <code className="text-xs" style={{ color: POSHMARK_PURPLE }}>
                      OPENCLAW_SETUP.md
                    </code>
                    .
                  </p>
                  {openClawAvailable === false && (
                    <div className="flex items-center gap-2 mb-3 text-sm text-red-400">
                      <AlertCircle className="h-4 w-4" />
                      OpenClaw is not running on localhost:18789
                    </div>
                  )}
                  {openClawAvailable === true && (
                    <div className="flex items-center gap-2 mb-3 text-sm text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      OpenClaw is running
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={savedUsername || 'your-poshmark-username'}
                      value={usernameInput}
                      onChange={e => setUsernameInput(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none"
                      style={{ '--tw-ring-color': POSHMARK_PURPLE } as React.CSSProperties}
                      onFocus={e => (e.target.style.borderColor = POSHMARK_PURPLE)}
                      onBlur={e => (e.target.style.borderColor = '')}
                    />
                    <Button
                      onClick={handleSync}
                      disabled={isSyncing}
                      className="flex items-center gap-2 whitespace-nowrap"
                      style={{ backgroundColor: POSHMARK_PURPLE }}
                    >
                      <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </Button>
                  </div>
                </div>
              </div>

              {!savedUsername && poshmarkListings.length === 0 && (
                <div className="flex items-start gap-3 p-4 bg-blue-900/10 border border-blue-500/20 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-blue-400 font-medium mb-1">No listings synced yet</p>
                    <p className="text-gray-400 text-sm">
                      Enter your Poshmark username above and click "Sync Now", or use the buttons below.
                    </p>
                  </div>
                </div>
              )}
                <>
                  {stats.importedItems > 0 && (
                    <div className="flex items-center justify-between p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                          <CheckCircle className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                          <p className="text-white font-medium">
                            {stats.importedItems} Items Imported!
                          </p>
                          <p className="text-gray-400 text-sm">
                            View your Poshmark items in your inventory
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => navigate('/closet')}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                      >
                        <Eye className="h-4 w-4" />
                        View Inventory
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {/* Import section */}
                  {poshmarkListings.length > 0 && (
                    <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${POSHMARK_PURPLE}33` }}
                        >
                          <Download className="h-5 w-5" style={{ color: POSHMARK_PURPLE }} />
                        </div>
                        <div>
                          <p className="text-white font-medium">Import Poshmark Listings</p>
                          <p className="text-gray-400 text-sm">
                            {selectedIds.size > 0
                              ? `${selectedIds.size} selected for import`
                              : stats.importedItems > 0
                                ? `${stats.totalListings - stats.importedItems} more available to import`
                                : `Import ${stats.totalListings} listings from your Poshmark closet`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={toggleSelectAll}>
                          {selectedIds.size === poshmarkListings.length ? 'Deselect All' : 'Select All'}
                        </Button>
                        <Button
                          onClick={handleImportSelected}
                          disabled={isImporting || selectedIds.size === 0}
                          className="flex items-center gap-2"
                        >
                          <Package className="h-4 w-4" />
                          {isImporting ? 'Importing...' : 'Import Selected'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Import Poshmark Listings */}
                  <div className="flex items-center justify-between p-4 bg-purple-900/20 border border-purple-500/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                        <Package className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Import Listings</p>
                        <p className="text-gray-400 text-sm">
                          {poshmarkListings.length > 0
                            ? `${poshmarkListings.length} listings available to import`
                            : 'Open your Poshmark closet and import listings'}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => navigate('/import?platform=poshmark')}
                      style={{ backgroundColor: POSHMARK_PURPLE }}
                      className="flex items-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Import Listings
                    </Button>
                  </div>

                  {/* Match Listings — opens the per-card 3-candidate modal */}
                  <div className="flex items-center justify-between p-4 bg-amber-900/20 border border-amber-500/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                        <Link2 className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Match Listings to Inventory</p>
                        <p className="text-gray-400 text-sm">
                          Run the matcher and pick the right inventory item for each Poshmark listing (top 3 candidates per card · per-card reload · manual override).
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => setShowMatchModal(true)}
                      className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700"
                    >
                      <Link2 className="h-4 w-4" />
                      Match
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-red-900/20 border border-red-500/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                        <Download className="h-5 w-5 text-red-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Sold Orders</p>
                        <p className="text-gray-400 text-sm">View and manage your Poshmark sales</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => navigate('/sales?platform=poshmark')}
                      className="flex items-center gap-2"
                      style={{ backgroundColor: POSHMARK_PURPLE }}
                    >
                      <DollarSign className="h-4 w-4" />
                      Manage Sold
                    </Button>
                  </div>

                  {lastSync && (
                    <div className="flex items-center gap-2 text-gray-400 text-sm pt-2">
                      <Clock className="h-4 w-4" />
                      Last synced {formatRelativeTime(lastSync)}
                    </div>
                  )}
                </>
            </div>
          </CardContent>
        </Card>

        {/* ── New Sales Since Calibration (status='pending') ─────── */}
        <div className="mb-4">
          <NewSalesSinceBaselineWidget platform="poshmark" count={8} />
        </div>

        {/* ── Pending Poshmark delistings + auto oversold-cancel ───── */}
        <div className="mb-4">
          <DelistQueueWidget platform="poshmark" />
        </div>

        {/* ── Should list on Poshmark (in stock + no Poshmark binding yet) ── */}
        <div className="mb-4">
          <ShouldListWidget platform="poshmark" />
        </div>

        {/* ── Last Sold Widget ─────────────────────────────────────── */}
        <div className="mb-8">
          <LastSoldWidget platform="poshmark" count={5} />
        </div>

        {/* Listings Preview */}
        {poshmarkListings.length > 0 && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" style={{ color: POSHMARK_PURPLE }} />
                  Poshmark Listings ({poshmarkListings.length})
                </span>
                {selectedIds.size > 0 && (
                  <span className="text-sm font-normal" style={{ color: POSHMARK_PURPLE }}>
                    {selectedIds.size} selected
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {poshmarkListings.slice(0, 9).map(listing => {
                  const listingId = listing.listing_id || listing.id;
                  const imageUrl = getListingImage(listing);
                  const isSold =
                    listing.sold || listing.status === 'sold' || listing.status === 'SOLD';

                  return (
                    <motion.div
                      key={listingId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() =>
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(listingId)) next.delete(listingId);
                          else next.add(listingId);
                          return next;
                        })
                      }
                      className={`bg-gray-700/30 rounded-lg p-4 cursor-pointer transition-all ${
                        selectedIds.has(listingId)
                          ? 'ring-2 bg-purple-900/20'
                          : 'hover:bg-gray-700/50'
                      }`}
                      style={
                        selectedIds.has(listingId)
                          ? { '--tw-ring-color': POSHMARK_PURPLE } as React.CSSProperties
                          : undefined
                      }
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={listing.title}
                          className="w-full h-48 object-cover rounded-lg mb-3"
                          onError={e => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-48 bg-gray-600 rounded-lg mb-3 flex items-center justify-center">
                          <span className="text-gray-400">No image</span>
                        </div>
                      )}
                      <h3 className="text-white font-medium mb-2 line-clamp-2">{listing.title}</h3>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-green-400 font-semibold">
                          ${(typeof listing.price === 'number' ? listing.price : 0).toFixed(2)}
                          {(listing.originalPrice || listing.original_price) &&
                            (listing.originalPrice || listing.original_price) !== listing.price && (
                              <span className="text-gray-500 line-through ml-2 text-xs">
                                $
                                {(listing.originalPrice || listing.original_price || 0).toFixed(2)}
                              </span>
                            )}
                        </span>
                        {isSold && (
                          <span className="text-red-400 text-xs font-medium">SOLD</span>
                        )}
                      </div>
                      {listing.size && (
                        <p className="text-gray-400 text-xs mt-1">Size: {listing.size}</p>
                      )}
                      {listing.brand && (
                        <p className="text-gray-400 text-xs mt-0.5">{listing.brand}</p>
                      )}
                    </motion.div>
                  );
                })}
              </div>
              {poshmarkListings.length > 9 && (
                <p className="text-gray-400 text-sm text-center mt-4">
                  And {poshmarkListings.length - 9} more listings...
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* CSV Upload Section */}
        <Card className="bg-gray-800/50 border-gray-700 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" style={{ color: POSHMARK_PURPLE }} />
              CSV Upload
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm mb-4">
              Upload a Poshmark CSV export — supports both "My Sales" reports and "Closet" exports.
            </p>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Drag and drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center py-10 px-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                isDragging
                  ? 'border-[#7B2E8E] bg-[#7B2E8E]/15'
                  : csvFilename
                    ? 'border-[#7B2E8E]/40 bg-[#7B2E8E]/5'
                    : 'border-gray-600 bg-gray-800/30 hover:border-[#7B2E8E]/60 hover:bg-[#7B2E8E]/5'
              }`}
            >
              {csvFilename ? (
                <>
                  <FileText className="h-8 w-8 mb-2" style={{ color: POSHMARK_PURPLE }} />
                  <p className="text-white font-medium">{csvFilename}</p>
                  <p className="text-gray-400 text-sm mt-1">Click or drop to replace</p>
                </>
              ) : (
                <>
                  <Upload
                    className={`h-8 w-8 mb-2 transition-colors ${isDragging ? 'text-white' : 'text-gray-500'}`}
                    style={isDragging ? { color: POSHMARK_PURPLE } : undefined}
                  />
                  <p className="text-gray-300 font-medium">
                    Drop a Poshmark CSV here or click to browse
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Accepts "My Sales" report or "Closet" export
                  </p>
                </>
              )}
            </div>

            {/* CSV Summary */}
            {csvSummary && (
              <div className="mt-6 space-y-4">
                {/* Format badge */}
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border"
                    style={{
                      backgroundColor: `${POSHMARK_PURPLE}1A`,
                      borderColor: `${POSHMARK_PURPLE}4D`,
                      color: '#B87BC9',
                    }}
                  >
                    <FileText className="h-3 w-3" />
                    {csvSummary.format === 'sales' ? 'Sales Report' : 'Closet Export'}
                  </span>
                  <span className="text-sm text-gray-400">
                    {csvSummary.total} listings found
                  </span>
                </div>

                {/* Breakdown cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-400">{csvSummary.active}</p>
                    <p className="text-xs text-green-400/70">Active</p>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{csvSummary.sold}</p>
                    <p className="text-xs text-red-400/70">Sold</p>
                  </div>
                  <div className="bg-gray-500/10 border border-gray-500/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-gray-400">{csvSummary.notForSale}</p>
                    <p className="text-xs text-gray-400/70">Not For Sale</p>
                  </div>
                </div>

                {/* Compare button */}
                <Button
                  onClick={handleCompareWithInventory}
                  className="flex items-center gap-2 w-full justify-center py-3"
                  style={{ backgroundColor: POSHMARK_PURPLE }}
                >
                  <Search className="h-4 w-4" />
                  Compare with Inventory
                </Button>

                {/* Mismatch results */}
                {showMismatches && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-white">
                        Mismatch Results
                      </span>
                      <span className="text-xs text-gray-500">
                        ({mismatches.length} issue{mismatches.length !== 1 ? 's' : ''})
                      </span>
                    </div>

                    {mismatches.length === 0 ? (
                      <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <span className="text-sm text-green-300">
                          All clear! No mismatches detected.
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {mismatches.map((m, idx) => (
                          <div
                            key={`${m.itemId || m.sku}-${idx}`}
                            className={`flex items-start gap-3 p-3 rounded-xl border ${
                              m.severity === 'critical'
                                ? 'bg-red-500/10 border-red-500/20'
                                : m.severity === 'warning'
                                  ? 'bg-yellow-500/10 border-yellow-500/20'
                                  : 'bg-blue-500/10 border-blue-500/20'
                            }`}
                          >
                            {m.severity === 'critical' ? (
                              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-white font-medium truncate">
                                {m.itemTitle || m.sku}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">{m.details}</p>
                              <span
                                className={`inline-block text-[10px] mt-1 px-1.5 py-0.5 rounded-full border ${
                                  m.severity === 'critical'
                                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                    : m.severity === 'warning'
                                      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                      : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                }`}
                              >
                                {m.type.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Empty state when no listings and no username */}
        {poshmarkListings.length === 0 && !savedUsername && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-12 text-center">
              <ShoppingBag
                className="h-12 w-12 mx-auto mb-4 opacity-40"
                style={{ color: POSHMARK_PURPLE }}
              />
              <p className="text-gray-400 text-lg mb-2">No listings synced yet</p>
              <p className="text-gray-500 text-sm">
                Enter your Poshmark username above and click Sync Now.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <PoshmarkSoldModal
        open={showSoldModal}
        onClose={async () => {
          setShowSoldModal(false);
          setIsLoading(true);
          await loadSyncData();
          if (user) await initializeStore(user.id);
          setIsLoading(false);
        }}
      />

      <PoshmarkImportModal
        open={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          loadSyncData();
          if (user) initializeStore(user.id);
        }}
      />

      {/* Match Modal — 3 candidates per card + per-card reload + manual match */}
      <PlatformMatchModal
        open={showMatchModal}
        platform="poshmark"
        onClose={() => setShowMatchModal(false)}
        onApplied={() => { loadSyncData(); if (user) initializeStore(user.id); }}
      />
    </div>
  );
}
