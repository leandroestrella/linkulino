import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { BusyProvider } from '@/components/BusyProvider'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import '@/i18n'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BusyProvider>
          <App />
          <LoadingOverlay />
        </BusyProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
