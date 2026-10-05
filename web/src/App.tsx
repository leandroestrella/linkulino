import { lazy, Suspense, type ReactNode } from 'react'
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthBar } from '@lndrstrll/pomuku-auth'
import { AppShell, FooterMascot, LanguageSwitcher, LoadingAvatar, Mascot, NavGlyph } from '@lndrstrll/pomuku-ui'
import { useAuth } from '@/auth/AuthProvider'

// Each page is its own chunk, fetched on first visit rather than bundled into
// the main entry — the About page alone pulls in react-markdown/remark-gfm/
// rehype-raw for the README, which most sessions never open.
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const ExpenseFormPage = lazy(() =>
  import('@/pages/ExpenseFormPage').then((m) => ({ default: m.ExpenseFormPage })),
)
const AboutPage = lazy(() => import('@/pages/AboutPage').then((m) => ({ default: m.AboutPage })))
const TripsPage = lazy(() => import('@/pages/TripsPage').then((m) => ({ default: m.TripsPage })))
const TripDetailPage = lazy(() =>
  import('@/pages/TripDetailPage').then((m) => ({ default: m.TripDetailPage })),
)
const TripEditPage = lazy(() =>
  import('@/pages/TripEditPage').then((m) => ({ default: m.TripEditPage })),
)
const OverviewPage = lazy(() =>
  import('@/pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
)
const HistoryPage = lazy(() =>
  import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

/**
 * Decides what a visitor sees before (or instead of) signing in.
 *
 * Nothing in the backend is public: every read and write needs a session of
 * someone on the `Users` tab, so there is genuinely no real data to show a
 * signed-out visitor. Rather than a locked door, they get the app running on
 * the sample fixtures — fully usable, edits included, since those only ever
 * touch an in-memory copy (see api/demo.ts). Signing in swaps the same UI onto
 * their own data.
 *
 * /about is the rendered README and never calls the API, so it sits outside
 * this component entirely.
 */
function ReadGate() {
  const { t } = useTranslation()
  const { status, authorized, demo } = useAuth()

  // Still working out whether anyone is signed in — showing the demo here
  // would make the app flash sample data before the real data replaces it.
  if (status === 'loading') return <LoadingAvatar />

  // Signed in, but this Google account isn't on the sheet's allowlist. Say so
  // plainly instead of dropping them into the demo, which would look like
  // their data had been replaced by someone else's.
  if (status === 'signed-in' && !authorized) {
    return <p className="text-destructive">{t('form.notAllowlisted')}</p>
  }

  if (!demo) return <Outlet />

  return (
    <div className="flex flex-col gap-4">
      <DemoBanner />
      <Outlet />
    </div>
  )
}

/** Standing notice that the numbers on screen are sample data, not anyone's real ledger. */
function DemoBanner() {
  const { t } = useTranslation()
  return (
    <div className="bg-foreground text-background flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-sm">
      <span aria-hidden>👋</span>
      <span className="font-semibold">{t('demo.title')}</span>
      <span className="opacity-80">{t('demo.body')}</span>
    </div>
  )
}

/**
 * The page every route is laid out on: pomuku's shell — a sticky header (the
 * wordmark and the nav glyphs, then a row with the page's main action, e.g.
 * "add expense", and the sign-in control, then the page's own toolbar, e.g.
 * the home page's totals card) over the routed page, and a sticky footer.
 * Both slide away while scrolling down. This file only says what goes in each
 * place.
 */
function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const privacyHref = `https://leandroestrella.com/${i18n.resolvedLanguage === 'it' ? 'privacy-it' : 'privacy'}.html#linkulino`
  const { status, authorized, setLanguage } = useAuth()
  // The mascot's hover lightbox is a fun extra, not something to show over a
  // page telling a signed-in-but-not-allowlisted visitor they can't use the
  // app. (A loading state or a save under way keep it shut by themselves.)
  const notAllowed = status === 'signed-in' && !authorized

  return (
    <AppShell
      brand={
        // The wordmark is the only brand mark up here — it's the link home.
        // The animated mascot lives in the footer.
        <Link to="/" className="min-w-0">
          <h1 className="truncate text-lg leading-none font-semibold sm:text-xl">linkulino</h1>
          <p className="text-muted-foreground hidden truncate text-xs sm:block">{t('app.tagline')}</p>
        </Link>
      }
      nav={
        <>
          {/* A signed-in person's choice is saved on their account too, so the
              app opens in it on their next device (see docs/translations.md). */}
          <LanguageSwitcher onChange={(language) => void setLanguage(language).catch(() => undefined)} />
          <NavGlyph label={t('nav.trips')}>
            <Link to="/trips">🧳</Link>
          </NavGlyph>
          <NavGlyph label={t('nav.overview')}>
            <Link to="/overview">📊</Link>
          </NavGlyph>
          <NavGlyph label={t('nav.history')}>
            <Link to="/history">🕘</Link>
          </NavGlyph>
          <NavGlyph label={t('nav.settings')}>
            <Link to="/settings">⚙️</Link>
          </NavGlyph>
          {/* privacy notice for this site, in the visitor's language */}
          <NavGlyph label={t('nav.privacy')}>
            <a href={privacyHref} target="_blank" rel="noreferrer">
              🛡️
            </a>
          </NavGlyph>
        </>
      }
      account={<AuthBar />}
      footer={{
        left: (
          <a
            href="https://www.leandroestrella.com/"
            target="_blank"
            rel="noreferrer"
            aria-label={t('nav.portfolio')}
            title={t('nav.portfolio')}
            className="opacity-70 transition-opacity hover:opacity-100"
          >
            <img src="https://www.leandroestrella.com/img/favicon.ico" alt="" className="size-6 rounded-sm" />
          </a>
        ),
        center: (
          <FooterMascot label={t('nav.about')} quiet={notAllowed}>
            <Link to="/about">
              <Mascot footer className="w-10 sm:w-12" />
            </Link>
          </FooterMascot>
        ),
        right: (
          <a
            href="https://github.com/leandroestrella/linkulino"
            target="_blank"
            rel="noreferrer"
            aria-label={t('nav.repo')}
            title={t('nav.repo')}
            className="text-muted-foreground hover:text-foreground opacity-80 transition hover:opacity-100"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-6 fill-current">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
        ),
      }}
    >
      {children}
    </AppShell>
  )
}

function App() {
  return (
    <Layout>
      <Suspense fallback={<LoadingAvatar />}>
        <Routes>
          <Route element={<ReadGate />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/add" element={<ExpenseFormPage mode="add" />} />
            <Route path="/expense/:id/edit" element={<ExpenseFormPage mode="edit" />} />
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/trips/:tripId/edit" element={<TripEditPage />} />
            <Route path="/trips/:tripId" element={<TripDetailPage />} />
            <Route path="/trips/:tripId/add" element={<ExpenseFormPage mode="add" />} />
            <Route path="/trips/:tripId/expense/:id/edit" element={<ExpenseFormPage mode="edit" />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default App
