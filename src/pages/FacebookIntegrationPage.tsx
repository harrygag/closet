/**
 * Facebook Marketplace Integration Page — mirror of /poshmark and /depop.
 *
 * v0: page renders, opens the FB seller hub for the extension to scrape (once
 * the FB content script is wired), and reuses the shared widgets
 * (NewSalesSinceBaselineWidget / DelistQueueWidget / LastSoldWidget) all
 * platform-parameterized to `platform="facebook"`.
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
  DollarSign,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { toast } from 'sonner';
import { useAuthStore } from '../store/useAuthStore';
import { useItemStore } from '../store/useItemStore';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import { FacebookListing } from '../services/facebook/import';
import { FacebookImportModal } from '../components/facebook/FacebookImportModal';
import { FacebookSoldModal } from '../components/facebook/FacebookSoldModal';
import { LastSoldWidget } from '../components/inventory/LastSoldWidget';
import { NewSalesSinceBaselineWidget } from '../components/inventory/NewSalesSinceBaselineWidget';
import { DelistQueueWidget } from '../components/inventory/DelistQueueWidget';

const db = getFirestore(app);
const FB_BLUE = '#1877F2';

const FB_SELLING_URL_ACTIVE =
  'https://www.facebook.com/marketplace/you/selling?referral_surface=seller_hub&status[0]=IN_STOCK#autoScroll';
const FB_SELLING_URL_SOLD =
  'https://www.facebook.com/marketplace/you/selling?referral_surface=seller_hub&status[0]=SOLD#autoScroll';

const formatNumber = (num: number): string => num.toLocaleString('en-US');

const formatRelativeTime = (dateString: string | null): string => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

export function FacebookIntegrationPage() {
  const { user } = useAuthStore();
  const { items, initializeStore } = useItemStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [fbListings, setFbListings] = useState<FacebookListing[]>([]);
  const [fbUsername, setFbUsername] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [stats, setStats] = useState({ totalListings: 0, activeListings: 0, soldListings: 0, importedItems: 0 });

  useEffect(() => {
    void checkFacebookSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const checkFacebookSync = async () => {
    if (!user) return;
    try {
      const candidateDocIds = [`facebook_${user.id}`, 'facebook_me', user.id];
      let syncData: any = null;
      for (const docId of candidateDocIds) {
        try {
          const snap = await getDoc(doc(db, 'marketplaceData', docId));
          if (snap.exists()) {
            const d = snap.data();
            if ((!d.platform || d.platform === 'facebook') && Array.isArray(d.listings)) {
              syncData = d; break;
            }
          }
        } catch { /* keep trying */ }
      }
      if (!syncData) {
        try {
          const all = await getDocs(collection(db, 'marketplaceData'));
          for (const ds of all.docs) {
            if (!ds.id.startsWith('facebook_')) continue;
            const d = ds.data();
            if (Array.isArray(d.listings) && d.listings.length > 0) { syncData = d; break; }
          }
        } catch {}
      }
      if (!syncData) return;
      setLastSync(
        syncData.lastSync?.toDate?.()?.toISOString() ||
        syncData.syncedAt?.toDate?.()?.toISOString() ||
        null,
      );
      setFbUsername(syncData.userInfo?.username || syncData.username || null);
      const listings = (syncData.listings || []) as FacebookListing[];
      setFbListings(listings);
      setStats({
        totalListings: listings.length,
        importedItems: items.filter((i: any) => i.facebookListingId).length,
        activeListings: listings.filter((l: any) => !l.sold && l.status !== 'sold' && l.status !== 'SOLD').length,
        soldListings: listings.filter((l: any) => l.sold || l.status === 'sold' || l.status === 'SOLD').length,
      });
    } catch (err) {
      console.error('[FacebookIntegrationPage] Failed to check sync:', err);
    }
  };

  // Mirror the Depop/Poshmark Refresh flow: anchor-click open seller hub
  // (active + sold) with #autoScroll, wait 20s for the extension to scrape,
  // then re-read.
  const handleRefreshSync = async () => {
    const a1 = document.createElement('a');
    a1.href = FB_SELLING_URL_ACTIVE;
    a1.target = '_blank';
    a1.rel = 'noopener noreferrer';
    document.body.appendChild(a1); a1.click(); document.body.removeChild(a1);
    setTimeout(() => {
      const a2 = document.createElement('a');
      a2.href = FB_SELLING_URL_SOLD;
      a2.target = '_blank';
      a2.rel = 'noopener noreferrer';
      document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
    }, 2000);
    toast.info('Opening Facebook seller hub (active + sold) — refreshing in 20s…');
    setIsLoading(true);
    setTimeout(async () => {
      try { await checkFacebookSync(); toast.success('Refreshed Facebook data'); }
      catch { toast.error('Failed to refresh data'); }
      finally { setIsLoading(false); }
    }, 20000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900/20 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: [0.8, 1.1, 1] }} transition={{ duration: 0.6 }}>
                <ShoppingBag className="h-10 w-10" style={{ color: FB_BLUE }} />
              </motion.div>
              Facebook Marketplace
            </h1>
            <p className="text-gray-400">Import and manage your Facebook Marketplace listings</p>
          </div>
          <div className="flex items-center gap-4">
            {fbUsername && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border"
                style={{ backgroundColor: `${FB_BLUE}1A`, borderColor: `${FB_BLUE}4D` }}
              >
                <CheckCircle className="h-5 w-5" style={{ color: FB_BLUE }} />
                <span className="font-medium" style={{ color: FB_BLUE }}>@{fbUsername}</span>
              </motion.div>
            )}
            <Button variant="ghost" size="sm" onClick={handleRefreshSync} disabled={isLoading} className="flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Total Listings</p>
                  <p className="text-3xl font-bold text-white">{formatNumber(stats.totalListings)}</p>
                </div>
                <ShoppingBag className="h-12 w-12 opacity-50" style={{ color: FB_BLUE }} />
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
                  <p className="text-3xl font-bold text-red-400">{formatNumber(stats.soldListings)}</p>
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
                      <Eye className="h-3 w-3" /> Click to view
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
              <Sparkles className="h-5 w-5" style={{ color: FB_BLUE }} />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div
                className="flex items-start gap-3 p-4 rounded-lg border"
                style={{ backgroundColor: `${FB_BLUE}14`, borderColor: `${FB_BLUE}4D` }}
              >
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: FB_BLUE }} />
                <div className="flex-1">
                  <p className="font-medium mb-1" style={{ color: '#8FB8FF' }}>Extension scrape in progress</p>
                  <p className="text-gray-400 text-sm">
                    The Facebook content script will scrape{' '}
                    <code className="text-xs">/marketplace/you/selling</code> when the user clicks Refresh.
                    Listing ids are extracted from the Promote-now <code className="text-xs">target_id</code>{' '}
                    param. Auto-delete macro is pending a recording.
                  </p>
                </div>
              </div>

              {stats.importedItems > 0 && (
                <div className="flex items-center justify-between p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{stats.importedItems} Items Imported!</p>
                      <p className="text-gray-400 text-sm">View your Facebook items in your inventory</p>
                    </div>
                  </div>
                  <Button onClick={() => navigate('/closet')} className="flex items-center gap-2 bg-green-600 hover:bg-green-700">
                    <Eye className="h-4 w-4" /> View Inventory <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${FB_BLUE}33` }}>
                    <Download className="h-5 w-5" style={{ color: FB_BLUE }} />
                  </div>
                  <div>
                    <p className="text-white font-medium">Import Facebook Listings</p>
                    <p className="text-gray-400 text-sm">
                      {stats.totalListings > 0
                        ? `${stats.totalListings - stats.importedItems} more available to import`
                        : 'Open the seller hub so the extension scrapes your listings'}
                    </p>
                  </div>
                </div>
                <Button onClick={() => setShowImportModal(true)} className="flex items-center gap-2" style={{ backgroundColor: FB_BLUE }}>
                  <Download className="h-4 w-4" /> Import Listings
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-amber-900/20 border border-amber-500/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                    <Link2 className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Match Listings to Inventory</p>
                    <p className="text-gray-400 text-sm">Coming next pass — once the FB scrape is wired.</p>
                  </div>
                </div>
                <Button disabled className="flex items-center gap-2 bg-amber-700/60">
                  <Link2 className="h-4 w-4" /> Match
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-900/20 border border-red-500/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Sold Orders</p>
                    <p className="text-gray-400 text-sm">
                      {stats.soldListings > 0
                        ? `${stats.soldListings} sold items — open to match & mark sold`
                        : 'When the FB Sold scrape lands these will populate here'}
                    </p>
                  </div>
                </div>
                <Button onClick={() => setShowSoldModal(true)} className="flex items-center gap-2" style={{ backgroundColor: FB_BLUE }}>
                  <DollarSign className="h-4 w-4" /> Manage Sold
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <ExternalLink className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">View on Facebook</p>
                    <p className="text-gray-400 text-sm">Open your Marketplace seller hub in a new tab</p>
                  </div>
                </div>
                <Button variant="ghost" onClick={() => window.open(FB_SELLING_URL_ACTIVE, '_blank')} className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" /> Open Seller Hub
                </Button>
              </div>

              {lastSync && (
                <div className="flex items-center gap-2 text-gray-400 text-sm pt-2">
                  <Clock className="h-4 w-4" /> Last synced {formatRelativeTime(lastSync)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shared widgets — platform-parameterized */}
        <div className="mb-4"><NewSalesSinceBaselineWidget platform="facebook" count={8} /></div>
        <div className="mb-4"><DelistQueueWidget platform="facebook" /></div>
        <div className="mb-8"><LastSoldWidget platform="facebook" count={5} /></div>

        {/* Listings preview */}
        {fbListings.length > 0 && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" style={{ color: FB_BLUE }} />
                Facebook Listings ({fbListings.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fbListings.slice(0, 6).map((l: any) => (
                  <motion.div
                    key={l.listing_id || l.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gray-700/30 rounded-lg p-4 hover:bg-gray-700/50 transition-colors"
                  >
                    {l.imageUrl ? (
                      <img src={l.imageUrl} alt="" className="w-full h-48 object-cover rounded-lg mb-3" />
                    ) : (
                      <div className="w-full h-48 bg-gray-600 rounded-lg mb-3 flex items-center justify-center">
                        <span className="text-gray-400">No image</span>
                      </div>
                    )}
                    <h3 className="text-white font-medium mb-2 line-clamp-2">{l.title}</h3>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-400 font-semibold">${l.price ?? '—'}</span>
                      {l.sold || l.status === 'sold' || l.status === 'SOLD' ? (
                        <span className="text-red-400 text-xs font-medium">SOLD</span>
                      ) : (
                        <span className="bg-green-500/20 text-green-400 text-xs font-medium px-2 py-0.5 rounded-full">ACTIVE</span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
              {fbListings.length > 6 && (
                <p className="text-gray-400 text-sm text-center mt-4">And {fbListings.length - 6} more listings…</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <FacebookImportModal
        open={showImportModal}
        onClose={() => { setShowImportModal(false); void checkFacebookSync(); if (user) initializeStore(user.id); }}
      />
      <FacebookSoldModal
        open={showSoldModal}
        onClose={() => { setShowSoldModal(false); void checkFacebookSync(); if (user) initializeStore(user.id); }}
      />
    </div>
  );
}
