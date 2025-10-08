import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  lastLogin: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (name: string, email: string) => void;
  signOut: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      signIn: (name: string, email: string) => {
        set({ isLoading: true });
        
        // Create user with secure data
        const user: User = {
          id: crypto.randomUUID(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          createdAt: Date.now(),
          lastLogin: Date.now(),
        };

        set({ 
          user, 
          isAuthenticated: true, 
          isLoading: false 
        });
      },

      signOut: () => {
        set({ 
          user: null, 
          isAuthenticated: false, 
          isLoading: false 
        });
      },

      updateUser: (updates: Partial<User>) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              ...updates,
              lastLogin: Date.now(),
            }
          });
        }
      },
    }),
    {
      name: 'closet-auth-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist essential user data
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);