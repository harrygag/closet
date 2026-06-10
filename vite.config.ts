import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
// NOTE: VitePWA was removed because its service worker caused users to see
// stale UI after deploys. Old SWs are unregistered in main.tsx on every load.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
