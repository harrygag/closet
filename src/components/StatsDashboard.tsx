import React from 'react';
import { TrendingUp, Package, DollarSign, BarChart3, Download, Import } from 'lucide-react';
import type { ItemStats } from '../types/item';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { exportToCSV } from '../utils/csvExport';
import { formatCurrency } from '../utils/formatters';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase/client';

interface StatsDashboardProps {
  stats: ItemStats;
  items?: any[]; // For CSV export
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ stats, items = [] }) => {
  const [isImporting, setIsImporting] = React.useState(false);

  const handleImport = async () => {
    setIsImporting(true);
    const toastId = toast.loading('Connecting to extension...');
    
    try {
      // 1. Detect Extension ID
      const extensionId = localStorage.getItem('extension_id');
      if (!extensionId) {
        throw new Error('Extension not detected. Please go to Marketplaces to connect.');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session found');

      // 2. Trigger Client-Side Import via Extension
      toast.loading('Waiting for extension to fetch items...', { id: toastId });
      
      const items = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Extension timed out')), 15000);
        
        if (!(window as any).chrome?.runtime) {
          clearTimeout(timeout);
          return reject(new Error('Chrome extension runtime not found'));
        }

        (window as any).chrome.runtime.sendMessage(
          extensionId,
          { type: 'IMPORT_MARKETPLACE', marketplace: 'ebay' },
          (response: any) => {
            clearTimeout(timeout);
            const err = (window as any).chrome.runtime.lastError;
            if (err) return reject(new Error(err.message));
            if (!response) return reject(new Error('No response from extension'));
            if (!response.success) return reject(new Error(response.error || 'Import failed'));
            
            resolve(response.items || []);
          }
        );
      });

      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('No active listings found on eBay.');
      }

      toast.loading(`Saving ${items.length} items to inventory...`, { id: toastId });

      // 3. Send to Server for Storage
      const response = await fetch('http://localhost:3000/api/ebay/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ items }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save items');
      }

      toast.success(`Successfully imported ${result.count} items!`, { id: toastId });
      
      // Trigger a reload (in a real app, we'd invalidate a react-query cache)
      setTimeout(() => window.location.reload(), 1500);
      
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message, { id: toastId });
    } finally {
      setIsImporting(false);
    }
  };

  // Calculate enhanced stats
  const totalInvested = items.reduce((sum, item) => sum + (item.costPrice || 0), 0);
  const roi = totalInvested > 0 ? Math.round(((stats.totalValue - totalInvested) / totalInvested) * 100) : 0;
  
  // Calculate average days to sell for sold items
  const soldItems = items.filter(item => item.status === 'SOLD');
  const avgDaysToSell = soldItems.length > 0 ? 
    Math.round(soldItems.reduce((sum, item) => {
      const days = item.dateAdded ? 
        Math.floor((new Date().getTime() - new Date(item.dateAdded).getTime()) / (1000 * 60 * 60 * 24)) : 0;
      return sum + days;
    }, 0) / soldItems.length) : 0;

  // Calculate best/worst categories
  const categoryStats = items.reduce((acc, item) => {
    const category = item.tags[0] || 'Other';
    if (!acc[category]) {
      acc[category] = { total: 0, profit: 0, count: 0 };
    }
    acc[category].total += item.sellingPrice || 0;
    acc[category].profit += (item.sellingPrice || 0) - (item.costPrice || 0);
    acc[category].count += 1;
    return acc;
  }, {} as Record<string, { total: number; profit: number; count: number }>);

  const bestCategory = Object.entries(categoryStats)
    .sort(([,a], [,b]) => (b as any).profit - (a as any).profit)[0];
  const worstCategory = Object.entries(categoryStats)
    .sort(([,a], [,b]) => (a as any).profit - (b as any).profit)[0];

  const statCards = [
    {
      title: 'Total Items',
      value: stats.totalItems,
      icon: Package,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Active Items',
      value: stats.activeItems,
      icon: TrendingUp,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Sold Items',
      value: stats.soldItems,
      icon: BarChart3,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Total Value',
      value: formatCurrency(stats.totalValue),
      icon: DollarSign,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      subtitle: 'Active inventory',
    },
    {
      title: 'Total Invested',
      value: formatCurrency(totalInvested),
      icon: DollarSign,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      subtitle: 'Cost basis',
    },
    {
      title: 'ROI',
      value: `${roi > 0 ? '+' : ''}${roi}%`,
      icon: TrendingUp,
      color: roi > 0 ? 'text-green-500' : 'text-red-500',
      bgColor: roi > 0 ? 'bg-green-500/10' : 'bg-red-500/10',
      subtitle: 'Return on investment',
    },
    {
      title: 'Avg Days to Sell',
      value: avgDaysToSell > 0 ? `${avgDaysToSell} days` : 'N/A',
      icon: BarChart3,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
      subtitle: 'For sold items',
    },
    {
      title: 'Best Category',
      value: bestCategory ? bestCategory[0] : 'N/A',
      icon: TrendingUp,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      subtitle: bestCategory ? `$${formatCurrency((bestCategory[1] as any).profit)} profit` : '',
    },
    {
      title: 'Worst Category',
      value: worstCategory ? worstCategory[0] : 'N/A',
      icon: BarChart3,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      subtitle: worstCategory ? `$${formatCurrency((worstCategory[1] as any).profit)} profit` : '',
    },
  ];

  return (
    <div>
      {/* Actions Bar */}
      <div className="mb-6 flex justify-end gap-3">
        <button
          onClick={handleImport}
          disabled={isImporting}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Import className={`h-4 w-4 ${isImporting ? 'animate-spin' : ''}`} />
          {isImporting ? 'Importing...' : 'Import from eBay'}
        </button>
        
        <button
          onClick={() => exportToCSV(items)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Download className="h-4 w-4" />
          Export to CSV
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index} className="border-gray-700 bg-gradient-to-br from-gray-800 to-gray-900">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400">
                  {stat.title}
                </CardTitle>
                <div className={`rounded-lg p-2 ${stat.bgColor}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mt-2">
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                {stat.subtitle && (
                  <p className="mt-1 text-xs text-gray-500">{stat.subtitle}</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      </div>
    </div>
  );
};
