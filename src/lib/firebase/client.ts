import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, indexedDBLocalPersistence, inMemoryPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Log config for debugging (remove apiKey for security)
console.log('[FIREBASE CONFIG]', {
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  appId: firebaseConfig.appId,
});

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);

// Try to use IndexedDB first, fall back to memory if storage is full
setPersistence(auth, indexedDBLocalPersistence).catch((error) => {
  console.warn('[AUTH] IndexedDB persistence failed, using memory-only:', error.code);
  // Fall back to in-memory persistence if IndexedDB fails
  return setPersistence(auth, inMemoryPersistence);
}).catch((error) => {
  console.error('[AUTH] All persistence methods failed:', error);
});

export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Analytics (only in browser)
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Helper to check if user is authenticated
export const isAuthenticated = () => {
  return !!auth.currentUser;
};

// Helper to get current user
export const getCurrentUser = () => {
  return auth.currentUser;
};

// Helper to sign out
export const signOut = async () => {
  await auth.signOut();
};
