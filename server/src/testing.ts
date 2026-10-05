/**
 * The backend as tests run it: the real app on a D1 database from wrangler's
 * local runtime, a pretend Google for sign-in, and a spreadsheet kept in
 * memory. Used by this backend's own tests and by the SPA's, which hand it
 * every request their client makes.
 */
import { d1, migrate, type AppOptions, type Cell, type Env } from '@lndrstrll/pomuku-server'
import { memorySheets, testD1, testGoogle } from '@lndrstrll/pomuku-server/testing'
import { schema } from './schema.js'
import { linkulino } from './worker.js'

export const SYNC_SECRET = 'a-long-sync-secret'

export async function testBackend(tabs: Record<string, Cell[][]>, overrides: Partial<AppOptions<typeof schema, Env>> = {}) {
  const database = await testD1()
  const google = await testGoogle()
  const env = { DB: database.binding, GOOGLE_CLIENT_ID: google.clientId, SYNC_SECRET }
  await migrate(d1(env.DB), schema)
  const sheet = memorySheets(tabs)
  const app = linkulino({ verifyGoogleToken: google.verify, sheets: () => sheet, ...overrides })
  const deferred: Promise<unknown>[] = []
  const context = { waitUntil: (work: Promise<unknown>) => void deferred.push(work), passThroughOnException() {} } as unknown as ExecutionContext

  /** A request to the app, as the network would deliver it. */
  const ask = (input: RequestInfo | URL, init?: RequestInit) => app.fetch(new Request(input, init), env, context)

  async function call(method: string, path: string, options: { token?: string; body?: unknown; secret?: string } = {}) {
    const headers: Record<string, string> = {}
    if (options.token) headers.authorization = `Bearer ${options.token}`
    if (options.secret) headers['x-sync-secret'] = options.secret
    if (options.body !== undefined) headers['content-type'] = 'application/json'
    const response = await ask(`https://api.example/api/v1${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
    return { status: response.status, json: (await response.json()) as any }
  }

  return {
    app,
    env,
    google,
    sheet,
    ask,
    call,
    /** Waits for whatever was left running after the answers so far (the push to the sheet). */
    async settle() {
      while (deferred.length) await deferred.shift()
    },
    /** The sheet's "Sync now": asks until there is nothing more. */
    async syncNow() {
      for (let round = 0; round < 20; round++) {
        const { json } = await call('POST', '/sync', { secret: SYNC_SECRET })
        if (json.done !== false) return json
      }
    },
    signIn: async (email: string) => (await call('POST', '/session', { body: { credential: await google.sign({ email }) } })).json.token as string,
    dispose: database.dispose,
  }
}
