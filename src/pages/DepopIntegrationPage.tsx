/**
 * Depop Integration Page
 * Manage Depop listings import and sync
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Package,
  Download,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Clock,
  ShoppingBag,
  Sparkles,
  Eye,
  ArrowRight,
  Link2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { toast } from 'sonner';
import { useAuthStore } from '../store/useAuthStore';
import { useItemStore } from '../store/useItemStore';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import { DepopListing } from '../services/depop/import';
import { getDepopListingImage, formatDepopPrice } from '../services/depop/extractors';
import { DepopImportModal } from '../components/depop/DepopImportModal';
import { DepopSoldModal } from '../components/depop/DepopSoldModal';
import { LastSoldWidget } from '../components/inventory/LastSoldWidget';
import { NewSalesSinceBaselineWidget } from '../components/inventory/NewSalesSinceBaselineWidget';
import { DelistQueueWidget } from '../components/inventory/DelistQueueWidget';
import { ShouldListWidget } from '../components/inventory/ShouldListWidget';
import { PlatformMatchModal } from '../components/inventory/PlatformMatchModal';
import { syncMarketplace, isOpenClawRunning } from '../services/openclawService';

const db = getFirestore(app);

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

export function DepopIntegrationPage() {
  const { user } = useAuthStore();
  const { items, initializeStore } = useItemStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [depopListings, setDepopListings] = useState<DepopListing[]>([]);
  const [depopUsername, setDepopUsername] = useState<string | null>(null);
  const [openClawUsername, setOpenClawUsername] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [openClawAvailable, setOpenClawAvailable] = useState<boolean | null>(null);
  const [stats, setStats] = useState({
    totalListings: 0,
    importedItems: 0,
    activeListings: 0,
    soldListings: 0,
  });

  // Check OpenClaw availability on mount
  useEffect(() => {
    isOpenClawRunning().then(setOpenClawAvailable);
  }, []);

  // Check for Depop data in Firestore
  useEffect(() => {
    checkDepopSync();
  }, [user]);

  const checkDepopSync = async () => {
    if (!user) return;

    try {
      let syncData = null;

      // --- Resolve Depop username and numeric ID from depop_user_info ---
      let resolvedUsername: string | null = null;
      let resolvedNumericId: string | null = null;

      try {
        const userInfoRef = doc(db, 'depop_user_info', user.id);
        const userInfoSnap = await getDoc(userInfoRef);
        if (userInfoSnap.exists()) {
          const info = userInfoSnap.data();
          resolvedUsername = info.username || null;
          resolvedNumericId = info.userId || null;
          console.log('[Depop] Resolved from depop_user_info:', { resolvedUsername, resolvedNumericId });
        }
      } catch (e) {
        console.warn('[Depop] Could not read depop_user_info:', e);
      }

      // If depop_user_info didn't have a username, try depop_cookies
      if (!resolvedUsername) {
        try {
          const cookiesRef = doc(db, 'depop_cookies', user.id);
          const cookiesSnap = await getDoc(cookiesRef);
          if (cookiesSnap.exists()) {
            const cookies = cookiesSnap.data();
            resolvedUsername = cookies.username || null;
            resolvedNumericId = resolvedNumericId || cookies.userId || null;
            console.log('[Depop] Resolved from depop_cookies:', { resolvedUsername, resolvedNumericId });
          }
        } catch (e) {
          console.warn('[Depop] Could not read depop_cookies:', e);
        }
      }

      // Build ordered list of candidate doc IDs to check in marketplaceData
      const candidateDocIds: string[] = [];

      // 1. Firebase UID (existing path)
      candidateDocIds.push(user.id);

      // 2. Depop username resolved from Firestore
      if (resolvedUsername && !candidateDocIds.includes(resolvedUsername)) {
        candidateDocIds.push(resolvedUsername);
      }

      // 3. Depop numeric user ID resolved from Firestore
      if (resolvedNumericId && !candidateDocIds.includes(resolvedNumericId)) {
        candidateDocIds.push(resolvedNumericId);
      }

      // 4. Hardcoded known doc IDs as fallback
      for (const knownId of ['dallassports', '265732668']) {
        if (!candidateDocIds.includes(knownId)) {
          candidateDocIds.push(knownId);
        }
      }

      console.log('[Depop] Checking marketplaceData doc IDs in order:', candidateDocIds);

      // --- Try each candidate doc ID in marketplaceData ---
      for (const docId of candidateDocIds) {
        if (syncData) break;
        try {
          const docRef = doc(db, 'marketplaceData', docId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (!data.platform || data.platform === 'depop') {
              syncData = data;
              console.log(`[Depop] Found sync data at marketplaceData/${docId}`);
            }
          }
        } catch (e) {
          console.warn(`[Depop] Error reading marketplaceData/${docId}:`, e);
        }
      }

      // 5. Try subcollection location: users/{userId}/marketplaceData/sync
      if (!syncData) {
        const syncRef = doc(db, 'users', user.id, 'marketplaceData', 'sync');
        const syncSnapshot = await getDoc(syncRef);

        if (syncSnapshot.exists()) {
          const data = syncSnapshot.data();
          if (!data.platform || data.platform === 'depop') {
            syncData = data;
            console.log('[Depop] Found authenticated sync data');
          }
        }
      }

      // 6. Fallback: scan marketplaceData collection for depop data
      if (!syncData) {
        const publicSnapshot = await getDocs(collection(db, 'marketplaceData'));

        for (const docSnap of publicSnapshot.docs) {
          const data = docSnap.data();
          if (data.platform === 'depop' && data.listings?.length > 0) {
            syncData = data;
            console.log('[Depop] Found public sync data for:', docSnap.id);
            break;
          }
        }
      }

      if (syncData) {
        console.log('[Depop] Sync data:', {
          username: syncData.userInfo?.username || syncData.username,
          listingsCount: syncData.listings?.length,
          lastSync: syncData.lastSync || syncData.syncedAt,
          firstListing: syncData.listings?.[0]
        });

        setLastSync(syncData.lastSync?.toDate?.()?.toISOString() || syncData.syncedAt?.toDate?.()?.toISOString() || null);
        setDepopUsername(syncData.userInfo?.username || syncData.username || null);

        if (syncData.listings && syncData.listings.length > 0) {
          const soldCount = syncData.listings.filter((l: any) => l.sold || l._soldFromAPI || l.status === 'sold').length;
          console.log('[Depop] Setting listings:', syncData.listings.length, '| Sold:', soldCount, '| First:', JSON.stringify(syncData.listings[0]).substring(0, 200));
          // Log a sold item if any
          const firstSold = syncData.listings.find((l: any) => l.sold || l.status === 'sold');
          if (firstSold) console.log('[Depop] First sold item:', JSON.stringify(firstSold).substring(0, 300));
          console.log('[Depop] Price structure:', JSON.stringify(syncData.listings[0].price, null, 2));
          console.log('[Depop] Image structure:', {
            pictures: syncData.listings[0].pictures,
            images: syncData.listings[0].images,
            preview: syncData.listings[0].preview
          });
          setDepopListings(syncData.listings);
          setStats({
            totalListings: syncData.listings.length,
            importedItems: items.filter((item: any) => item.depopId || item.depopListingId).length,
            activeListings: syncData.listings.filter((l: any) => !l.sold && !l._soldFromAPI && (l.status === 'ONSALE' || l.status === 'onsale' || !l.status)).length,
            soldListings: syncData.listings.filter((l: any) => l.sold || l._soldFromAPI || (l.status && l.status !== 'ONSALE' && l.status !== 'onsale')).length,
          });
        } else {
          console.log('[Depop] No listings in sync data or empty array');
        }
      } else {
        console.log('[Depop] No sync data found in any location');
      }
    } catch (error) {
      console.error('Failed to check Depop sync:', error);
    }
  };

  const handleRefreshSync = async () => {
    // Open Depop shop page via link click (bypasses popup blocker)
    const username = (depopUsername && !/^\d+$/.test(depopUsername)) ? depopUsername : 'dallassports';
    // Open shop page for active listings
    const a1 = document.createElement('a');
    a1.href = `https://www.depop.com/${username}/#autoScroll`;
    a1.target = '_blank';
    a1.rel = 'noopener noreferrer';
    document.body.appendChild(a1);
    a1.click();
    document.body.removeChild(a1);

    // Also open selling hub for sold items after a short delay
    setTimeout(() => {
      const a2 = document.createElement('a');
      a2.href = 'https://www.depop.com/sellinghub/sold-items/#autoScroll';
      a2.target = '_blank';
      a2.rel = 'noopener noreferrer';
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
    }, 2000);

    toast.info('Opening Depop shop + sold items — extension capturing. Refreshing in 20s...');

    // Wait for extension to capture and sync, then reload data
    setIsLoading(true);
    setTimeout(async () => {
      try {
        await checkDepopSync();
        toast.success('Refreshed Depop data');
      } catch (error) {
        toast.error('Failed to refresh data');
      } finally {
        setIsLoading(false);
      }
    }, 20000);
  };

  const handleOpenClawSync = async () => {
    const username = openClawUsername.trim() || depopUsername || '';
    if (!username) {
      toast.error('Enter your Depop username first');
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
      const result = await syncMarketplace('depop', username);
      toast.success(`Synced ${result.count} listings from @${username}`);
      await checkDepopSync();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      toast.error(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <motion.span
                initial={{ rotate: 0 }}
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              >
                🛍️
              </motion.span>
              Depop Integration
            </h1>
            <p className="text-gray-400">
              Import and manage your Depop listings
            </p>
          </div>

          <div className="flex items-center gap-4">
            {depopUsername && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 px-4 py-2 bg-purple-900/30 border border-purple-500/30 rounded-lg"
              >
                <CheckCircle className="h-5 w-5 text-purple-400" />
                <span className="text-purple-400 font-medium">
                  Synced as @{depopUsername}
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
                  <p className="text-3xl font-bold text-white">
                    {formatNumber(stats.totalListings)}
                  </p>
                </div>
                <ShoppingBag className="h-12 w-12 text-purple-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Active Listings</p>
                  <p className="text-3xl font-bold text-white">
                    {formatNumber(stats.activeListings)}
                  </p>
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
                  <p className="text-3xl font-bold text-white">
                    {formatNumber(stats.importedItems)}
                  </p>
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

        {/* Main Content */}
        <Card className="bg-gray-800/50 border-gray-700 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* OpenClaw Sync — always visible */}
              <div className="flex items-start gap-3 p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                <Sparkles className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-purple-300 font-medium mb-1">Sync with OpenClaw Bot</p>
                  <p className="text-gray-400 text-sm mb-3">
                    OpenClaw opens your real browser, logs into Depop as you, and extracts your listings.
                    Make sure OpenClaw is running first — see{' '}
                    <code className="text-purple-400 text-xs">OPENCLAW_SETUP.md</code>.
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
                      placeholder={depopUsername || 'your-depop-username'}
                      value={openClawUsername}
                      onChange={e => setOpenClawUsername(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                    <Button
                      onClick={handleOpenClawSync}
                      disabled={isSyncing}
                      className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 whitespace-nowrap"
                    >
                      <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Syncing…' : 'Sync Now'}
                    </Button>
                  </div>
                </div>
              </div>

              {!depopUsername ? (
                <div className="flex items-start gap-3 p-4 bg-blue-900/10 border border-blue-500/20 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-blue-400 font-medium mb-1">No listings synced yet</p>
                    <p className="text-gray-400 text-sm">
                      Enter your Depop username above and click "Sync Now" to import your listings.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {stats.importedItems > 0 && (
                    <div className="flex items-center justify-between p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                          <CheckCircle className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                          <p className="text-white font-medium">✨ {stats.importedItems} Items Imported!</p>
                          <p className="text-gray-400 text-sm">
                            View your Depop items in your Pokemon Collection
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

                  <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                        <Download className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Import Depop Listings</p>
                        <p className="text-gray-400 text-sm">
                          {stats.importedItems > 0
                            ? `${stats.totalListings - stats.importedItems} more available to import`
                            : `Import ${stats.totalListings} listings from your Depop shop`}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => navigate('/import?platform=depop')}
                      className="flex items-center gap-2 bg-[#FF2300] hover:bg-[#e61f00]"
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
                          Run the matcher and pick the right inventory item for each Depop listing (top 3 candidates per card · per-card reload · manual override).
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
                        <p className="text-white font-medium">Sold Items</p>
                        <p className="text-gray-400 text-sm">
                          {stats.soldListings > 0
                            ? `${stats.soldListings} sold items — view, match & mark sold`
                            : 'View and manage your Depop sold items'}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => navigate('/sales?platform=depop')}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700"
                    >
                      <Eye className="h-4 w-4" />
                      Manage Sold {stats.soldListings > 0 ? `(${stats.soldListings})` : ''}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <ExternalLink className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">View on Depop</p>
                        <p className="text-gray-400 text-sm">
                          Open your Depop shop in a new tab
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => window.open('https://www.depop.com/dallassports/', '_blank')}
                      className="flex items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Shop
                    </Button>
                  </div>

                  {lastSync && (
                    <div className="flex items-center gap-2 text-gray-400 text-sm pt-2">
                      <Clock className="h-4 w-4" />
                      Last synced {formatRelativeTime(lastSync)}
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── New Sales Since Calibration (status='pending') ─────── */}
        <div className="mb-4">
          <NewSalesSinceBaselineWidget platform="depop" count={8} />
        </div>

        {/* ── Pending Depop delistings — items whose eBay is ended/OOS but still on Depop ── */}
        <div className="mb-4">
          <DelistQueueWidget platform="depop" />
        </div>

        {/* ── Should list on Depop (in stock + no Depop binding yet) ── */}
        <div className="mb-4">
          <ShouldListWidget platform="depop" />
        </div>

        {/* ── Last Sold Widget ─────────────────────────────────────── */}
        <div className="mb-8">
          <LastSoldWidget platform="depop" count={5} />
        </div>


        {/* Listings Preview */}
        {depopListings.length > 0 && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-purple-400" />
                  Depop Listings ({depopListings.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {depopListings.slice(0, 6).map((listing) => (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gray-700/30 rounded-lg p-4 hover:bg-gray-700/50 transition-colors"
                  >
                    {(() => {
                      const imageUrl = getDepopListingImage(listing);
                      return imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={listing.title}
                          className="w-full h-48 object-cover rounded-lg mb-3"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-48 bg-gray-600 rounded-lg mb-3 flex items-center justify-center">
                          <span className="text-gray-400">No image</span>
                        </div>
                      );
                    })()}
                    <h3 className="text-white font-medium mb-2 break-words">
                      {listing.title || listing.description || 'Depop Item'}
                    </h3>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-400 font-semibold">
                        {formatDepopPrice(listing)}
                      </span>
                      {(listing.sold || (listing as any)._soldFromAPI || listing.status === 'SOLD' || listing.status === 'sold' || (listing.status && listing.status !== 'ONSALE' && listing.status !== 'onsale')) ? (
                        <span className="bg-red-500/20 text-red-400 text-xs font-medium px-2 py-0.5 rounded-full">SOLD</span>
                      ) : (
                        <span className="bg-green-500/20 text-green-400 text-xs font-medium px-2 py-0.5 rounded-full">ACTIVE</span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
              {depopListings.length > 6 && (
                <p className="text-gray-400 text-sm text-center mt-4">
                  And {depopListings.length - 6} more listings...
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Sold Items Modal */}
        <DepopSoldModal
          open={showSoldModal}
          onClose={async () => {
            setShowSoldModal(false);
            setIsLoading(true);
            await checkDepopSync();
            if (user) await initializeStore(user.id);
            setIsLoading(false);
          }}
        />

        {/* Import Modal */}
        <DepopImportModal
          open={showImportModal}
          onClose={() => {
            setShowImportModal(false);
            // Refresh data after modal closes to update counts
            checkDepopSync();
            if (user) initializeStore(user.id);
          }}
        />

        {/* Match Modal — 3 candidates per card + per-card reload + manual match */}
        <PlatformMatchModal
          open={showMatchModal}
          platform="depop"
          onClose={() => setShowMatchModal(false)}
          onApplied={() => { checkDepopSync(); if (user) initializeStore(user.id); }}
        />
      </div>
    </div>
  );
}
