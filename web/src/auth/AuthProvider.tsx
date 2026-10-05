import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthProvider as SessionProvider, useAuth as useSession } from '@lndrstrll/pomuku-auth'
import { getRunwaySettings } from '@/api/client'
import { MOCK_PARTICIPANT_NAME } from '@/api/demo'
import { auth } from '@/backend'
import { config, hasBackend } from '@/config'

/**
 * Sign-in for the SPA. Google vouches for a person once; the backend trades
 * Google's ID token for a session, which every later request carries and which
 * is remembered on this device — so the next visit opens signed in at once and
 * re-checks with the backend in the background. Google's own script is not
 * loaded with the page, only when someone asks to sign in.
 *
 * All of that lives in pomuku's auth package; this file shapes it for
 * Linkulino's pages and adds what is Linkulino's own: the demo a signed-out
 * visitor gets, and the signed-in participant's own runway settings.
 */

/** The signed-in person as the header shows them. The email never reaches the page. */
export interface AuthUser {
  name: string
  picture: string
}

type AuthStatus = 'loading' | 'anonymous' | 'signed-in'

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** True when the backend confirmed this person is on the `Users` tab. */
  authorized: boolean
  /** Their name on the `Users` tab (e.g. `alex`); in the demo, the sample participant's. */
  participantName: string
  /** This participant's OWN runway settings — never their partner's (see lib/runway.ts). */
  runwayEnabled: boolean
  savings: number
  /** Re-fetches the caller's own runway settings (e.g. after saving them in Settings). */
  refreshRunway: () => Promise<void>
  /** Whether Google sign-in is configured (a client ID is present, and there is a backend to sign in to). */
  configured: boolean
  /**
   * True when the app is showing sample data to a signed-out visitor. The app
   * is fully usable in this state — edits just go to an in-memory copy of the
   * fixtures and vanish on reload, never reaching anyone's sheet.
   */
  demo: boolean
  /**
   * Whether to offer the write UI (add/edit/delete). True for someone on the
   * `Users` tab, for local mock dev, and in the demo — where the writes are
   * real as far as the UI is concerned but land in the in-memory fixtures.
   * The backend re-checks every write regardless; this only decides whether
   * the controls are worth showing.
   */
  canWrite: boolean
  /** Whether Google's sign-in library has loaded and initialized. */
  googleReady: boolean
  /** Whether Google's sign-in library is being loaded after a "sign in" click. */
  googleLoading: boolean
  error: string | null
  /** Loads Google sign-in on demand (never on page load). */
  startSignIn: () => void
  signOut: () => void
  /** Saves the language on the account, so the app opens in it on the next device too. */
  setLanguage: (language: string) => Promise<void>
  /** Renders the official Google button into the given element. */
  renderButton: (el: HTMLElement | null) => void
}

interface Runway {
  runwayEnabled: boolean
  savings: number
  refreshRunway: () => Promise<void>
}

const RunwayContext = createContext<Runway | null>(null)

/**
 * The current participant's own runway settings: the signed-in person's, or
 * the demo's sample ones. Read again whenever who that is changes.
 */
function RunwayProvider({ children }: { children: ReactNode }) {
  const { status, authorized } = useSession()
  const [settings, setSettings] = useState({ enableRunway: false, savings: 0 })

  const refreshRunway = useCallback(async () => {
    setSettings(await getRunwaySettings())
  }, [])

  useEffect(() => {
    if (status === 'loading' || (status === 'signed-in' && !authorized)) return
    // Off until the answer is in: one person's settings must never show for the next.
    setSettings({ enableRunway: false, savings: 0 })
    void refreshRunway().catch(() => undefined)
  }, [status, authorized, refreshRunway])

  const value = useMemo(() => ({ runwayEnabled: settings.enableRunway, savings: settings.savings, refreshRunway }), [settings, refreshRunway])
  return <RunwayContext value={value}>{children}</RunwayContext>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider auth={auth} googleClientId={config.googleClientId}>
      <RunwayProvider>{children}</RunwayProvider>
    </SessionProvider>
  )
}

/** Access the auth state. Must be used within an {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const session = useSession()
  const runway = use(RunwayContext)
  if (!runway) throw new Error('useAuth must be used within an AuthProvider')
  // Nobody signed in, but a real backend exists: the sample data, rather than
  // a locked door. With no backend at all the app is already running as a
  // sample participant, and badging that "demo" would just be noise.
  const demo = hasBackend && session.status === 'anonymous'
  const signedIn = session.status === 'signed-in'
  return {
    status: session.status,
    user: signedIn ? { name: session.name, picture: session.picture } : null,
    authorized: session.authorized,
    participantName: demo ? MOCK_PARTICIPANT_NAME : session.authorized ? session.name : '',
    ...runway,
    configured: session.configured,
    demo,
    canWrite: demo || (signedIn && session.authorized),
    googleReady: session.googleReady,
    googleLoading: session.googleLoading,
    error: session.error,
    startSignIn: session.startSignIn,
    signOut: session.signOut,
    setLanguage: session.setLanguage,
    renderButton: session.renderButton,
  }
}
