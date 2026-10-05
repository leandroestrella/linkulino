import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // pomuku's packages must use this app's copy of React and i18next, not one
    // of their own: two copies of either break hooks and translations. npm
    // already installs a single copy; this also holds when a package is linked
    // from a local checkout while working on it.
    dedupe: ['react', 'react-dom', 'react-i18next', 'i18next'],
  },
  server: {
    fs: {
      // The About page imports the repo-root README.md (?raw), which lives one
      // level above web/, so the dev server must be allowed to read it.
      allow: [path.resolve(__dirname, '..')],
    },
  },
})
