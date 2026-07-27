/**
 * Minimal ambient types for the Google Identity Services (GIS) client library
 * loaded from https://accounts.google.com/gsi/client. Only the surface we use.
 */
interface GoogleIdCredentialResponse {
  /** A JWT ID token — sent to the backend and verified there. */
  credential: string
}

interface GoogleIdConfiguration {
  client_id: string
  callback: (response: GoogleIdCredentialResponse) => void
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
}

interface GoogleIdButtonOptions {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'small' | 'medium' | 'large'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
}

interface GoogleIdApi {
  initialize(config: GoogleIdConfiguration): void
  renderButton(parent: HTMLElement, options: GoogleIdButtonOptions): void
  prompt(): void
  disableAutoSelect(): void
}

interface Window {
  google?: { accounts: { id: GoogleIdApi } }
}
