import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useAuth } from './AuthProvider'

/**
 * Renders the official Google button and tears it down on unmount. Isolating it
 * in its own component (with a `key` on each AuthBar branch) guarantees the GIS
 * button DOM is discarded when the user signs in — otherwise React reuses the
 * container node and Google's imperatively-injected button lingers.
 */
function GoogleButton() {
  const { renderButton } = useAuth()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    renderButton(ref.current)
    const el = ref.current
    return () => {
      if (el) el.innerHTML = ''
    }
  }, [renderButton])
  return <div ref={ref} />
}

/**
 * Sign-in control for the header: the Google button for anonymous visitors, an
 * identity badge once signed in. Cosmetic only — the backend enforces who may write.
 */
export function AuthBar() {
  const { status, user, authorized, configured, googleReady, error, signOut } = useAuth()
  const { t } = useTranslation()

  if (!configured) {
    return <span className="text-muted-foreground hidden text-xs sm:inline">{t('auth.notConfigured')}</span>
  }

  if (status === 'signed-in' && user) {
    return (
      <div key="signed-in" className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="hidden min-w-0 text-right leading-tight sm:block">
          <div className="truncate text-sm">{user.email || user.name}</div>
          <div className="text-muted-foreground text-xs">
            {authorized ? t('auth.authorized') : t('auth.notAuthorized')}
          </div>
          {!authorized && error && <div className="text-destructive text-xs">{error}</div>}
        </div>
        {user.picture && (
          <img
            src={user.picture}
            alt={user.email}
            title={user.email}
            className="size-7 shrink-0 rounded-full sm:size-8"
            referrerPolicy="no-referrer"
          />
        )}
        <Button variant="outline" size="sm" className="shrink-0" onClick={signOut}>
          {t('auth.signOut')}
        </Button>
      </div>
    )
  }

  return (
    <div key="anonymous" className="flex min-w-0 flex-col items-end gap-1">
      {googleReady && <GoogleButton />}
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  )
}
