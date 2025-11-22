/**
 * eBay Integration Page
 * Production-ready with localhost testing mode
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Package,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  AlertCircle,
  CheckCircle,
  Download,
  LogOut,
  ExternalLink,
  BarChart3,
  Clock,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { toast } from 'sonner';
import { useEbayAuth } from '../hooks/useEbayAuth';
import { useEbayStats } from '../hooks/useEbayStats';
import { ebayService } from '../services/ebayService';

const formatNumber = (num: number): string => num.toLocaleString('en-US');
const formatCurrency = (amount: number): string => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

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

const ConnectionHeader: React.FC<{
  isConnected: boolean;
  isLoading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}> = ({ isConnected, isLoading, onConnect, onDisconnect }) => (
  <div className="flex items-center justify-between mb-8">
    <div>
      <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
        <motion.span
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        >
          🛒
        </motion.span>
        eBay Integration
      </h1>
      <p className="text-gray-400">
        Sync your eBay inventory and manage listings
      </p>
    </div>

    <div className="flex items-center gap-4">
      {isConnected ? (
        <>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-2 px-4 py-2 bg-green-900/30 border border-green-500/30 rounded-lg"
          >
            <CheckCircle className="h-5 w-5 text-green-400" />
            <span className="text-green-400 font-medium">Connected</span>
          </motion.div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDisconnect}
            disabled={isLoading}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Disconnect
          </Button>
        </>
      ) : (
        <Button
          onClick={onConnect}
          disabled={isLoading}
          loading={isLoading}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Connect eBay Account
        </Button>
      )}
    </div>
  </div>
);

const StatusCard: React.FC<{
  isConnected: boolean;
  lastSync: string | null;
  tokenExpiry: string | null;
  onRefresh: () => void;
}> = ({ isConnected, lastSync, tokenExpiry, onRefresh }) => (
  <Card className="mb-6">
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle>Connection Status</CardTitle>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900/50 p-4 rounded-lg">
          <div className="text-gray-400 text-sm mb-2">Status</div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-white font-medium">
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
        </div>

        <div className="bg-gray-900/50 p-4 rounded-lg">
          <div className="text-gray-400 text-sm mb-2 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last Sync
          </div>
          <div className="text-white font-medium">
            {formatRelativeTime(lastSync)}
          </div>
        </div>

        <div className="bg-gray-900/50 p-4 rounded-lg">
          <div className="text-gray-400 text-sm mb-2">Token Expires</div>
          <div className="text-white font-medium">
            {tokenExpiry ? formatRelativeTime(tokenExpiry) : 'N/A'}
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
);

const StatsCards: React.FC<{
  totalListings: number;
  activeListings: number;
  totalOrders: number;
  revenue: number;
  isLoading: boolean;
}> = ({ totalListings, activeListings, totalOrders, revenue, isLoading }) => {
  const stats = [
    {
      icon: Package,
      label: 'Total Listings',
      value: formatNumber(totalListings),
      bgFrom: 'from-blue-600/20',
      bgTo: 'to-blue-800/20',
      border: 'border-blue-500/30',
      iconColor: 'text-blue-400',
      textColor: 'text-blue-300',
    },
    {
      icon: CheckCircle,
      label: 'Active Listings',
      value: formatNumber(activeListings),
      bgFrom: 'from-green-600/20',
      bgTo: 'to-green-800/20',
      border: 'border-green-500/30',
      iconColor: 'text-green-400',
      textColor: 'text-green-300',
    },
    {
      icon: ShoppingCart,
      label: 'Total Orders',
      value: formatNumber(totalOrders),
      bgFrom: 'from-purple-600/20',
      bgTo: 'to-purple-800/20',
      border: 'border-purple-500/30',
      iconColor: 'text-purple-400',
      textColor: 'text-purple-300',
    },
    {
      icon: DollarSign,
      label: 'Revenue',
      value: formatCurrency(revenue),
      bgFrom: 'from-yellow-600/20',
      bgTo: 'to-yellow-800/20',
      border: 'border-yellow-500/30',
      iconColor: 'text-yellow-400',
      textColor: 'text-yellow-300',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <AnimatePresence>
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`bg-gradient-to-br ${stat.bgFrom} ${stat.bgTo} border ${stat.border} rounded-xl p-6`}
          >
            <stat.icon className={`h-8 w-8 ${stat.iconColor} mb-3`} />
            <div className="text-2xl font-bold text-white mb-1">
              {isLoading ? '...' : stat.value}
            </div>
            <div className={`${stat.textColor} text-sm`}>{stat.label}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

const ActionsPanel: React.FC<{
  onSyncInventory: () => void;
  onRefreshStats: () => void;
  onManageListings: () => void;
  onViewAnalytics: () => void;
  isSyncing: boolean;
}> = ({ onSyncInventory, onRefreshStats, onManageListings, onViewAnalytics, isSyncing }) => (
  <Card>
    <CardHeader>
      <CardTitle>Actions</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Button
          onClick={onSyncInventory}
          disabled={isSyncing}
          loading={isSyncing}
          className="bg-green-600 hover:bg-green-700 w-full"
        >
          <Download className="mr-2 h-4 w-4" />
          {isSyncing ? 'Syncing...' : 'Sync Inventory'}
        </Button>

        <Button onClick={onRefreshStats} variant="secondary" className="w-full">
          <TrendingUp className="mr-2 h-4 w-4" />
          Refresh Stats
        </Button>

        <Button onClick={onManageListings} variant="secondary" className="w-full">
          <Package className="mr-2 h-4 w-4" />
          Manage Listings
        </Button>

        <Button onClick={onViewAnalytics} variant="secondary" className="w-full">
          <BarChart3 className="mr-2 h-4 w-4" />
          View Analytics
        </Button>
      </div>
    </CardContent>
  </Card>
);

const NotConnectedState: React.FC<{ onConnect: () => void }> = ({ onConnect }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-12 text-center"
  >
    <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
    <h3 className="text-2xl font-semibold text-white mb-2">
      Connect Your eBay Account
    </h3>
    <p className="text-gray-400 mb-6 max-w-md mx-auto">
      Link your eBay seller account to sync inventory, manage listings, and track orders all in one place.
    </p>
    <Button onClick={onConnect} className="bg-blue-600 hover:bg-blue-700">
      <ExternalLink className="mr-2 h-4 w-4" />
      Connect eBay Account
    </Button>

    <div className="mt-8 text-left max-w-md mx-auto">
      <h4 className="text-white font-semibold mb-3">What you can do:</h4>
      <ul className="space-y-2 text-gray-400 text-sm">
        {[
          'Automatically sync your eBay inventory',
          'Manage listings from one dashboard',
          'Track orders and revenue in real-time',
          'Analyze performance with detailed insights',
        ].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  </motion.div>
);

export const EbayIntegrationPage: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const { isConnected, isLoading, status, connect, disconnect, refreshStatus } = useEbayAuth();
  const { stats, isLoading: statsLoading, refreshStats } = useEbayStats(isConnected);

  const handleSyncInventory = async () => {
    setIsSyncing(true);
    try {
      const result = await ebayService.syncInventory();
      if (result.success) {
        toast.success(`✅ Synced ${result.imported} items from eBay!`);
        refreshStats();
      }
    } catch (error) {
      toast.error('Failed to sync inventory');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <ConnectionHeader
          isConnected={isConnected}
          isLoading={isLoading}
          onConnect={connect}
          onDisconnect={disconnect}
        />

        {isConnected ? (
          <>
            <StatusCard
              isConnected={isConnected}
              lastSync={status?.lastSync || null}
              tokenExpiry={status?.tokenExpiry || null}
              onRefresh={refreshStatus}
            />

            {stats && (
              <StatsCards
                totalListings={stats.totalListings}
                activeListings={stats.activeListings}
                totalOrders={stats.totalOrders}
                revenue={stats.revenue}
                isLoading={statsLoading}
              />
            )}

            <ActionsPanel
              onSyncInventory={handleSyncInventory}
              onRefreshStats={refreshStats}
              onManageListings={() => toast.info('Coming soon!')}
              onViewAnalytics={() => toast.info('Coming soon!')}
              isSyncing={isSyncing}
            />
          </>
        ) : (
          <NotConnectedState onConnect={connect} />
        )}
      </div>
    </div>
  );
};
