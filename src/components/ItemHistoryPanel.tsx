import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Item } from '../types/item';

interface ItemHistoryPanelProps {
  item: Item;
  open: boolean;
  onClose: () => void;
}

type Tab = 'activity' | 'sales';

const ACTION_STYLES: Record<string, { color: string; bg: string }> = {
  SOLD: { color: 'bg-red-500', bg: 'border-red-500/30' },
  SCAN: { color: 'bg-blue-500', bg: 'border-blue-500/30' },
  QTY_CHANGE: { color: 'bg-yellow-500', bg: 'border-yellow-500/30' },
  PRICE_CHANGE: { color: 'bg-green-500', bg: 'border-green-500/30' },
  STOCK_ADDED: { color: 'bg-green-500', bg: 'border-green-500/30' },
  EBAY_SYNC: { color: 'bg-purple-500', bg: 'border-purple-500/30' },
  STATUS_CHANGE: { color: 'bg-gray-500', bg: 'border-gray-500/30' },
  LISTED: { color: 'bg-blue-500', bg: 'border-blue-500/30' },
  DELISTED: { color: 'bg-gray-500', bg: 'border-gray-500/30' },
};

const PLATFORM_STYLES: Record<string, { label: string; color: string }> = {
  ebay: { label: 'eBay', color: 'bg-blue-600 text-blue-100' },
  poshmark: { label: 'Poshmark', color: 'bg-red-600 text-red-100' },
  depop: { label: 'Depop', color: 'bg-orange-600 text-orange-100' },
  in_person: { label: 'In Person', color: 'bg-gray-600 text-gray-100' },
  other: { label: 'Other', color: 'bg-gray-600 text-gray-100' },
};

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) + ', ' + date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

export const ItemHistoryPanel: React.FC<ItemHistoryPanelProps> = ({ item, open, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('activity');

  if (!open) return null;

  const activities = [...(item.itemActivity || [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const sales = [...(item.unitSales || [])].sort(
    (a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()
  );

  const totalSalesCents = sales.reduce((sum, s) => sum + (s.priceCents || 0), 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 w-96 h-full bg-gray-900 border-l border-white/10 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white truncate pr-4">
            {item.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
            aria-label="Close history panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'activity'
                ? 'text-white border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Activity
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'sales'
                ? 'text-white border-b-2 border-green-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Sales
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'activity' ? (
            activities.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                No activity recorded yet
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />

                <div className="space-y-4">
                  {activities.map((entry, idx) => {
                    const style = ACTION_STYLES[entry.action] || ACTION_STYLES.STATUS_CHANGE;
                    return (
                      <div key={idx} className="relative pl-7">
                        {/* Timeline dot */}
                        <div
                          className={`absolute left-0 top-1 w-[15px] h-[15px] rounded-full ${style.color} border-2 border-gray-900`}
                        />

                        <div className="text-sm">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                              {entry.action.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-gray-200 text-sm">{entry.details}</p>
                          {entry.oldValue && entry.newValue && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Changed from{' '}
                              <span className="text-gray-300">{entry.oldValue}</span>{' '}
                              to{' '}
                              <span className="text-gray-300">{entry.newValue}</span>
                            </p>
                          )}
                          <p className="text-xs text-gray-600 mt-1">
                            {formatTimestamp(entry.timestamp)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            /* Sales tab */
            sales.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                No sales recorded yet
              </div>
            ) : (
              <div>
                {/* Summary */}
                <div className="mb-4 px-3 py-2 bg-white/[0.03] rounded-xl border border-white/10 text-sm text-gray-300">
                  <span className="text-white font-medium">{sales.length}</span>{' '}
                  unit{sales.length !== 1 ? 's' : ''} sold{' '}
                  <span className="text-gray-500 mx-1">&middot;</span>{' '}
                  <span className="text-green-400 font-medium">
                    {formatCents(totalSalesCents)}
                  </span>{' '}
                  total
                </div>

                {/* Sales list */}
                <div className="space-y-2">
                  {sales.map((sale, idx) => {
                    const platformInfo =
                      PLATFORM_STYLES[sale.platform] || PLATFORM_STYLES.other;
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                      >
                        {/* Platform badge */}
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${platformInfo.color} flex-shrink-0`}
                        >
                          {platformInfo.label}
                        </span>

                        {/* Date */}
                        <span className="text-xs text-gray-400 flex-1">
                          {formatTimestamp(sale.soldAt)}
                        </span>

                        {/* Price */}
                        <span className="text-sm font-medium text-green-400 flex-shrink-0">
                          {formatCents(sale.priceCents)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
};
