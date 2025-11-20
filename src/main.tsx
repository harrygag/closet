import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { PerformanceMonitor, ErrorTracker } from './lib/performance'
import { Analytics } from '@vercel/analytics/react'

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
    <App />
    <Analytics />
  </React.StrictMode>,
)
