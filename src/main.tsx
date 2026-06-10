import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.tsx'
import './index.css'
import { PerformanceMonitor, ErrorTracker } from './lib/performance'

// Kill any previously-registered service worker + its caches so users always
// see freshly-deployed code. The PWA plugin was removed because its SW kept
// serving stale shells after deploys. Runs once per load, fire-and-forget.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
    .catch(() => {});
}
if (typeof caches !== 'undefined' && caches.keys) {
  caches.keys()
    .then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {})))
    .catch(() => {});
}

// Initialize Sentry for error tracking and monitoring
Sentry.init({
  dsn: "https://90db4901ac85b08411a08a533f431358@o4510479986720768.ingest.us.sentry.io/4510480007495680",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: 1.0, // Capture 100% of the transactions
  tracePropagationTargets: ["localhost", /^https:\/\/closet-da8f2\.web\.app/],
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of errors
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD, // Only enable in production
  sendDefaultPii: true,
})

// Set up global error handlers in production
if (import.meta.env.PROD) {
  ErrorTracker.setupGlobalHandlers()
}

// Track Core Web Vitals
if (import.meta.env.PROD) {
  PerformanceMonitor.trackWebVitals()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">An error occurred. Please refresh the page.</div>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
