/**
 * Public runtime configuration for the Linkulino SPA.
 *
 * Safe to commit and ship in the client bundle: the Apps Script `/exec` URL is
 * a public web-app endpoint (writes are still gated server-side by Google
 * ID-token verification), and a Google OAuth *client ID* is public by design.
 *
 * Read from Vite env vars (`VITE_*`) when present so that anyone cloning the
 * repo can point their own instance at their own backend without editing
 * source — see `.env.example` and the README "run your own instance" guide.
 */
export const config = {
  /** Apps Script web-app endpoint, e.g. https://script.google.com/macros/s/<id>/exec */
  apiUrl: import.meta.env.VITE_API_URL ?? '',

  /** Google OAuth 2.0 Web client ID used by Google Identity Services sign-in. */
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
} as const

/** True when the SPA has a backend URL to talk to (otherwise it runs on mock data). */
export const hasBackend = config.apiUrl.length > 0
