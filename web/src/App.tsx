import { useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthBar } from '@/auth/AuthBar'
import { AdminSlotContext, SubHeaderContext } from '@/components/subheader'
import { useHideOnScroll } from '@/hooks/useHideOnScroll'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { HomePage } from '@/pages/HomePage'
import { ExpenseFormPage } from '@/pages/ExpenseFormPage'
import { AboutPage } from '@/pages/AboutPage'
import { TripsPage } from '@/pages/TripsPage'
import { TripDetailPage } from '@/pages/TripDetailPage'
import { OverviewPage } from '@/pages/OverviewPage'

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
                stays the link home, so a home affordance remains. */}
            <Link to="/about" aria-label={t('nav.about')} className="shrink-0">
              <img src="/linkulino.png" alt="" className="w-10 sm:w-12" />
            </Link>
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
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/add" element={<ExpenseFormPage mode="add" />} />
          <Route path="/expense/:id/edit" element={<ExpenseFormPage mode="edit" />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/:tripId" element={<TripDetailPage />} />
          <Route path="/trips/:tripId/add" element={<ExpenseFormPage mode="add" />} />
          <Route path="/trips/:tripId/expense/:id/edit" element={<ExpenseFormPage mode="edit" />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </TooltipProvider>
  )
}

export default App
