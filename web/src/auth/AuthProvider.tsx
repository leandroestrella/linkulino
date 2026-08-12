import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { config, hasBackend } from '@/config'
import { clearReadCache, fetchMe, setDemoMode, setIdTokenProvider } from '@/api/client'

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
  const [googleReady, setGoogleReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)

  // Writes carry the current ID token; register the provider once.
  useEffect(() => {
    setIdTokenProvider(() => tokenRef.current)
  }, [])

  const handleCredential = useCallback(async (credential: string) => {
    tokenRef.current = credential
    localStorage.setItem(TOKEN_STORAGE_KEY, credential)
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
      setStatus('signed-in')
      setError(me.authorized ? null : `Signed in, but not on the allowlist (${me.reason}).`)
    } catch (err) {
      setError(String(err))
      setStatus('signed-in')
    }
  }, [])

  // Offline mock mode: no sign-in, treat the local dev as authorized.
  useEffect(() => {
    if (hasBackend) return
    setUser({ email: 'dev@local', name: 'dev', picture: '' })
    setAuthorized(true)
    setParticipantName('dev')
    setStatus('signed-in')
  }, [])

  // Backend mode: load + initialize Google Identity Services.
  useEffect(() => {
    if (!hasBackend || !configured) return
    let cancelled = false

    // Restore a still-valid session from a previous tab/visit, so a refresh
    // or a fresh tab doesn't drop back to signed-out.
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (stored) {
      try {
        const exp = Number(decodeJwt(stored).exp ?? 0)
        if (exp * 1000 > Date.now()) {
          void handleCredential(stored)
        } else {
          localStorage.removeItem(TOKEN_STORAGE_KEY)
        }
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY)
      }
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
        // Only fall back to anonymous if a restored session isn't already
        // signing in — handleCredential above will move it to 'signed-in'.
        setStatus((s) => (s === 'loading' ? 'anonymous' : s))
      })
      .catch((err) => {
        setError(String(err))
        setStatus('anonymous')
      })
    return () => {
      cancelled = true
    }
  }, [configured, handleCredential])

  // Nobody signed in (but a real backend exists) → show the sample data rather
  // than a locked door. `!hasBackend` is deliberately excluded: that's already
  // mock mode for local dev, and badging it "demo" would just be noise.
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
    setError(null)
    setStatus('anonymous')
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
      configured,
      demo,
      canWrite,
      googleReady,
      error,
      signIn,
      signOut,
      renderButton,
    }),
    [status, user, authorized, participantName, configured, demo, canWrite, googleReady, error, signIn, signOut, renderButton],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

/** Access the auth state. Must be used within an {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
