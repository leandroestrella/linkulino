import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Dedicated Vitest config so unit tests stay HERMETIC: without this, Vite would
// load .env.local (which sets VITE_API_URL for local dev) and the client's
// tests would reach the real backend over the network. We force the
// API/client-id env empty here; the backend-mode test opts back in with
// vi.stubEnv, and answers every request itself.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    env: {
      VITE_API_URL: '',
      VITE_GOOGLE_CLIENT_ID: '',
    },
  },
})
