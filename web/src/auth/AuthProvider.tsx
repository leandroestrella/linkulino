import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { config, hasBackend } from '@/config'
import { clearReadCache, fetchMe, MOCK_PARTICIPANT_NAME, setDemoMode, setIdTokenProvider } from '@/api/client'

/** The signed-in person's public profile (decoded from the Google ID token). */
export interface AuthUser {
  email: string
  name: string
  picture: string
}

type AuthStatus = 'loading' | 'anonymous' | 'signed-in'

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** True when the backend confirmed this user is on the participant allowlist. */
  authorized: boolean
  /** The allowlisted name mapped from this participant's email (e.g. `Alex`). */
  participantName: string
  /** This participant's OWN runway settings — never their partner's (see lib/runway.ts). */
  runwayEnabled: boolean
  savings: number
  /** Re-fetches the caller's own runway settings (e.g. after saving them in Settings) without a full sign-in round-trip. */
  refreshRunway: () => Promise<void>
  /** Whether Google sign-in is configured (a client ID is present). */
  configured: boolean
  /**
   * True when the app is showing sample data to a signed-out visitor. The app
   * is fully usable in this state — edits just go to an in-memory copy of the
   * fixtures and vanish on reload, never reaching anyone's sheet.
   */
  demo: boolean
  /**
   * Whether to offer the write UI (add/edit/delete). True for an allowlisted
   * signed-in user, for local mock dev, and in the demo — where the writes are
   * real as far as the UI is concerned but land in the in-memory fixtures.
   * The backend re-checks authorization on every write regardless; this only
   * decides whether the controls are worth showing.
   */
  canWrite: boolean
  /** Whether the GIS library has loaded and initialized. */
  googleReady: boolean
  error: string | null
  /** Triggers the Google account chooser / One Tap. */
  signIn: () => void
  signOut: () => void
  /** Renders the official Google button into the given element. */
  renderButton: (el: HTMLElement | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const GSI_SRC = 'https://accounts.google.com/gsi/client'
const TOKEN_STORAGE_KEY = 'linkulino.idToken'

/** Decodes the payload of a JWT (no verification — display only). */
function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? ''
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map((ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  )
  return JSON.parse(json)
}

/**
 * Whether a stored token is unusable. Treats "expires in the next minute" as
 * already expired, so we don't restore a session only for the very next
 * request to be rejected mid-flight.
 */
function tokenUnusable(token: string): boolean {
  try {
    const exp = Number(decodeJwt(token).exp ?? 0)
    return !exp || exp * 1000 <= Date.now() + 60_000
  } catch {
    return true
  }
}

/** Loads the GIS client script once; resolves when `window.google` is ready. */
function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('failed to load Google sign-in')))
      return
    }
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('failed to load Google sign-in'))
    document.head.appendChild(script)
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = config.googleClientId.length > 0
  const [status, setStatus] = useState<AuthStatus>(hasBackend && configured ? 'loading' : 'anonymous')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [participantName, setParticipantName] = useState('')
  const [runwayEnabled, setRunwayEnabled] = useState(false)
  const [savings, setSavings] = useState(0)
  const [googleReady, setGoogleReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  /** True while a stored token is being re-validated, to keep GIS from racing it. */
  const restoringRef = useRef(false)

  // Writes carry the current ID token; register the provider once.
  useEffect(() => {
    setIdTokenProvider(() => tokenRef.current)
  }, [])

  /**
   * Drop to the signed-out demo, flipping the API client to the fixtures in the
   * same breath. The `demo` effect below can't be relied on to do that part:
   * child effects run before parent ones, so the page mounted by this very
   * status change fires its first fetch first — and with the demo off and no
   * token, that request hits the real backend unauthenticated and fails.
   */
  const enterDemo = useCallback(() => {
    setDemoMode(true)
    setStatus('anonymous')
    // Demo mode never goes through handleCredential (there's no real sign-in
    // to decode), so nothing else populates participantName/runway — without
    // this, anything scoped to "the current participant" (e.g. the homepage
    // runway line) would silently stay off. servingMock() is already true by
    // this point, so this resolves from the in-memory fixtures, no network.
    void fetchMe().then((me) => {
      setParticipantName(me.name)
      setRunwayEnabled(me.enableRunway)
      setSavings(me.savings)
    })
  }, [])

  /**
   * `restored` marks a token replayed from a previous visit rather than one the
   * user just consented to. The distinction only matters when re-validation
   * fails: an interactive sign-in that fails deserves a visible error, while a
   * stale stored token should quietly drop back to the demo.
   */
  const handleCredential = useCallback(async (credential: string, restored = false) => {
    tokenRef.current = credential
    // Leave the demo BEFORE asking the backend who we are: fetchMe answers
    // from the fixtures while demo is on, and its canned reply says
    // "authorized" — which would wrongly admit a real, non-allowlisted user.
    setDemoMode(false)
    try {
      const claims = decodeJwt(credential)
      setUser({
        email: String(claims.email ?? ''),
        name: String(claims.name ?? claims.email ?? ''),
        picture: String(claims.picture ?? ''),
      })
      const me = await fetchMe()
      setAuthorized(me.authorized)
      setParticipantName(me.name)
      setRunwayEnabled(me.enableRunway)
      setSavings(me.savings)
      setStatus('signed-in')
      setError(me.authorized ? null : `Signed in, but not on the allowlist (${me.reason}).`)
      // Only worth replaying a token the backend actually accepted.
      if (me.authorized) localStorage.setItem(TOKEN_STORAGE_KEY, credential)
      else localStorage.removeItem(TOKEN_STORAGE_KEY)
    } catch (err) {
      if (restored) {
        // Revoked, expired server-side, or the backend is unreachable. Showing
        // a locked door here would be wrong — the visitor never asked to sign
        // in on this load. Bin the token and fall through to the demo.
        tokenRef.current = null
        localStorage.removeItem(TOKEN_STORAGE_KEY)
        setUser(null)
        setError(null)
        enterDemo()
      } else {
        setError(String(err))
        setStatus('signed-in')
      }
    } finally {
      restoringRef.current = false
    }
  }, [enterDemo])

  // Offline mock mode: no sign-in, treat the local dev as authorized.
  useEffect(() => {
    if (hasBackend) return
    setUser({ email: 'dev@local', name: MOCK_PARTICIPANT_NAME, picture: '' })
    setAuthorized(true)
    setParticipantName(MOCK_PARTICIPANT_NAME)
    // Matches freshMockStore's sample runway default, so local dev (no
    // backend at all) shows the same working demo as the live site's demo mode.
    setRunwayEnabled(true)
    setSavings(8000)
    setStatus('signed-in')
  }, [])

  // Backend mode: load + initialize Google Identity Services.
  useEffect(() => {
    if (!hasBackend || !configured) return
    let cancelled = false

    // Restore a still-valid session from a previous tab/visit, so a refresh
    // or a fresh tab doesn't drop back to signed-out.
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (stored && !tokenUnusable(stored)) {
      restoringRef.current = true
      void handleCredential(stored, true)
    } else if (stored) {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }

    loadGsi()
      .then(() => {
        if (cancelled || !window.google) return
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: (resp) => void handleCredential(resp.credential),
          auto_select: false,
          cancel_on_tap_outside: true,
        })
        setGoogleReady(true)
        // GIS is ready long before a restore round-trips. Flipping to anonymous
        // here would flash the demo AND switch the API client over to the
        // fixtures while the real fetchMe is still in flight, so leave a
        // pending restore to settle the status itself.
        // A restore that already landed leaves a token behind; don't undo it.
        if (!restoringRef.current && !tokenRef.current) enterDemo()
      })
      .catch((err) => {
        setError(String(err))
        // Same reasoning as above: a failed GIS load doesn't invalidate a
        // session we're already restoring.
        // A restore that already landed leaves a token behind; don't undo it.
        if (!restoringRef.current && !tokenRef.current) enterDemo()
      })
    return () => {
      cancelled = true
    }
  }, [configured, handleCredential, enterDemo])

  // Nobody signed in (but a real backend exists) → show the sample data rather
  // than a locked door. `!hasBackend` is deliberately excluded: that's already
  // mock mode for local dev, and badging it "demo" would just be noise.
  // Backstop. `status` gates the entire app behind a spinner (see ReadGate), so
  // any path that leaves it on 'loading' takes the whole UI down with it. The
  // individual causes are bounded now, but this guarantees the outcome rather
  // than relying on having found every one of them. Must sit above the API
  // client's own timeout, or it fires while a legitimate slow fetchMe is still
  // in flight and yanks a real session into the demo.
  useEffect(() => {
    if (status !== 'loading') return
    const id = setTimeout(() => {
      restoringRef.current = false
      enterDemo()
    }, 50_000)
    return () => clearTimeout(id)
  }, [status, enterDemo])

  const demo = hasBackend && status === 'anonymous'
  const canWrite = demo || !configured || (status === 'signed-in' && authorized)

  // Keep the API client in step, so its reads/writes go to the fixtures for
  // exactly as long as the UI is showing the demo.
  useEffect(() => {
    setDemoMode(demo)
  }, [demo])

  const signIn = useCallback(() => {
    window.google?.accounts.id.prompt()
  }, [])

  const signOut = useCallback(() => {
    tokenRef.current = null
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    clearReadCache()
    window.google?.accounts.id.disableAutoSelect()
    setUser(null)
    setAuthorized(false)
    setParticipantName('')
    setRunwayEnabled(false)
    setSavings(0)
    setError(null)
    enterDemo()
  }, [enterDemo])

  /** Re-fetches the caller's own runway settings without a full sign-in round-trip (see fetchMe). */
  const refreshRunway = useCallback(async () => {
    const me = await fetchMe()
    setRunwayEnabled(me.enableRunway)
    setSavings(me.savings)
  }, [])

  const renderButton = useCallback((el: HTMLElement | null) => {
    if (el && window.google) {
      el.innerHTML = ''
      window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'medium', shape: 'pill' })
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      authorized,
      participantName,
      runwayEnabled,
      savings,
      refreshRunway,
      configured,
      demo,
      canWrite,
      googleReady,
      error,
      signIn,
      signOut,
      renderButton,
    }),
    [
      status,
      user,
      authorized,
      participantName,
      runwayEnabled,
      savings,
      refreshRunway,
      configured,
      demo,
      canWrite,
      googleReady,
      error,
      signIn,
      signOut,
      renderButton,
    ],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

/** Access the auth state. Must be used within an {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
