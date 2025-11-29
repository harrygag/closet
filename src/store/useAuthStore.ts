import { create } from 'zustand';
import { auth } from '../lib/firebase/client';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth';

export interface User {
  id: string;
  email: string;
  display_name?: string;
  created_at: string;
}

interface AuthState {
  user: User | null;
  session: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => void;
  clearError: () => void;
}

// Helper to transform Firebase user to our User type
const transformUser = (firebaseUser: FirebaseUser): User => ({
  id: firebaseUser.uid,
  email: firebaseUser.email!,
  display_name: firebaseUser.displayName || undefined,
  created_at: firebaseUser.metadata.creationTime || new Date().toISOString(),
});

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  signUp: async (email: string, password: string, _displayName?: string) => {
    set({ isLoading: true, error: null });

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      set({
        user: transformUser(userCredential.user),
        session: null,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to sign up',
        isLoading: false,
      });
      throw error;
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      set({
        user: transformUser(userCredential.user),
        session: null,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to sign in',
        isLoading: false,
      });
      throw error;
    }
  },

  signInWithGoogle: async () => {
    console.log('[AUTH] signInWithGoogle called');
    set({ error: null });

    try {
      const provider = new GoogleAuthProvider();
      console.log('[AUTH] Calling signInWithPopup...');
      const result = await signInWithPopup(auth, provider);
      console.log('[AUTH] signInWithPopup success:', result.user.email);

      set({
        user: transformUser(result.user),
        session: null,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      console.error('[AUTH] signInWithPopup error:', error.code, error.message);
      set({
        error: error.message,
        isLoading: false,
      });
      throw error;
    }
  },

  signOut: async () => {
    set({ isLoading: true, error: null });

    try {
      await firebaseSignOut(auth);

      set({
        user: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to sign out',
        isLoading: false,
      });
      throw error;
    }
  },

  initialize: () => {
    console.log('[AUTH] Initializing auth, current user:', auth.currentUser?.email);

    // Check if user is already signed in
    const currentUser = auth.currentUser;
    if (currentUser) {
      console.log('[AUTH] User already signed in:', currentUser.email);
      set({
        user: transformUser(currentUser),
        session: null,
        isAuthenticated: true,
        isLoading: false,
      });
      return;
    }

    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.warn('[AUTH] onAuthStateChanged timeout - setting loading to false');
      set({ isLoading: false });
    }, 2000);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout);
      console.log('[AUTH] Auth state changed:', user ? user.email : 'No user');

      if (user) {
        set({
          user: transformUser(user),
          session: null,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({
          user: null,
          session: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    });

    return unsubscribe;
  },

  clearError: () => set({ error: null }),
}));
