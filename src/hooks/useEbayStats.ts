/**
 * useEbayStats Hook
 * 
 * Fetches and manages eBay statistics
 * Provides stats data and refresh methods
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { POLLING_CONFIG } from '../config/ebay';
import { ebayService, type EbayStats } from '../services/ebayService';

export interface UseEbayStatsReturn {
  // State
  stats: EbayStats | null;
  isLoading: boolean;
  error: string | null;
  
  // Methods
  fetchStats: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

/**
 * Custom hook for eBay statistics management
 * 
 * Features:
 * - Auto-fetch when connected
 * - Periodic refresh
 * - Error handling
 * - Loading states
 * 
 * @param {boolean} isConnected - Whether eBay is connected
 * @returns {UseEbayStatsReturn} Stats state and methods
 */
export function useEbayStats(isConnected: boolean): UseEbayStatsReturn {
  const [stats, setStats] = useState<EbayStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch eBay statistics
   */
  const fetchStats = useCallback(async () => {
    if (!isConnected) {
      console.log('⚠️ Not connected, skipping stats fetch');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const data = await ebayService.getStats();
      setStats(data);
      
      console.log('✅ Stats fetched:', data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch stats';
      setError(errorMsg);
      console.error('❌ Stats fetch failed:', err);
      
      // Don't show toast for every error (user might not be authenticated yet)
      if (!errorMsg.includes('authenticated')) {
        toast.error(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isConnected]);

  /**
   * Refresh stats manually
   */
  const refreshStats = useCallback(async () => {
    toast.info('Refreshing stats...');
    await fetchStats();
    toast.success('Stats updated');
  }, [fetchStats]);

  /**
   * Auto-fetch stats when connected
   */
  useEffect(() => {
    if (isConnected) {
      fetchStats();
      
      // Poll stats periodically
      const pollInterval = setInterval(() => {
        fetchStats();
      }, POLLING_CONFIG.STATS_INTERVAL);
      
      return () => {
        clearInterval(pollInterval);
      };
    } else {
      // Clear stats when disconnected
      setStats(null);
      setError(null);
    }
  }, [isConnected, fetchStats]);

  return {
    stats,
    isLoading,
    error,
    fetchStats,
    refreshStats,
  };
}

