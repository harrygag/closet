// Authentication store for user session management
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  email: string;
  name: string;
  joinedDate: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  
  // Actions
  signIn: (email: string, name: string) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      signIn: (email: string, name: string) => {
        const user: User = {
          email,
          name,
          joinedDate: new Date().toISOString(),
        };
        set({ user, isAuthenticated: true });
      },

      signOut: () => {
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'closet-auth-storage',
    }
  )
);
