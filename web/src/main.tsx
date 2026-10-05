import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { BusyProvider, LoadingOverlay, MascotProvider } from '@lndrstrll/pomuku-ui'
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

// Linkulino in every size the shared components draw a mascot at.
const MASCOT = { still: '/linkulino.gif', footer: '/linkulino.gif', large: '/linkulino.gif' }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <MascotProvider images={MASCOT}>
          <BusyProvider>
            <AuthProvider>
              <App />
              <LoadingOverlay />
            </AuthProvider>
          </BusyProvider>
        </MascotProvider>
      </BrowserRouter>
    </I18nextProvider>
  </StrictMode>,
)
