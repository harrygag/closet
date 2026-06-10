/**
 * PlatformConnectBar — the connect + sync controls for a single platform,
 * shown as a compact header strip above the inline import modal on /import.
 *
 * Relocated verbatim from the (now retired-from-nav) integration pages:
 *  - eBay: useEbayAuth (connect/disconnect/status) + useEbayStats (stat chips)
 *          + "Sync Inventory" (ebayService.syncListings).
 *  - Poshmark/Depop: OpenClaw status + username + "Sync Now"
 *          (syncMarketplace) + "Refresh" (open scrape URLs for the extension)
 *          + "Match Listings" (PlatformMatchModal).
 *
 * Behavior is identical to the old pages — just moved here so the per-platform
 * pages can be dropped from the nav without losing connect/sync/match.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, Plug, PlugZap, Link2, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useEbayAuth } from '../../hooks/useEbayAuth';
import { useEbayStats } from '../../hooks/useEbayStats';
import { ebayService } from '../../services/ebayService';
import { syncMarketplace, isOpenClawRunning } from '../../services/openclawService';
import { PlatformMatchModal } from '../inventory/PlatformMatchModal';
import { useAuthStore } from '../../store/useAuthStore';
import { useItemStore } from '../../store/useItemStore';

type Platform = 'ebay' | 'poshmark' | 'depop';

const DEFAULT_USERNAME: Record<'poshmark' | 'depop', string> = {
  poshmark: 'retrothriftc0',
  depop: 'dallassports',
};

const REFRESH_URLS: Record<'poshmark' | 'depop', { active: string; sold: string }> = {
  poshmark: {
    active: 'https://poshmark.com/closet/USERNAME?availability=available#autoScroll',
    sold: 'https://poshmark.com/order/sales#autoScroll',
  },
  depop: {
    active: 'https://www.depop.com/USERNAME/#autoScroll',
    sold: 'https://www.depop.com/sellinghub/sold-items/#autoScroll',
  },
};

function openTab(href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function EbayConnectBar() {
  const { isConnected, isLoading, status, connect, disconnect } = useEbayAuth();
  const { stats, refreshStats } = useEbayStats(isConnected);
  const [syncing, setSyncing] = useState(false);

  const handleSyncInventory = async () => {
    setSyncing(true);
    try {
      const result = await ebayService.syncListings();
      if (result.success) {
        toast.success(`✅ Synced ${result.imported} items from eBay!`);
        refreshStats();
      }
    } catch {
      toast.error('Failed to sync inventory');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
          isConnected ? 'text-emerald-300 border-emerald-700/50 bg-emerald-900/20' : 'text-gray-400 border-gray-700 bg-gray-800/50'
        }`}>
          {isConnected ? <PlugZap className="h-3.5 w-3.5" /> : <Plug className="h-3.5 w-3.5" />}
          {isConnected ? `Connected${status?.ebayUsername ? ` · ${status.ebayUsername}` : ''}` : 'Not connected'}
        </span>
        {isConnected && stats && (
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span>Listings <span className="text-gray-200 font-semibold">{stats.totalListings}</span></span>
            <span>Active <span className="text-gray-200 font-semibold">{stats.activeListings}</span></span>
            <span>Orders <span className="text-gray-200 font-semibold">{stats.totalOrders}</span></span>
            <span>Rev <span className="text-gray-200 font-semibold">${(stats.revenue || 0).toLocaleString()}</span></span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <button type="button" onClick={handleSyncInventory} disabled={syncing}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-black border border-gray-700 text-gray-100 hover:bg-gray-800 disabled:opacity-50">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync Inventory
            </button>
            <button type="button" onClick={() => disconnect()} disabled={isLoading}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800">
              Disconnect
            </button>
          </>
        ) : (
          <button type="button" onClick={() => connect()} disabled={isLoading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-black border border-gray-700 text-gray-100 hover:bg-gray-800 disabled:opacity-50">
            <Plug className="h-3.5 w-3.5" /> Connect eBay
          </button>
        )}
      </div>
    </div>
  );
}

function ExtensionConnectBar({ platform }: { platform: 'poshmark' | 'depop' }) {
  const { user } = useAuthStore();
  const { initializeStore } = useItemStore();
  const [openClawAvailable, setOpenClawAvailable] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [showMatch, setShowMatch] = useState(false);

  useEffect(() => {
    isOpenClawRunning().then(setOpenClawAvailable);
  }, []);

  const resolvedUsername = () => username.trim() || DEFAULT_USERNAME[platform];

  const handleRefresh = () => {
    const u = resolvedUsername();
    openTab(REFRESH_URLS[platform].active.replace('USERNAME', u));
    setTimeout(() => openTab(REFRESH_URLS[platform].sold), 2000);
    toast.info(`Opening ${platform} — extension capturing. Data syncs in the background.`);
  };

  const handleOpenClawSync = async () => {
    const u = resolvedUsername();
    const running = await isOpenClawRunning();
    setOpenClawAvailable(running);
    if (!running) {
      toast.error('OpenClaw is not running. Start it on localhost:18789 first.');
      return;
    }
    setSyncing(true);
    try {
      const result = await syncMarketplace(platform, u);
      toast.success(`Synced ${result.count} listings from @${u}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
          openClawAvailable ? 'text-emerald-300 border-emerald-700/50 bg-emerald-900/20'
          : openClawAvailable === false ? 'text-amber-300 border-amber-700/50 bg-amber-900/20'
          : 'text-gray-400 border-gray-700 bg-gray-800/50'
        }`}>
          <Zap className="h-3.5 w-3.5" />
          {openClawAvailable ? 'OpenClaw ready' : openClawAvailable === false ? 'OpenClaw offline' : 'Checking…'}
        </span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={DEFAULT_USERNAME[platform]}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 w-40 focus:outline-none focus:border-gray-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-gray-100 hover:bg-gray-800">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
        <button type="button" onClick={handleOpenClawSync} disabled={syncing}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-black border border-gray-700 text-gray-100 hover:bg-gray-800 disabled:opacity-50">
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Sync Now
        </button>
        <button type="button" onClick={() => setShowMatch(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-gray-100 hover:bg-gray-800">
          <Link2 className="h-3.5 w-3.5" /> Match Listings
        </button>
      </div>

      <PlatformMatchModal
        open={showMatch}
        platform={platform}
        onClose={() => setShowMatch(false)}
        onApplied={() => { if (user) initializeStore(user.id); }}
      />
    </div>
  );
}

export function PlatformConnectBar({ platform }: { platform: Platform }) {
  if (platform === 'ebay') return <EbayConnectBar />;
  return <ExtensionConnectBar platform={platform} />;
}

export default PlatformConnectBar;
