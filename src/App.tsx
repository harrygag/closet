import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/react';
import { SignIn } from './components/SignIn';
import { ClosetPage } from './pages/ClosetPage';
import { EbayIntegrationPage } from './pages/EbayIntegrationPage';
import { useAuthStore } from './store/useAuthStore';

function App() {
  const { user } = useAuthStore();

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900">
        <Toaster position="top-right" theme="dark" />
        <Analytics />
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
          {/* Test route - NO AUTH REQUIRED */}
          <Route
            path="/ebay-test"
            element={<EbayIntegrationPage />}
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
