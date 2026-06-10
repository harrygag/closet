/**
 * Example Usage of ScanStatsWidget
 *
 * This file demonstrates how to integrate the ScanStatsWidget component
 * into an inventory scanning page with filter functionality.
 */

import React from 'react';
import { ScanStatsWidget } from './ScanStatsWidget';
import { useInventoryScanStore } from '../../store/useInventoryScanStore';
import { useItemStore } from '../../store/useItemStore';

/**
 * Example 1: Basic Usage (Display Only)
 */
export function BasicScanStatsExample() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-white">Inventory Scan Dashboard</h1>
      <ScanStatsWidget />
    </div>
  );
}

/**
 * Example 2: With Filter Integration
 * This example shows how to connect the widget to a spreadsheet filter system
 */
export function FilterIntegratedExample() {
  const { setFilterConfig, filterConfig } = useInventoryScanStore();
  const { items } = useItemStore();

  const handleFilterClick = (filterType: 'never-scanned' | 'overdue' | 'verified-today') => {
    // Clear other filters first
    setFilterConfig({
      status: [],
      tags: [],
      searchQuery: '',
    });

    // Apply the selected verification filter
    switch (filterType) {
      case 'never-scanned':
        setFilterConfig({
          verificationStatus: ['needs-verification'],
          lastScanned: 'never',
        });
        break;
      case 'overdue':
        setFilterConfig({
          verificationStatus: ['overdue'],
          lastScanned: '7d',
        });
        break;
      case 'verified-today':
        setFilterConfig({
          verificationStatus: ['verified'],
          lastScanned: '1d',
        });
        break;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Inventory Scan Dashboard</h1>
        <button
          onClick={() => setFilterConfig({ verificationStatus: [], lastScanned: 'all' })}
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600"
        >
          Clear Filters
        </button>
      </div>

      {/* Stats Widget */}
      <ScanStatsWidget onFilterClick={handleFilterClick} />

      {/* Active Filter Display */}
      {filterConfig.verificationStatus.length > 0 && (
        <div className="rounded-lg border border-blue-500 bg-blue-500/10 p-4">
          <p className="text-sm text-blue-400">
            Active Filter: {filterConfig.verificationStatus.join(', ')} |{' '}
            {filterConfig.lastScanned}
          </p>
        </div>
      )}

      {/* Your Spreadsheet Component Here */}
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <p className="text-gray-400">
          Showing {items.length} items (spreadsheet would go here)
        </p>
      </div>
    </div>
  );
}

/**
 * Example 3: Mobile Responsive Layout
 */
export function ResponsiveLayoutExample() {
  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header - Stacks on mobile */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-bold text-white md:text-3xl">
            Inventory Scan Dashboard
          </h1>
          <div className="flex gap-2">
            <button className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 md:flex-none">
              Start Scanning
            </button>
            <button className="flex-1 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600 md:flex-none">
              Export
            </button>
          </div>
        </div>

        {/* Stats Widget - Cards automatically stack on mobile */}
        <ScanStatsWidget />
      </div>
    </div>
  );
}

/**
 * Example 4: With Custom Daily Goal Setter
 */
export function CustomGoalExample() {
  const { dailyScanGoal, setDailyScanGoal } = useInventoryScanStore();
  const [isEditingGoal, setIsEditingGoal] = React.useState(false);
  const [newGoal, setNewGoal] = React.useState(dailyScanGoal.toString());

  const handleSaveGoal = () => {
    const goal = parseInt(newGoal, 10);
    if (!isNaN(goal) && goal > 0) {
      setDailyScanGoal(goal);
      setIsEditingGoal(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Goal Setter */}
      <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 p-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Daily Scan Goal</h2>
          <p className="text-sm text-gray-400">
            Current goal: {dailyScanGoal} items per day
          </p>
        </div>
        {!isEditingGoal ? (
          <button
            onClick={() => setIsEditingGoal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Edit Goal
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="number"
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              className="w-24 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
              min="1"
            />
            <button
              onClick={handleSaveGoal}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsEditingGoal(false);
                setNewGoal(dailyScanGoal.toString());
              }}
              className="rounded-lg bg-gray-600 px-4 py-2 text-sm text-white hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Stats Widget */}
      <ScanStatsWidget />
    </div>
  );
}
