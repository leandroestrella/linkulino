/**
 * Linkulino's backend end to end: the real app on a D1 database from wrangler's
 * local runtime, a pretend Google for sign-in, and a spreadsheet kept in memory
 * shaped like the real one (same tabs, same headers, hand-edited quirks).
 */
import { d1, migrate, type Cell } from '@lndrstrll/pomuku-server'
import { memorySheets, testD1, testGoogle } from '@lndrstrll/pomuku-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { schema } from './schema.js'
import { linkulino } from './worker.js'

const SECRET = 'a-long-sync-secret'
const MARIA = 'maria@example.com'
const LEANDRO = 'leandro@example.com'

// The sheet's own column order, with the formula columns the app never writes.
const SPESE = [
  'ID', 'Data', 'Descrizione', 'Categoria', 'Pagato da', 'Importo (€)', 'Quota % A', 'Quota % B', 'Ricorrente', 'Note', 'Viaggio',
  'Quota A (€)', 'Quota B (€)', 'Saldo',
]
const TABS: Record<string, Cell[][]> = {
  Spese: [
    SPESE,
    // a real date cell (the sheet's day count), a checkbox, an amount typed with a comma
    ['rent0001', 46266, 'affitto', 'Alloggio', 'maria', 700, 50, 50, true, 'landlord: mr. keys', '', 350, 350, 350],
    ['pizza001', '2026-09-12', 'pizza', 'Cibo', 'leandro', '18,5', 50, 50, false, '', '', 9.25, 9.25, -9.25],
    ['ferry001', 46185, 'traghetto', 'Trasporti', 'leandro', 120, 40, 60, '', '', 'cala-gonone'],
    ['hotel001', 46186, 'albergo', 'Alloggio', 'maria', 300, 50, 50, '', '', 'cala-gonone'],
    // typed by hand, no ID and no date yet
    ['', '', 'gelato', 'Cibo', 'maria', 6, 50, 50, '', '', 'cala-gonone'],
  ],
  Viaggi: [
    ['ID', 'Nome', 'Emoji', 'Inizio', 'Fine'],
    ['cala-gonone', 'cala gonone', '🐗', 46185, 46189],
    // typed by hand, no ID yet
    ['', 'København', '🌭', '2026-11-01', '2026-11-04'],
  ],
  Categorie: [['ID', 'Category', 'Emoji', 'Overhead'], ['alloggio', 'Alloggio', '🏠', true], ['', 'Cibo', '🍽️', false], ['', 'Trasporti', '🚌']],
  // Persona B's row comes first: who is A is said by the column, not the order.
  Users: [
    ['Email', 'Name', 'Icon', 'Enable Runway', 'Savings', 'Language', 'Role', 'Persona'],
    ['Leandro@Example.com', 'leandro', '🦊', true, 12000, 'it', 'admin', 'B'],
    [MARIA, 'maria', 'https://example.com/maria.png', false, '', 'it', '', 'A'],
  ],
}

let env: { DB: D1Database; GOOGLE_CLIENT_ID: string; SYNC_SECRET: string }
let google: Awaited<ReturnType<typeof testGoogle>>
let dispose: () => Promise<void>
let sheet: ReturnType<typeof memorySheets>
let app: ReturnType<typeof linkulino>
let maria: string
let leandro: string
/** Set by a test that needs a particular day; the real time otherwise. */
let clock: Date | null = null
const deferred: Promise<unknown>[] = []
const context = { waitUntil: (work: Promise<unknown>) => void deferred.push(work), passThroughOnException() {} } as unknown as ExecutionContext

async function call(method: string, path: string, options: { token?: string; body?: unknown; secret?: string } = {}) {
  const headers: Record<string, string> = {}
  if (options.token) headers.authorization = `Bearer ${options.token}`
  if (options.secret) headers['x-sync-secret'] = options.secret
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const response = await app.fetch(
    new Request(`https://api.example/api/v1${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }),
    env,
    context,
  )
  return { status: response.status, json: (await response.json()) as any }
}
/** Waits for whatever was left running after the answers so far (the push to the sheet). */
const settle = async () => {
  while (deferred.length) await deferred.shift()
}
/** The sheet's "Sync now": asks until there is nothing more. */
async function syncNow() {
  for (let round = 0; round < 20; round++) {
    const { json } = await call('POST', '/sync', { secret: SECRET })
    if (json.done !== false) return json
  }
}
const signIn = async (email: string) => (await call('POST', '/session', { body: { credential: await google.sign({ email }) } })).json.token as string
const sheetRow = (tab: string, id: string) => sheet.tabs[tab]!.find((row) => row[0] === id)
const cell = (id: string, header: string) => sheetRow('Spese', id)?.[SPESE.indexOf(header)]

beforeAll(async () => {
  const database = await testD1()
  dispose = database.dispose
  google = await testGoogle()
  env = { DB: database.binding, GOOGLE_CLIENT_ID: google.clientId, SYNC_SECRET: SECRET }
  await migrate(d1(env.DB), schema)
  sheet = memorySheets(TABS)
  app = linkulino({ verifyGoogleToken: google.verify, sheets: () => sheet, now: () => clock ?? new Date() })
})
afterAll(() => dispose?.())

describe('the first import', () => {
  it('builds the database from the existing sheet, keeping ids and giving one to a row without', async () => {
    expect((await syncNow()).done).toBe(true)
    expect(sheet.tabs.Spese![5]![0]).toMatch(/^[2-9a-z]{8}$/)
    expect(sheet.tabs.Viaggi![2]![0]).toBe('kobenhavn')
    expect(sheet.tabs.Categorie!.map((row) => row[0])).toEqual(['ID', 'alloggio', 'cibo', 'trasporti'])
    expect(sheet.tabs.Validation).toBeUndefined()
  })

  it('keeps everything for people on the users tab: nothing is public', async () => {
    for (const path of ['/expenses', '/trips', '/categories', '/participants', '/runway', '/history']) {
      expect([path, (await call('GET', path)).status]).toEqual([path, 401])
    }
    const stranger = await call('POST', '/session', { body: { credential: await google.sign({ email: 'stranger@example.com' }) } })
    expect(stranger.status).toBe(403)
  })

  it('reads the cells as a person left them', async () => {
    maria = await signIn(MARIA)
    leandro = await signIn(LEANDRO)
    const { json } = await call('GET', '/expenses', { token: maria })
    expect(json.rows).toHaveLength(5)
    expect(json.rows.find((row: any) => row.id === 'rent0001')).toMatchObject({
      date: '2026-09-01', description: 'affitto', category: 'Alloggio', payer: 'maria', amount: 700, splitA: 50, splitB: 50,
      recurring: true, notes: 'landlord: mr. keys', trip: null,
    })
    expect(json.rows.find((row: any) => row.id === 'pizza001')).toMatchObject({ date: '2026-09-12', amount: 18.5, recurring: false })
    expect(json.rows.find((row: any) => row.description === 'gelato')).toMatchObject({ date: null, trip: 'cala-gonone', recurring: null })
    expect((await call('GET', '/trips', { token: maria })).json.rows).toMatchObject([
      { id: 'cala-gonone', name: 'cala gonone', emoji: '🐗', startDate: '2026-06-12', endDate: '2026-06-16' },
      { id: 'kobenhavn', name: 'København', startDate: '2026-11-01' },
    ])
  })
})

describe('the participants', () => {
  it('are the people named A and B on the users tab, A first, without their emails', async () => {
    const { json } = await call('GET', '/participants', { token: leandro })
    expect(json.participants).toEqual([
      { name: 'maria', icon: 'https://example.com/maria.png', persona: 'A' },
      { name: 'leandro', icon: '🦊', persona: 'B' },
    ])
    expect(JSON.stringify(json)).not.toContain('@')
  })

  it('each read and change their own runway settings, never the other one’s', async () => {
    expect((await call('GET', '/runway', { token: leandro })).json.runway).toEqual({ enableRunway: true, savings: 12000 })
    expect((await call('GET', '/runway', { token: maria })).json.runway).toEqual({ enableRunway: false, savings: 0 })
    const saved = await call('PATCH', '/runway', { token: maria, body: { enableRunway: true, savings: 8000, email: LEANDRO } })
    expect(saved.json.runway).toEqual({ enableRunway: true, savings: 8000 })
    await settle()
    expect(sheet.tabs.Users![2]!.slice(3, 5)).toEqual([true, 8000])
    expect(sheet.tabs.Users![1]!.slice(3, 5)).toEqual([true, 12000])
    expect((await call('PATCH', '/runway', { token: maria, body: { savings: 'lots' } })).status).toBe(422)
    // the log shows it to admins only
    const seenBy = async (token: string) => (await call('GET', '/history', { token })).json.entries.some((entry: any) => entry.entity === 'users')
    expect([await seenBy(maria), await seenBy(leandro)]).toEqual([false, true])
  })

  it('keep the language their account opens in', async () => {
    expect((await call('PATCH', '/session', { token: maria, body: { language: 'es' } })).json.user.language).toBe('es')
    await settle()
    expect(sheet.tabs.Users![2]![5]).toBe('es')
  })
})

describe('an expense', () => {
  it('added on a trip reaches the sheet, leaving the formula columns alone', async () => {
    const added = await call('POST', '/expenses', {
      token: maria,
      body: { date: '2026-06-14', description: 'cena', category: 'Cibo', payer: 'maria', amount: 54.5, splitA: 50, splitB: 50, trip: 'cala-gonone' },
    })
    expect(added.status).toBe(201)
    await settle()
    const id = added.json.row.id
    expect([cell(id, 'Data'), cell(id, 'Importo (€)'), cell(id, 'Viaggio'), cell(id, 'Saldo')]).toEqual(['2026-06-14', 54.5, 'cala-gonone', ''])
    const { json } = await call('GET', '/history?limit=1', { token: maria })
    expect(json.entries[0]).toMatchObject({ actor: 'maria', action: 'create', entity: 'expenses', entityId: id, label: 'cena' })
  })

  it('is refused with a share that is not a percentage', async () => {
    expect((await call('POST', '/expenses', { token: maria, body: { description: 'x', splitA: 150 } })).status).toBe(422)
  })

  it('edited in the app changes only its own cells in the sheet', async () => {
    const saved = await call('PATCH', '/expenses/pizza001', { token: leandro, body: { amount: 21, notes: 'con birra' } })
    expect(saved.status).toBe(200)
    await settle()
    expect([cell('pizza001', 'Importo (€)'), cell('pizza001', 'Note'), cell('pizza001', 'Saldo')]).toEqual([21, 'con birra', -9.25])
  })

  it('deleted in the app leaves the sheet too', async () => {
    expect((await call('DELETE', '/expenses/pizza001', { token: leandro })).status).toBe(200)
    await settle()
    expect(sheetRow('Spese', 'pizza001')).toBeUndefined()
  })
})

describe('deleting a trip', () => {
  it('removes it and every expense on it, from the database and the sheet, and nothing else', async () => {
    const before = (await call('GET', '/expenses', { token: maria })).json.rows
    const onTrip = before.filter((row: any) => row.trip === 'cala-gonone')
    expect(onTrip).toHaveLength(4)
    const removed = await call('DELETE', '/trips/cala-gonone', { token: maria })
    expect([removed.status, removed.json.expenses]).toEqual([200, 4])
    await settle()
    expect((await call('GET', '/expenses', { token: maria })).json.rows.map((row: any) => row.id)).toEqual(['rent0001'])
    expect((await call('GET', '/trips', { token: maria })).json.rows.map((row: any) => row.id)).toEqual(['kobenhavn'])
    expect(sheet.tabs.Spese!.map((row) => row[0])).toEqual(['ID', 'rent0001'])
    expect(sheet.tabs.Viaggi!.map((row) => row[0])).toEqual(['ID', 'kobenhavn'])
  })

  it('keeps each expense’s fields in the log, so they can be typed back', async () => {
    const { json } = await call('GET', '/history?limit=5', { token: maria })
    expect(json.entries[0]).toMatchObject({ actor: 'maria', action: 'delete', entity: 'trips', entityId: 'cala-gonone', label: '🐗 cala gonone' })
    const ferry = json.entries.find((entry: any) => entry.entityId === 'ferry001')
    expect(ferry).toMatchObject({ action: 'delete', entity: 'expenses', label: 'traghetto' })
    expect(ferry.changes).toContain('amount: 120')
  })

  it('answers 404 for a trip that is not there, and leaves the sheet in step for the next pull', async () => {
    expect((await call('DELETE', '/trips/cala-gonone', { token: maria })).status).toBe(404)
    expect((await syncNow()).pulled).toMatchObject({ added: 0, removed: 0 })
  })
})

describe('recurring expenses', () => {
  it('are recreated once a month by the scheduled run, and reach the sheet', async () => {
    clock = new Date('2026-10-01T05:00:00Z')
    const created = await app.recurring(env)
    expect(created).toMatchObject([{ date: '2026-10-01', description: 'affitto', amount: 700, recurring: true, notes: 'landlord: mr. keys', trip: null }])
    expect(cell(created[0]!.id, 'Data')).toBe('2026-10-01')
    expect(await app.recurring(env)).toEqual([])
    const { json } = await call('GET', '/history?limit=1', { token: maria })
    expect(json.entries[0]).toMatchObject({ actor: 'linkulino', action: 'create', label: 'affitto' })
  })

  it('can be asked for by an admin, and by nobody else', async () => {
    clock = new Date('2026-11-01T05:00:00Z')
    expect((await call('POST', '/recurring', { token: maria })).status).toBe(403)
    const asked = await call('POST', '/recurring', { token: leandro })
    expect(asked.json.created).toMatchObject([{ date: '2026-11-01', description: 'affitto' }])
    await settle()
    expect(cell(asked.json.created[0].id, 'Descrizione')).toBe('affitto')
    clock = null
  })
})

describe('an edit in the sheet', () => {
  it('reaches the app: a changed amount, a new row, a new category', async () => {
    sheet.edit((tabs) => {
      sheetRow('Spese', 'rent0001')![SPESE.indexOf('Importo (€)')] = 720
      tabs.Spese!.push(['', 46300, 'bolletta luce', 'Bollette', 'leandro', 61.2, 50, 50, false, '', ''])
      tabs.Categorie!.push(['', 'Bollette', '💡', true])
    })
    await syncNow()
    const rows = (await call('GET', '/expenses', { token: maria })).json.rows
    expect(rows.find((row: any) => row.id === 'rent0001').amount).toBe(720)
    expect(rows.find((row: any) => row.description === 'bolletta luce')).toMatchObject({ date: '2026-10-05', payer: 'leandro' })
    expect((await call('GET', '/categories/bollette', { token: maria })).json.row).toMatchObject({ name: 'Bollette', icon: '💡', overhead: true })
  })

  it('lists what it cannot take on the validation tab', async () => {
    sheet.edit(() => void (sheetRow('Spese', 'rent0001')![SPESE.indexOf('Quota % A')] = 'metà'))
    await syncNow()
    expect(sheet.tabs.Validation![1]).toMatchObject(['Spese', 2, 'rent0001', 'Quota % A', 'metà', 'must be a number'])
  })
})
