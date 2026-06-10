import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/react';
import { SignIn } from './components/SignIn';
import { Navigation } from './components/Navigation';
import { ClosetPage } from './pages/ClosetPage';
import { EbayIntegrationPage } from './pages/EbayIntegrationPage';
import { DepopIntegrationPage } from './pages/DepopIntegrationPage';
import { PoshmarkIntegrationPage } from './pages/PoshmarkIntegrationPage';
import { FacebookIntegrationPage } from './pages/FacebookIntegrationPage';
import { WhatnotIntegrationPage } from './pages/WhatnotIntegrationPage';
import { MessagesPage } from './pages/MessagesPage';
import { ImportPage } from './pages/ImportPage';
import { UnifiedImportPage } from './pages/UnifiedImportPage';
import { EbayCallbackPage } from './pages/EbayCallbackPage';
import MarketplacesPage from './pages/MarketplacesPage';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { SalesPage } from './pages/SalesPage';
import { UnifiedSalesPage } from './pages/UnifiedSalesPage';
import { ToolsPage } from './pages/ToolsPage';
import { DocsPage } from './pages/DocsPage';
import { DelistingWarningModal } from './components/DelistingWarningModal';
import { ClawdChat } from './components/ClawdChat';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { hasCompletedOnboarding, markOnboardingComplete, OPEN_EVENT as ONBOARDING_OPEN_EVENT } from './lib/onboarding';
import { useAuthStore } from './store/useAuthStore';
import { useItemStore } from './store/useItemStore';

function App() {
  const { user, isLoading, initialize } = useAuthStore();
  const { items, initializeStore } = useItemStore();
  const [showDelistingWarning, setShowDelistingWarning] = useState(false);
  const [delistingConfirmed, setDelistingConfirmed] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Initialize the item store app-wide as soon as auth resolves. Without this, items
  // only load when the user lands on /closet (ClosetPage calls initializeStore in its
  // own mount effect). Any feature that depends on items on other pages (Depop/Poshmark
  // match flows, SaleReconcileModal, DepopSoldModal, PoshmarkSoldModal, the matcher)
  // would otherwise see useItemStore.items === [] until the user visits /closet.
  useEffect(() => {
    if (user?.id) {
      initializeStore(user.id);
    }
  }, [user?.id, initializeStore]);

  // Check for unconfirmed sold items when user logs in or items change
  useEffect(() => {
    if (user && items.length > 0 && !delistingConfirmed) {
      const unconfirmedSoldItems = items.filter(
        item => item.status === 'SOLD' && !item.delistedConfirmed
      );

      if (unconfirmedSoldItems.length > 0) {
        setShowDelistingWarning(true);
      }
    }
  }, [user, items, delistingConfirmed]);

  const handleDelistingConfirmed = () => {
    setDelistingConfirmed(true);
    setShowDelistingWarning(false);
  };

  // Auto-open the onboarding tour on first sign-in (no completion flag in
  // Firestore). Replay is wired through a window event the ? nav button fires.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    hasCompletedOnboarding(user.id).then((done) => {
      if (!cancelled && !done) setShowOnboarding(true);
    });
    const onOpen = () => setShowOnboarding(true);
    window.addEventListener(ONBOARDING_OPEN_EVENT, onOpen);
    return () => { cancelled = true; window.removeEventListener(ONBOARDING_OPEN_EVENT, onOpen); };
  }, [user?.id]);

  const handleOnboardingClose = () => {
    setShowOnboarding(false);
    if (user?.id) markOnboardingComplete(user.id);
  };

  // Show loading screen while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-100 text-xl font-medium">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950">
        <Toaster position="top-right" theme="dark" />
        <Analytics />

        {/* Delisting Warning Modal - Blocks app until confirmed */}
        {user && showDelistingWarning && (
          <DelistingWarningModal
            items={items}
            open={showDelistingWarning}
            onConfirmAll={handleDelistingConfirmed}
          />
        )}

        {user && <Navigation />}
        {user && <ClawdChat />}
        {user && (
          <OnboardingModal open={showOnboarding} onClose={handleOnboardingClose} />
        )}
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
          <Route
            path="/depop"
            element={user ? <DepopIntegrationPage /> : <Navigate to="/" />}
          />
          <Route
            path="/poshmark"
            element={user ? <PoshmarkIntegrationPage /> : <Navigate to="/" />}
          />
          <Route
            path="/facebook"
            element={user ? <FacebookIntegrationPage /> : <Navigate to="/" />}
          />
          <Route
            path="/whatnot"
            element={user ? <WhatnotIntegrationPage /> : <Navigate to="/" />}
          />
          <Route
            path="/messages"
            element={user ? <MessagesPage /> : <Navigate to="/" />}
          />
          <Route
            path="/marketplaces"
            element={user ? <MarketplacesPage /> : <Navigate to="/" />}
          />
          {/* Unified Sales — eBay / Poshmark / Depop / in-person in one feed
              with per-platform Sold workflows accessible via the logo strip. */}
          <Route
            path="/sales"
            element={user ? <UnifiedSalesPage /> : <Navigate to="/" />}
          />
          {/* Legacy direct-grid route, kept reachable in case anything links
              to it. The new /sales already renders this as its default view. */}
          <Route
            path="/sales/grid"
            element={user ? <SalesPage /> : <Navigate to="/" />}
          />
          {/* Docs - Protected Route. Reads /ARCHITECTURE.md + /FUNCTIONS.md from
              the public folder (copied there at build time from repo root). */}
          <Route
            path="/docs"
            element={user ? <DocsPage /> : <Navigate to="/" />}
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
          {/* Unified Import Page — eBay / Poshmark / Depop in one place */}
          <Route
            path="/import"
            element={user ? <UnifiedImportPage /> : <Navigate to="/" />}
          />
          {/* Legacy CSV importer (Vendoo CSV) — kept reachable for bulk seed */}
          <Route
            path="/import/csv"
            element={user ? <ImportPage /> : <Navigate to="/" />}
          />
          {/* Tools — stock-tracking hub (delist queue, should-list, reconciliation) */}
          <Route
            path="/tools"
            element={user ? <ToolsPage /> : <Navigate to="/" />}
          />
          {/* Item Detail Page - Public Route (for QR code scanning) */}
          <Route
            path="/items/:id"
            element={<ItemDetailPage />}
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
