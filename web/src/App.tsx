import { lazy, Suspense, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthBar } from '@/auth/AuthBar'
import { useAuth } from '@/auth/AuthProvider'
import { AdminSlotContext, SubHeaderContext } from '@/components/subheader'
import { LoadingAvatar } from '@/components/LoadingAvatar'
import { useHideOnScroll } from '@/hooks/useHideOnScroll'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'

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

/**
 * Decides what a visitor sees before (or instead of) signing in.
 *
 * The backend requires a verified, allowlisted ID token for reads as well as
 * writes (see apps-script/Code.js), so there is genuinely no real data to show
 * a signed-out visitor. Rather than a locked door, they get the app running on
 * the sample fixtures — fully usable, edits included, since those only ever
 * touch an in-memory copy (see setDemoMode in api/client.ts). Signing in swaps
 * the same UI onto the real sheet.
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
    <div className="border-primary/30 bg-primary/5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-sm">
      <span aria-hidden>👋</span>
      <span className="font-medium">{t('demo.title')}</span>
      <span className="text-muted-foreground">{t('demo.body')}</span>
    </div>
  )
}

/**
 * App shell: a sticky header (brand · language · sign-in) over the routed
 * page, plus two slots pages fill via a portal — one on the sign-in row for
 * a write-gated admin button (e.g. "add expense", "new trip"), so it always
 * sits next to the login control, and one below that for the rest of a
 * page's toolbar (e.g. the home page's totals card). Header and footer slide
 * out of the way while scrolling down, and return on scroll-up.
 */
function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const [adminSlot, setAdminSlot] = useState<HTMLDivElement | null>(null)
  const [avatarHovered, setAvatarHovered] = useState(false)
  const hidden = useHideOnScroll()

  return (
    <div className="flex min-h-svh flex-col">
      <header
        className={cn(
          'bg-background/90 sticky top-0 z-30 border-b backdrop-blur transition-transform duration-200',
          hidden && '-translate-y-full',
        )}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* The avatar opens the About page (the rendered README); the wordmark
                stays the link home, so a home affordance remains. Hovering it also
                pops the mascot up full-size in a centered lightbox, which closes
                the moment the pointer leaves. */}
            <Link
              to="/about"
              aria-label={t('nav.about')}
              className="shrink-0"
              onMouseEnter={() => setAvatarHovered(true)}
              onMouseLeave={() => setAvatarHovered(false)}
            >
              <img src="/linkulino.gif" alt="" className="w-10 sm:w-12" />
            </Link>
            {avatarHovered &&
              createPortal(
                <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
                  <div className="rounded-2xl bg-black p-4 shadow-2xl">
                    <img src="/linkulino.gif" alt="" className="w-64 max-w-[80vw] sm:w-80" />
                  </div>
                </div>,
                document.body,
              )}
            <Link to="/" className="min-w-0">
              <h1 className="truncate text-lg leading-none font-semibold sm:text-xl">linkulino</h1>
              <p className="text-muted-foreground hidden truncate text-xs sm:block">{t('app.tagline')}</p>
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/trips"
                  aria-label={t('nav.trips')}
                  className="hover:bg-accent rounded-md p-2 text-lg leading-none"
                >
                  🧳
                </Link>
              </TooltipTrigger>
              <TooltipContent>{t('nav.trips')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/overview"
                  aria-label={t('nav.overview')}
                  className="hover:bg-accent rounded-md p-2 text-lg leading-none"
                >
                  📊
                </Link>
              </TooltipTrigger>
              <TooltipContent>{t('nav.overview')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {/* Always visible (not per-page portaled) so sign-in status shows on every page;
            a page's write-gated admin button portals into the left side (see
            useAdminSlotContainer) so it's always on the same line as sign-in. */}
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pb-3">
          <div ref={setAdminSlot} className="flex items-center gap-2" />
          <AuthBar />
        </div>
        {/* Pages portal the rest of their sticky toolbar here (see useSubHeaderContainer). */}
        <div ref={setSlot} />
      </header>

      <AdminSlotContext value={adminSlot}>
        <SubHeaderContext value={slot}>
          <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        </SubHeaderContext>
      </AdminSlotContext>

      <footer
        className={cn(
          'bg-background/90 sticky bottom-0 z-30 border-t backdrop-blur transition-transform duration-200',
          hidden && 'translate-y-full',
        )}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-4">
          <a
            href="https://www.leandroestrella.com/"
            target="_blank"
            rel="noreferrer"
            aria-label={t('nav.portfolio')}
            title={t('nav.portfolio')}
            className="opacity-70 transition-opacity hover:opacity-100"
          >
            <img
              src="https://www.leandroestrella.com/img/favicon.ico"
              alt=""
              className="size-6 rounded-sm"
            />
          </a>
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
        </div>
      </footer>
    </div>
  )
}

function App() {
  return (
    <TooltipProvider>
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
            </Route>
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </TooltipProvider>
  )
}

export default App
