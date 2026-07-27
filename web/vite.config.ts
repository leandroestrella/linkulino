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
  },
  server: {
    fs: {
      // The About page imports the repo-root README.md (?raw), which lives one
      // level above web/, so the dev server must be allowed to read it.
      allow: [path.resolve(__dirname, '..')],
    },
  },
})
