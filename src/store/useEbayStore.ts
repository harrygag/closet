import { create } from 'zustand';
import type { EbayListing, ImportResult } from '../types/ebay';
import { initiateEbayConnection, checkEbayConnection, disconnectEbay } from '../services/ebay/auth';
import { fetchEbayListings, importEbayItems } from '../services/ebay/import';
import { initiateDirectEbayAuth } from '../services/ebay/directAuth';
import { toast } from 'sonner';

interface EbayState {
  isConnected: boolean;
  listings: EbayListing[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  checkConnection: (userId: string) => Promise<void>;
  connectEbay: (userId: string) => Promise<void>;
  disconnect: (userId: string) => Promise<void>;
  fetchListings: (userId: string) => Promise<void>;
  importItems: (userId: string, selectedListings: EbayListing[]) => Promise<ImportResult>;
  reset: () => void;
}

export const useEbayStore = create<EbayState>((set) => ({
  isConnected: false,
  listings: [],
  isLoading: false,
  error: null,

  checkConnection: async (userId: string) => {
    try {
      set({ isLoading: true, error: null });
      const connection = await checkEbayConnection(userId);
      set({ isConnected: connection.connected, isLoading: false });
    } catch (error) {
      console.error('Error checking eBay connection:', error);
      set({ 
        isConnected: false, 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to check connection' 
      });
    }
  },

  connectEbay: async (userId: string) => {
    try {
      set({ isLoading: true, error: null });
      
      // Try backend API first, fall back to direct auth
      try {
        const oauthUrl = await initiateEbayConnection(userId);
        
        // Open OAuth window
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        
        const popup = window.open(
          oauthUrl,
          'eBay Authorization',
          `width=${width},height=${height},left=${left},top=${top}`
        );

        if (!popup) {
          throw new Error('Failed to open authorization window. Please allow pop-ups.');
        }

        // Poll for connection success
        const checkInterval = setInterval(async () => {
          try {
            const connection = await checkEbayConnection(userId);
            if (connection.connected) {
              clearInterval(checkInterval);
              set({ isConnected: true, isLoading: false });
              toast.success('eBay connected successfully!');
              popup.close();
            }
          } catch (error) {
            // Continue polling
          }
        }, 2000);

        // Stop polling after 5 minutes
        setTimeout(() => {
          clearInterval(checkInterval);
          set({ isLoading: false });
        }, 300000);
      } catch (apiError) {
        // Backend API not available, use direct OAuth
        console.log('Backend API not available, using direct OAuth flow');
        initiateDirectEbayAuth(userId);
        set({ isLoading: false });
        toast.info('Opening eBay authorization. Complete the authorization and return here.');
      }
    } catch (error) {
      console.error('Error connecting eBay:', error);
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to connect eBay' 
      });
      toast.error(error instanceof Error ? error.message : 'Failed to connect eBay');
    }
  },

  disconnect: async (userId: string) => {
    try {
      set({ isLoading: true, error: null });
      await disconnectEbay(userId);
      set({ isConnected: false, listings: [], isLoading: false });
      toast.success('eBay disconnected');
    } catch (error) {
      console.error('Error disconnecting eBay:', error);
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to disconnect' 
      });
      toast.error('Failed to disconnect eBay');
    }
  },

  fetchListings: async (userId: string) => {
    try {
      set({ isLoading: true, error: null });
      const listings = await fetchEbayListings(userId);
      set({ listings, isLoading: false });
    } catch (error) {
      console.error('Error fetching listings:', error);
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch listings' 
      });
      toast.error('Failed to fetch eBay listings');
    }
  },

  importItems: async (userId: string, selectedListings: EbayListing[]) => {
    try {
      set({ isLoading: true, error: null });
      const result = await importEbayItems(userId, selectedListings);
      set({ isLoading: false });
      
      // Show results
      if (result.imported.length > 0) {
        toast.success(`${result.imported.length} items imported successfully`);
      }
      if (result.skipped.length > 0) {
        toast.info(`${result.skipped.length} items already imported`);
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} items failed to import`);
      }
      
      return result;
    } catch (error) {
      console.error('Error importing items:', error);
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to import items' 
      });
      toast.error('Failed to import items');
      throw error;
    }
  },

  reset: () => {
    set({
      isConnected: false,
      listings: [],
      isLoading: false,
      error: null,
    });
  },
}));

