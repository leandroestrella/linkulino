/**
 * The SPA's wiring to its backend: who is signed in, and the client everything
 * in `api/client.ts` and `auth/` goes through.
 *
 * There are two backends, and which one answers is decided per call:
 *  - the **real** one (the Worker in ../server, when `VITE_API_URL` is set),
 *    for someone who is signed in. Its client keeps what it reads on the
 *    device, per account, so a page opens on the last copy at once.
 *  - the **demo**, a backend that lives in the page over the sample fixtures
 *    (`api/demo.ts`): for a visitor who isn't signed in, and for everything
 *    when no backend is configured. Nothing of it is kept.
 *
 * Nothing in the real backend is public, so a visitor's requests never go
 * there at all — and demo data can never be mixed with a person's own.
 */
import { createAuth } from '@lndrstrll/pomuku-auth'
import { createClient, type Client } from '@lndrstrll/pomuku-data'
import { isLanguage } from '@lndrstrll/pomuku-i18n'
import type { CategoryRow, ExpenseRow, TripRow } from '../../server/src/schema'
import { demoBackend, MOCK_PARTICIPANT_NAME } from '@/api/demo'
import { config, hasBackend } from '@/config'
import { i18n } from '@/i18n'

function backendOver(client: Client) {
  return {
    client,
    expenses: client.table<ExpenseRow>('expenses', { scope: 'account' }),
    trips: client.table<TripRow>('trips', { scope: 'account' }),
    categories: client.table<CategoryRow>('categories', { scope: 'account' }),
  }
}

const real = hasBackend ? backendOver(createClient({ baseUrl: config.apiUrl, app: 'linkulino' })) : null

let fixtures = demoBackend()
// The demo keeps nothing, on the device or in memory: every read asks the
// in-page backend, which is instant.
const demo = backendOver(createClient({ baseUrl: 'https://demo.invalid', app: 'linkulino-demo', fetch: (input, init) => fixtures(input, init), storage: null, cacheMs: 0 }))

export const auth = createAuth({
  client: (real ?? demo).client,
  app: 'linkulino',
  // With no backend there is nobody to sign in as: the app runs as a sample participant.
  demo: hasBackend ? undefined : { name: MOCK_PARTICIPANT_NAME, role: 'member' },
  // The language saved on the account, unless a link asked for one with `?lng=`.
  onLanguage: (language) => {
    if (isLanguage(language) && !new URLSearchParams(window.location.search).has('lng')) void i18n.changeLanguage(language)
  },
})

/** Whether calls are answered from the sample fixtures rather than the network. */
export function servingDemo(): boolean {
  return !real || auth.getState().status !== 'signed-in'
}

/** The backend to ask right now. */
export function backend() {
  return servingDemo() ? demo : real!
}

// Each visit to the demo starts from the same clean sample, rather than
// inheriting what was tried before signing in.
let wasSignedIn = false
auth.subscribe(() => {
  const signedIn = auth.getState().status === 'signed-in'
  if (wasSignedIn && !signedIn) fixtures = demoBackend()
  wasSignedIn = signedIn
})

/**
 * Tells the real backend someone opened the app, so it takes a look at the
 * spreadsheet if its last look is a few minutes old. Once per page; never fails.
 */
export function visit(): void {
  real?.client.visit()
}

// Earlier versions kept Google's own ID token on the device to sign in with on
// the next visit. The backend's session replaced it; don't leave it lying around.
try {
  localStorage.removeItem('linkulino.idToken')
} catch {
  // storage blocked: there was nothing to remove
}
