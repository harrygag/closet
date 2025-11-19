import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';

interface VendooItem {
  title: string;
  url: string;
  price?: string;
  imageUrl?: string;
  status?: string;
}

interface VendooState {
  // Credentials state
  hasCredentials: boolean;
  isCheckingCredentials: boolean;
  
  // Scraping state
  items: VendooItem[];
  isLoading: boolean;
  error: string | null;
  lastScrapedAt: string | null;
  
  // Actions
  checkCredentials: () => Promise<void>;
  saveCredentials: (email: string, password: string) => Promise<void>;
  deleteCredentials: () => Promise<void>;
  fetchVendooLinks: () => Promise<void>;
  clearError: () => void;
}

export const useVendooStore = create<VendooState>((set) => ({
  // Initial state
  hasCredentials: false,
  isCheckingCredentials: false,
  items: [],
  isLoading: false,
  error: null,
  lastScrapedAt: null,

  // Check if user has saved Vendoo credentials
  checkCredentials: async () => {
    set({ isCheckingCredentials: true });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        set({ hasCredentials: false, isCheckingCredentials: false });
        return;
      }

      const { data, error } = await supabase
        .from('user_vendoo_credentials')
        .select('id')
        .eq('user_uuid', user.id)
        .single();

      set({ 
        hasCredentials: !error && !!data,
        isCheckingCredentials: false 
      });
    } catch (error) {
      console.error('Error checking credentials:', error);
      set({ hasCredentials: false, isCheckingCredentials: false });
    }
  },

  // Save Vendoo credentials
  saveCredentials: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // TODO: Implement proper encryption on the backend
      // For now, we're storing the password as-is (NOT SECURE FOR PRODUCTION)
      const { error } = await (supabase as any)
        .from('user_vendoo_credentials')
        .upsert({
          user_uuid: user.id,
          vendoo_email: email,
          vendoo_password_encrypted: password, // Will encrypt in production
        }, {
          onConflict: 'user_uuid'
        });

      if (error) throw error;

      console.log('✅ Vendoo credentials saved');
      set({ hasCredentials: true, isLoading: false });
    } catch (error) {
      console.error('❌ Failed to save credentials:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to save credentials',
        isLoading: false 
      });
      throw error;
    }
  },

  // Delete Vendoo credentials
  deleteCredentials: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('user_vendoo_credentials')
        .delete()
        .eq('user_uuid', user.id);

      if (error) throw error;

      console.log('✅ Vendoo credentials deleted');
      set({ hasCredentials: false, isLoading: false, items: [] });
    } catch (error) {
      console.error('❌ Failed to delete credentials:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete credentials',
        isLoading: false 
      });
      throw error;
    }
  },

  // Fetch Vendoo links using Vercel serverless function
  fetchVendooLinks: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('User not authenticated');

      console.log('🚀 Calling Vercel Vendoo scraper...');

      // Call Vercel serverless function
      const apiUrl = import.meta.env.VITE_VERCEL_URL 
        ? `https://${import.meta.env.VITE_VERCEL_URL}/api/vendoo-scrape`
        : '/api/vendoo-scrape'; // Local or production

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Scraper failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Scraper result:', data);

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.needsSetup) {
        set({ 
          hasCredentials: false,
          error: 'Please save your Vendoo credentials first',
          isLoading: false 
        });
        return;
      }

      console.log(`✅ Scraped ${data.scrapedCount} items, updated ${data.updatedCount} in database`);
      set({ 
        items: data.items || [],
        lastScrapedAt: data.scrapedAt,
        isLoading: false,
        error: null 
      });

      // Show success alert
      alert(`✅ Success! Scraped ${data.scrapedCount} items from Vendoo and updated ${data.updatedCount} items in database.`);

    } catch (error) {
      console.error('❌ Failed to fetch Vendoo links:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch links from Vendoo',
        isLoading: false 
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));

