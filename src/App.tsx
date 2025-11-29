import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/react';
import { SignIn } from './components/SignIn';
import { Navigation } from './components/Navigation';
import { ClosetPage } from './pages/ClosetPage';
import { EbayIntegrationPage } from './pages/EbayIntegrationPage';
import ShopifyStorefront from './pages/ShopifyStorefront';
import ShopifyAdminPage from './pages/ShopifyAdminPage';
import { ImportPage } from './pages/ImportPage';
import { ScanPage } from './pages/ScanPage';
import { EbayCallbackPage } from './pages/EbayCallbackPage';
import { useAuthStore } from './store/useAuthStore';

function App() {
  const { user, isLoading, initialize } = useAuthStore();

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Show loading screen while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900">
        <Toaster position="top-right" theme="dark" />
        <Analytics />
        {user && <Navigation />}
        <Routes>
          <Route
            path="/"
            element={user ? <Navigate to="/closet" /> : <SignIn />}
          />
          <Route
            path="/closet"
            element={user ? <ClosetPage /> : <Navigate to="/" />}
          />
          <Route
            path="/ebay"
            element={user ? <EbayIntegrationPage /> : <Navigate to="/" />}
          />
          {/* Shopify Storefront - Public Route */}
          <Route
            path="/shop"
            element={<ShopifyStorefront />}
          />
          {/* Shopify Admin - Protected Route */}
          <Route
            path="/shopify"
            element={user ? <ShopifyAdminPage /> : <Navigate to="/" />}
          />
          {/* Test route - NO AUTH REQUIRED */}
          <Route
            path="/ebay-test"
            element={<EbayIntegrationPage />}
          />
          {/* eBay OAuth Callback - NO AUTH (popup page) */}
          <Route
            path="/ebay-callback"
            element={<EbayCallbackPage />}
          />
          {/* Import Page - Protected Route */}
          <Route
            path="/import"
            element={user ? <ImportPage /> : <Navigate to="/" />}
          />
          {/* Scan Page - Protected Route */}
          <Route
            path="/scan"
            element={user ? <ScanPage /> : <Navigate to="/" />}
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
