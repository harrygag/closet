import React from 'react'
import ReactDOM from 'react-dom/client'
import ShopifyStorefront from './pages/ShopifyStorefront'
import './index.css'

// Find the root element in the Shopify theme
const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ShopifyStorefront />
    </React.StrictMode>,
  )
}

