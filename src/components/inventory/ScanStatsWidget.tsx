import React from 'react';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { useInventoryScanStore } from '../../store/useInventoryScanStore';
import { useItemStore } from '../../store/useItemStore';

interface ScanStatsWidgetProps {
  onFilterClick?: (filterType: 'never-scanned' | 'overdue' | 'verified-today') => void;
}

export const ScanStatsWidget: React.FC<ScanStatsWidgetProps> = ({ onFilterClick }) => {
  const {
    getTodayScanCount,
    getScanProgress,
    getItemsNeedingScan,
    getNeverScannedItems,
    dailyScanGoal,
  } = useInventoryScanStore();

  const { items } = useItemStore();

  // Calculate stats
  const scannedToday = getTodayScanCount();
  const progress = getScanProgress(dailyScanGoal);
  const overdueItems = getItemsNeedingScan(items, 7);
  const neverScannedItems = getNeverScannedItems(items);

  // Calculate verified today from items (items scanned within last 24 hours)
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const verifiedTodayItems = items.filter((item) => {
    if (!item.lastScannedDate) return false;
    const lastScan = new Date(item.lastScannedDate);
    return lastScan >= oneDayAgo;
  });

  const statCards = [
    {
      id: 'never-scanned' as const,
      title: 'Never Scanned',
      value: neverScannedItems.length,
      icon: AlertTriangle,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/20',
      borderColor: 'hover:border-yellow-500',
      description: 'Items with no scan history',
    },
    {
      id: 'overdue' as const,
      title: 'Overdue',
      value: overdueItems.length,
      icon: Clock,
      color: 'text-red-400',
      bgColor: 'bg-red-500/20',
      borderColor: 'hover:border-red-500',
      description: 'Not scanned in 7+ days',
    },
    {
      id: 'verified-today' as const,
      title: 'Verified Today',
      value: verifiedTodayItems.length,
      icon: CheckCircle2,
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      borderColor: 'hover:border-green-500',
      description: 'Scanned within 24 hours',
    },
  ];

  const handleCardClick = (filterType: 'never-scanned' | 'overdue' | 'verified-today') => {
    if (onFilterClick) {
      onFilterClick(filterType);
    }
  };

  return (
    <div className="space-y-4">
      {/* Progress Section */}
      <Card className="border-gray-700 bg-gray-800">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-white">
            Daily Scan Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Progress Text */}
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-gray-400">
                <span className="text-2xl font-bold text-white">{scannedToday}</span>
                <span className="text-gray-500"> / {dailyScanGoal}</span> items scanned today
              </p>
              <span className="text-lg font-semibold text-blue-400">
                {progress.percent.toFixed(1)}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
                style={{ width: `${Math.min(progress.percent, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.id}
              className={`border-gray-700 bg-gray-800/50 transition-all ${
                onFilterClick ? `cursor-pointer ${stat.borderColor}` : ''
              }`}
              onClick={() => handleCardClick(stat.id)}
            >
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
                  <div className="text-3xl font-bold text-white">{stat.value}</div>
                  <p className="mt-1 text-xs text-gray-500">{stat.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
