import React from 'react';
import { TrendingUp, Package, DollarSign, BarChart3 } from 'lucide-react';
import type { ItemStats } from '../types/item';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { formatCurrency } from '../utils/formatters';

interface StatsDashboardProps {
  stats: ItemStats;
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ stats }) => {
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
      title: 'Total Profit',
      value: formatCurrency(stats.totalProfit),
      icon: DollarSign,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      subtitle: 'From sold items',
    },
    {
      title: 'Avg Profit/Item',
      value: formatCurrency(stats.averageProfit),
      icon: TrendingUp,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
      subtitle: 'Per sold item',
    },
  ];

  return (
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
  );
};
