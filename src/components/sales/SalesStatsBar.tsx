import React from 'react';
import type { SaleStats } from '../../types/sale';
import { DollarSign, TrendingUp, BarChart3, Percent } from 'lucide-react';

interface SalesStatsBarProps {
  stats: SaleStats;
}

export const SalesStatsBar: React.FC<SalesStatsBarProps> = ({ stats }) => {
  const formatCurrency = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const StatCard: React.FC<{
    label: string;
    value: string | number;
    icon: React.ReactNode;
    color?: string;
  }> = ({ label, value, icon, color = 'text-blue-400' }) => (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        <div className={color}>{icon}</div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-gray-800/30 rounded-lg border border-gray-700/50">
      <StatCard
        label="Total Sales"
        value={stats.totalSales}
        icon={<BarChart3 className="h-5 w-5" />}
        color="text-blue-400"
      />

      <StatCard
        label="Revenue"
        value={formatCurrency(stats.totalRevenue)}
        icon={<DollarSign className="h-5 w-5" />}
        color="text-green-400"
      />

      <StatCard
        label="Total Profit"
        value={formatCurrency(stats.totalProfit)}
        icon={<TrendingUp className="h-5 w-5" />}
        color={stats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}
      />

      <StatCard
        label="Profit Margin"
        value={`${stats.profitMargin.toFixed(1)}%`}
        icon={<Percent className="h-5 w-5" />}
        color={stats.profitMargin >= 20 ? 'text-green-400' : stats.profitMargin >= 0 ? 'text-yellow-400' : 'text-red-400'}
      />
    </div>
  );
};
