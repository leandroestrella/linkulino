import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { BusyProvider } from '@/components/BusyProvider'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { installStaleChunkReload } from '@/lib/staleChunkReload'
import { visit } from '@/backend'
import { i18n } from '@/i18n'
import './index.css'
import App from './App.tsx'

installStaleChunkReload()

// Someone opened the app: the backend takes a look at the spreadsheet, if its
// last look is a few minutes old, so edits made there show up without anyone
// asking. Once per page load; never fails.
visit()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <AuthProvider>
          <BusyProvider>
            <App />
            <LoadingOverlay />
          </BusyProvider>
        </AuthProvider>
      </BrowserRouter>
    </I18nextProvider>
  </StrictMode>,
)
