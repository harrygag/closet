/**
 * Whatnot Integration Page — mirror of /facebook and /poshmark.
 *
 * Whatnot is a live-selling platform. v0: page renders, opens the Whatnot
 * seller listings/sold pages for the extension to scrape (once the Whatnot
 * content script is wired), and reuses the shared widgets
 * (NewSalesSinceBaselineWidget / DelistQueueWidget / LastSoldWidget) all
 * parameterized to `platform="whatnot"`. Whatnot sales reduce real stock.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  RefreshCw, Package, Download, AlertCircle, CheckCircle, ExternalLink, Clock,
  ShoppingBag, Sparkles, Eye, ArrowRight, DollarSign,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { toast } from 'sonner';
import { useAuthStore } from '../store/useAuthStore';
import { useItemStore } from '../store/useItemStore';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { app } from '../lib/firebase/client';
import { WhatnotListing } from '../services/whatnot/import';
import { WhatnotImportModal } from '../components/whatnot/WhatnotImportModal';
import { WhatnotSoldModal } from '../components/whatnot/WhatnotSoldModal';
import { LastSoldWidget } from '../components/inventory/LastSoldWidget';
import { NewSalesSinceBaselineWidget } from '../components/inventory/NewSalesSinceBaselineWidget';
import { DelistQueueWidget } from '../components/inventory/DelistQueueWidget';

const db = getFirestore(app);
const WN_YELLOW = '#FFDE2D';

const WN_LISTINGS_URL = 'https://www.whatnot.com/selling/listings#autoScroll';
const WN_SOLD_URL = 'https://www.whatnot.com/selling/sold#autoScroll';

const formatNumber = (num: number): string => num.toLocaleString('en-US');

const formatRelativeTime = (dateString: string | null): string => {
  if (!dateString) return 'Never';
  const diffMins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

export function WhatnotIntegrationPage() {
  const { user } = useAuthStore();
  const { items, initializeStore } = useItemStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [wnListings, setWnListings] = useState<WhatnotListing[]>([]);
  const [wnUsername, setWnUsername] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [stats, setStats] = useState({ totalListings: 0, activeListings: 0, soldListings: 0, importedItems: 0 });

  useEffect(() => {
    void checkWhatnotSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const checkWhatnotSync = async () => {
    if (!user) return;
    try {
      const candidateDocIds = [`whatnot_${user.id}`, 'whatnot_me', user.id];
      let syncData: any = null;
      for (const docId of candidateDocIds) {
        try {
          const snap = await getDoc(doc(db, 'marketplaceData', docId));
          if (snap.exists()) {
            const d = snap.data();
            if ((!d.platform || d.platform === 'whatnot') && Array.isArray(d.listings)) { syncData = d; break; }
          }
        } catch { /* keep trying */ }
      }
      if (!syncData) {
        try {
          const all = await getDocs(collection(db, 'marketplaceData'));
          for (const ds of all.docs) {
            if (!ds.id.startsWith('whatnot_')) continue;
            const d = ds.data();
            if (Array.isArray(d.listings) && d.listings.length > 0) { syncData = d; break; }
          }
        } catch {}
      }
      if (!syncData) return;
      setLastSync(syncData.lastSync?.toDate?.()?.toISOString() || syncData.syncedAt?.toDate?.()?.toISOString() || null);
      setWnUsername(syncData.userInfo?.username || syncData.username || null);
      const listings = (syncData.listings || []) as WhatnotListing[];
      setWnListings(listings);
      setStats({
        totalListings: listings.length,
        importedItems: items.filter((i: any) => i.whatnotListingId).length,
        activeListings: listings.filter((l: any) => !l.sold && l.status !== 'sold' && l.status !== 'SOLD').length,
        soldListings: listings.filter((l: any) => l.sold || l.status === 'sold' || l.status === 'SOLD').length,
      });
    } catch (err) {
      console.error('[WhatnotIntegrationPage] Failed to check sync:', err);
    }
  };

  const handleRefreshSync = async () => {
    const a1 = document.createElement('a');
    a1.href = WN_LISTINGS_URL; a1.target = '_blank'; a1.rel = 'noopener noreferrer';
    document.body.appendChild(a1); a1.click(); document.body.removeChild(a1);
    setTimeout(() => {
      const a2 = document.createElement('a');
      a2.href = WN_SOLD_URL; a2.target = '_blank'; a2.rel = 'noopener noreferrer';
      document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
    }, 2000);
    toast.info('Opening Whatnot seller pages (listings + sold) — refreshing in 20s…');
    setIsLoading(true);
    setTimeout(async () => {
      try { await checkWhatnotSync(); toast.success('Refreshed Whatnot data'); }
      catch { toast.error('Failed to refresh data'); }
      finally { setIsLoading(false); }
    }, 20000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-yellow-900/10 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: [0.8, 1.1, 1] }} transition={{ duration: 0.6 }}>
                <ShoppingBag className="h-10 w-10" style={{ color: WN_YELLOW }} />
              </motion.div>
              Whatnot
            </h1>
            <p className="text-gray-400">Track Whatnot live-show sales against your real stock</p>
          </div>
          <div className="flex items-center gap-4">
            {wnUsername && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border"
                style={{ backgroundColor: `${WN_YELLOW}1A`, borderColor: `${WN_YELLOW}4D` }}
              >
                <CheckCircle className="h-5 w-5" style={{ color: WN_YELLOW }} />
                <span className="font-medium" style={{ color: WN_YELLOW }}>@{wnUsername}</span>
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
          <Card className="bg-gray-800/50 border-gray-700"><CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div><p className="text-gray-400 text-sm mb-1">Total Listings</p><p className="text-3xl font-bold text-white">{formatNumber(stats.totalListings)}</p></div>
              <ShoppingBag className="h-12 w-12 opacity-50" style={{ color: WN_YELLOW }} />
            </div>
          </CardContent></Card>
          <Card className="bg-gray-800/50 border-gray-700"><CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div><p className="text-gray-400 text-sm mb-1">Active Listings</p><p className="text-3xl font-bold text-white">{formatNumber(stats.activeListings)}</p></div>
              <Package className="h-12 w-12 text-green-400 opacity-50" />
            </div>
          </CardContent></Card>
          <Card className="bg-gray-800/50 border-gray-700"><CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div><p className="text-gray-400 text-sm mb-1">Sold Listings</p><p className="text-3xl font-bold text-red-400">{formatNumber(stats.soldListings)}</p></div>
              <Package className="h-12 w-12 text-red-400 opacity-50" />
            </div>
          </CardContent></Card>
          <Card className="bg-gray-800/50 border-gray-700 cursor-pointer hover:border-green-500/50 transition-all" onClick={() => stats.importedItems > 0 && navigate('/closet')}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Imported to App</p>
                  <p className="text-3xl font-bold text-white">{formatNumber(stats.importedItems)}</p>
                  {stats.importedItems > 0 && <p className="text-xs text-green-400 mt-2 flex items-center gap-1"><Eye className="h-3 w-3" /> Click to view</p>}
                </div>
                <Download className="h-12 w-12 text-yellow-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-gray-800/50 border-gray-700 mb-8">
          <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" style={{ color: WN_YELLOW }} />Quick Actions</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg border" style={{ backgroundColor: `${WN_YELLOW}14`, borderColor: `${WN_YELLOW}4D` }}>
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: WN_YELLOW }} />
                <div className="flex-1">
                  <p className="font-medium mb-1" style={{ color: '#E8C84A' }}>Whatnot scrape pending</p>
                  <p className="text-gray-400 text-sm">
                    The Whatnot content script (seller listings + sold) is being built. Refresh opens
                    the Whatnot seller pages; once the scrape lands, listings and sold items populate here.
                    Whatnot sales reduce your real stock (eBay qty − non-eBay sales).
                  </p>
                </div>
              </div>

              {stats.importedItems > 0 && (
                <div className="flex items-center justify-between p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-green-500/20 rounded-lg flex items-center justify-center"><CheckCircle className="h-5 w-5 text-green-400" /></div>
                    <div><p className="text-white font-medium">{stats.importedItems} Items Imported!</p><p className="text-gray-400 text-sm">View your Whatnot-linked items in your inventory</p></div>
                  </div>
                  <Button onClick={() => navigate('/closet')} className="flex items-center gap-2 bg-green-600 hover:bg-green-700"><Eye className="h-4 w-4" /> View Inventory <ArrowRight className="h-4 w-4" /></Button>
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${WN_YELLOW}33` }}><Download className="h-5 w-5" style={{ color: WN_YELLOW }} /></div>
                  <div>
                    <p className="text-white font-medium">Import Whatnot Listings</p>
                    <p className="text-gray-400 text-sm">{stats.totalListings > 0 ? `${stats.totalListings - stats.importedItems} more available to import` : 'Open the seller page so the extension scrapes your listings'}</p>
                  </div>
                </div>
                <Button onClick={() => setShowImportModal(true)} className="flex items-center gap-2" style={{ backgroundColor: WN_YELLOW, color: '#1A1A1A' }}><Download className="h-4 w-4" /> Import Listings</Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-900/20 border border-red-500/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-red-500/20 rounded-lg flex items-center justify-center"><DollarSign className="h-5 w-5 text-red-400" /></div>
                  <div>
                    <p className="text-white font-medium">Sold Orders</p>
                    <p className="text-gray-400 text-sm">{stats.soldListings > 0 ? `${stats.soldListings} sold items — match & mark sold (reduces stock)` : 'Whatnot sold items will populate here'}</p>
                  </div>
                </div>
                <Button onClick={() => setShowSoldModal(true)} className="flex items-center gap-2" style={{ backgroundColor: WN_YELLOW, color: '#1A1A1A' }}><DollarSign className="h-4 w-4" /> Manage Sold</Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-yellow-500/20 rounded-lg flex items-center justify-center"><ExternalLink className="h-5 w-5 text-yellow-400" /></div>
                  <div><p className="text-white font-medium">View on Whatnot</p><p className="text-gray-400 text-sm">Open your Whatnot seller dashboard in a new tab</p></div>
                </div>
                <Button variant="ghost" onClick={() => window.open(WN_LISTINGS_URL, '_blank')} className="flex items-center gap-2"><ExternalLink className="h-4 w-4" /> Open Seller Page</Button>
              </div>

              {lastSync && (
                <div className="flex items-center gap-2 text-gray-400 text-sm pt-2"><Clock className="h-4 w-4" /> Last synced {formatRelativeTime(lastSync)}</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shared widgets — platform-parameterized */}
        <div className="mb-4"><NewSalesSinceBaselineWidget platform="whatnot" count={8} /></div>
        <div className="mb-4"><DelistQueueWidget platform="whatnot" /></div>
        <div className="mb-8"><LastSoldWidget platform="whatnot" count={5} /></div>

        {/* Listings preview */}
        {wnListings.length > 0 && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" style={{ color: WN_YELLOW }} />Whatnot Listings ({wnListings.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {wnListings.slice(0, 6).map((l: any) => (
                  <motion.div key={l.listing_id || l.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-700/30 rounded-lg p-4 hover:bg-gray-700/50 transition-colors">
                    {l.imageUrl ? (
                      <img src={l.imageUrl} alt="" className="w-full h-48 object-cover rounded-lg mb-3" />
                    ) : (
                      <div className="w-full h-48 bg-gray-600 rounded-lg mb-3 flex items-center justify-center"><span className="text-gray-400">No image</span></div>
                    )}
                    <h3 className="text-white font-medium mb-2 line-clamp-2">{l.title}</h3>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-400 font-semibold">${l.price ?? '—'}</span>
                      {l.sold || l.status === 'sold' || l.status === 'SOLD'
                        ? <span className="text-red-400 text-xs font-medium">SOLD</span>
                        : <span className="bg-green-500/20 text-green-400 text-xs font-medium px-2 py-0.5 rounded-full">ACTIVE</span>}
                    </div>
                  </motion.div>
                ))}
              </div>
              {wnListings.length > 6 && <p className="text-gray-400 text-sm text-center mt-4">And {wnListings.length - 6} more listings…</p>}
            </CardContent>
          </Card>
        )}
      </div>

      <WhatnotImportModal open={showImportModal} onClose={() => { setShowImportModal(false); void checkWhatnotSync(); if (user) initializeStore(user.id); }} />
      <WhatnotSoldModal open={showSoldModal} onClose={() => { setShowSoldModal(false); void checkWhatnotSync(); if (user) initializeStore(user.id); }} />
    </div>
  );
}
