/**
 * The client against the backend itself: the real app from ../server on a D1
 * database from wrangler's local runtime, a pretend Google for sign-in, and a
 * spreadsheet kept in memory. Nothing is stubbed between the two but the
 * network: every request the client makes is handed to the app.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testBackend } from '../../../server/src/testing'

type Cell = string | number | boolean
const API = 'https://linkulino.example.workers.dev'
const SPESE = ['ID', 'Data', 'Descrizione', 'Categoria', 'Pagato da', 'Importo (€)', 'Quota % A', 'Quota % B', 'Ricorrente', 'Note', 'Viaggio']
const TABS: Record<string, Cell[][]> = {
  Spese: [
    SPESE,
    ['rent0001', 46266, 'affitto', 'Alloggio', 'maria', 700, 50, 50, true, 'landlord: mr. keys', ''],
    ['ferry001', 46185, 'traghetto', 'Trasporti', 'leandro', 120, 40, 60, '', '', 'cala-gonone'],
  ],
  Viaggi: [['ID', 'Nome', 'Emoji', 'Inizio', 'Fine'], ['cala-gonone', 'cala gonone', '🐗', 46185, 46189]],
  Categorie: [['ID', 'Category', 'Emoji', 'Overhead'], ['alloggio', 'Alloggio', '🏠', true]],
  Users: [
    ['Email', 'Name', 'Icon', 'Enable Runway', 'Savings', 'Language', 'Role', 'Persona'],
    ['leandro@example.com', 'leandro', '🦊', true, 12000, '', '', 'B'],
    ['maria@example.com', 'maria', '⚽', false, '', '', '', 'A'],
  ],
}

let server: Awaited<ReturnType<typeof testBackend>>
let google: (typeof server)['google']
let sheet: (typeof server)['sheet']
let settle: (typeof server)['settle']
let api: typeof import('./client')
let backend: typeof import('@/backend')
const requests: string[] = []
const cell = (id: string, header: string) => sheet.tabs.Spese!.find((row) => row[0] === id)?.[SPESE.indexOf(header)]

beforeAll(async () => {
  server = await testBackend(TABS)
  ;({ google, sheet, settle } = server)
  // the first import, as the sheet's "Sync now" asks for it
  await server.syncNow()

  vi.stubEnv('VITE_API_URL', API)
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(`${request.method} ${new URL(request.url).pathname.replace('/api/v1', '')}`)
    return server.ask(request)
  })
  api = await import('./client')
  backend = await import('@/backend')
})
afterAll(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await server?.dispose()
})

describe('a visitor who is not signed in', () => {
  it('gets the sample data, and asks the backend nothing', async () => {
    expect((await api.getParticipants()).map((person) => person.name)).toEqual(['momra', 'mara'])
    expect((await api.getExpenses()).some((expense) => expense.description === 'rent')).toBe(true)
    await api.addExpense({ date: '2026-10-05', description: 'only in the demo', category: '', payer: 'mara', amount: 1, splits: { momra: 50, mara: 50 }, recurring: false, notes: '' })
    expect(requests).toEqual([])
  })
})

describe('someone on the users tab, once signed in', () => {
  it('reads their own data from the backend, not the samples', async () => {
    await backend.auth.credential(await google.sign({ email: 'maria@example.com', sub: 'google-id-of-maria', name: 'Maria P.' }))
    expect(backend.auth.getState()).toMatchObject({ status: 'signed-in', authorized: true, name: 'maria' })
    expect(await api.getParticipants()).toEqual([{ name: 'maria', icon: '⚽' }, { name: 'leandro', icon: '🦊' }])
    expect(await api.getExpenses()).toEqual([
      { id: 'rent0001', date: '2026-09-01', description: 'affitto', category: 'Alloggio', payer: 'maria', amount: 700, splits: { maria: 50, leandro: 50 }, recurring: true, notes: 'landlord: mr. keys' },
    ])
    expect(await api.getExpenses('cala-gonone')).toMatchObject([{ id: 'ferry001', splits: { maria: 40, leandro: 60 }, recurring: false }])
    expect(await api.getTrips()).toEqual([{ id: 'cala-gonone', name: 'cala gonone', emoji: '🐗', startDate: '2026-06-12', endDate: '2026-06-16' }])
    expect(await api.getCategories()).toEqual([{ name: 'Alloggio', icon: '🏠', overhead: true }])
    // the whole table is read once, whichever trip is asked for
    expect(requests.filter((request) => request === 'GET /expenses')).toHaveLength(1)
  })

  it('adds an expense to a trip, with each share in its own column of the sheet', async () => {
    const added = await api.addExpense({ date: '2026-06-14', description: 'cena', category: 'Cibo', payer: 'leandro', amount: 54.5, splits: { maria: 30, leandro: 70 }, recurring: true, notes: '' }, 'cala-gonone')
    expect(added).toMatchObject({ description: 'cena', splits: { maria: 30, leandro: 70 }, recurring: false })
    await settle()
    expect([cell(added.id, 'Quota % A'), cell(added.id, 'Quota % B'), cell(added.id, 'Viaggio'), cell(added.id, 'Ricorrente')]).toEqual([30, 70, 'cala-gonone', ''])
    expect((await api.getExpenses('cala-gonone')).map((expense) => expense.description)).toContain('cena')
  })

  it('edits and deletes an expense, sending the rev of the copy it had', async () => {
    const [rent] = await api.getExpenses()
    const saved = await api.updateExpense(rent!.id, { ...rent!, amount: 720 })
    expect(saved.amount).toBe(720)
    await settle()
    expect(cell('rent0001', 'Importo (€)')).toBe(720)
    await api.deleteExpense('ferry001', 'cala-gonone')
    await settle()
    expect(sheet.tabs.Spese!.some((row) => row[0] === 'ferry001')).toBe(false)
  })

  it('creates a trip with an id a rename leaves alone, and deletes one with its expenses', async () => {
    const trip = await api.createTrip({ name: 'København', emoji: '🌭', startDate: '2026-11-01', endDate: '2026-11-04' })
    expect(trip.id).toBe('kobenhavn')
    expect((await api.updateTrip(trip.id, { ...trip, name: 'copenhagen' })).id).toBe('kobenhavn')
    await api.deleteTrip('cala-gonone')
    await settle()
    expect((await api.getTrips()).map((each) => each.id)).toEqual(['kobenhavn'])
    expect(sheet.tabs.Spese!.map((row) => row[10]).filter((name) => name === 'cala-gonone')).toEqual([])
    expect(sheet.tabs.Viaggi!.map((row) => row[1])).toEqual(['Nome', 'copenhagen'])
  })

  it('shows the log as the activity page expects it', async () => {
    const history = await api.getHistory()
    expect(history.slice(0, 3).map((entry) => [entry.action, entry.entity, entry.label, entry.entityId])).toEqual([
      ['delete', 'trip', '🐗 cala gonone', ''],
      ['delete', 'expense', 'cena', ''],
      ['update', 'trip', '🌭 copenhagen', 'kobenhavn'],
    ])
    expect(history[1]).toMatchObject({ actor: 'maria', category: 'Cibo', amount: 54.5, date: '2026-06-14', sheetId: 'cala-gonone' })
    expect(history.find((entry) => entry.label === 'affitto' && entry.action === 'update')).toMatchObject({ actor: 'maria', entityId: 'rent0001', amount: 720, changes: 'amount: 700 → 720' })
    // the first import shows as the sheet's doing
    expect(history.at(-1)).toMatchObject({ actor: 'sheet', action: 'add' })
  })

  it('reads and changes their own runway settings and language', async () => {
    expect(await api.getRunwaySettings()).toEqual({ enableRunway: false, savings: 0 })
    expect(await api.updateRunwaySettings({ enableRunway: true, savings: 8000 })).toEqual({ enableRunway: true, savings: 8000 })
    await backend.auth.setLanguage('es')
    await settle()
    expect(sheet.tabs.Users![2]!.slice(3, 6)).toEqual([true, 8000, 'es'])
    expect(sheet.tabs.Users![1]!.slice(3, 6)).toEqual([true, 12000, ''])
  })

  it('is back on the samples after signing out, with nothing of theirs left', async () => {
    await backend.auth.signOut()
    expect((await api.getParticipants()).map((person) => person.name)).toEqual(['momra', 'mara'])
    expect((await api.getExpenses()).some((expense) => expense.description === 'affitto')).toBe(false)
    // and the demo starts over from the fixtures
    expect((await api.getExpenses()).some((expense) => expense.description === 'only in the demo')).toBe(false)
  })
})

describe('someone google knows and the users tab does not', () => {
  it('is signed in to nothing', async () => {
    await backend.auth.credential(await google.sign({ email: 'stranger@example.com', sub: 'google-id-of-a-stranger' }))
    expect(backend.auth.getState()).toMatchObject({ status: 'signed-in', authorized: false })
  })
})
