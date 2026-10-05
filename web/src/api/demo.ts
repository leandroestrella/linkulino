/**
 * A backend that lives in the page, over the sample fixtures: what the app
 * runs on with no backend configured, and what a visitor who isn't signed in
 * sees instead of a locked door. Every page works, changes included; they
 * only ever touch this in-memory copy and are gone on reload.
 *
 * It is pomuku's in-page demo for the three tables, plus what is Linkulino's
 * own and has to be imitated: the participants, the runway settings, a trip
 * deleted with its expenses, readable IDs for new trips and categories, and
 * a history log, so the activity page fills up as things are tried.
 */
import { demoFetch } from '@lndrstrll/pomuku-data'
import { nameId, PERSONAS } from '../../../server/src/schema'
import { MOCK_CATEGORIES, MOCK_EXPENSES, MOCK_HISTORY, MOCK_PARTICIPANTS, MOCK_TRIP_EXPENSES, MOCK_TRIPS } from './mock'
import { categoryFields, diffText, expenseFields, fieldsText, tripFields, type LogEntry, type ParticipantRow } from './rows'

/** The participant the demo is "signed in" as, so participant-scoped features (the runway estimate, "paid by" defaults) have real sample data to work on. */
export const MOCK_PARTICIPANT_NAME = MOCK_PARTICIPANTS[0].name

export const MOCK_PARTICIPANT_ROWS: ParticipantRow[] = MOCK_PARTICIPANTS.slice(0, 2).map((person, index) => ({ ...person, persona: PERSONAS[index] }))

type Stored = Record<string, unknown> & { id: string }
const TABLES = ['expenses', 'trips', 'categories']
const labelOf = (table: string, row: Record<string, unknown>) =>
  table === 'expenses' ? String(row.description ?? '') : [row.emoji ?? row.icon, row.name].filter(Boolean).join(' ')

export function demoBackend(): typeof fetch {
  let seq = 0
  // The sample activity, in the log's own form (newest first).
  const log: LogEntry[] = MOCK_HISTORY.map((entry) => ({
    seq: MOCK_HISTORY.length - seq++,
    at: entry.timestamp,
    actor: entry.actor,
    action: entry.action === 'add' ? 'create' : entry.action,
    entity: `${entry.entity === 'category' ? 'categorie' : entry.entity}s`,
    entityId: entry.entityId || `gone-${seq}`,
    label: entry.label,
    changes:
      entry.entity === 'expense' && entry.action !== 'update'
        ? fieldsText({ date: entry.date, description: entry.label, category: entry.category, amount: entry.amount, trip: entry.sheetId })
        : entry.changes,
  }))
  const record = (action: LogEntry['action'], entity: string, row: Stored, changes: string) =>
    void log.unshift({ seq: ++seq, at: new Date().toISOString(), actor: MOCK_PARTICIPANT_NAME, action, entity, entityId: row.id, label: labelOf(entity, row), changes })

  // On by default with a sample savings figure, so the demo shows the runway
  // estimate actually working rather than a toggle that does nothing.
  let runway = { enableRunway: true, savings: 8000 }

  const demo = demoFetch({
    tables: {
      expenses: [
        ...MOCK_EXPENSES.map((expense) => ({ id: expense.id, ...expenseFields(expense, MOCK_PARTICIPANT_ROWS) })),
        ...Object.entries(MOCK_TRIP_EXPENSES).flatMap(([trip, expenses]) => expenses.map((expense) => ({ id: expense.id, ...expenseFields(expense, MOCK_PARTICIPANT_ROWS, trip) }))),
      ],
      trips: MOCK_TRIPS.map((trip) => ({ id: trip.id, ...tripFields(trip) })),
      categories: MOCK_CATEGORIES.map((category) => ({ id: nameId(category.name), ...categoryFields(category) })),
    },
    routes: {
      '/participants': { participants: MOCK_PARTICIPANT_ROWS },
      '/runway': () => ({ runway }),
      '/history': () => ({ entries: log }),
    },
  })

  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const api = url.pathname.replace(/\/api\/v1.*$/, '/api/v1')
    const [, table = '', id] = url.pathname.slice(api.length).split('/').map(decodeURIComponent)
    const { method } = request
    if (method === 'GET') return demo(request)

    if (table === 'runway' && method === 'PATCH') {
      const body = (await request.json()) as { enableRunway?: unknown; savings?: unknown }
      runway = { enableRunway: body.enableRunway === true, savings: Number(body.savings) || 0 }
      return Response.json({ ok: true, runway })
    }
    if (!TABLES.includes(table)) return demo(request)

    const rowsOf = async (name: string) => ((await (await demo(`${url.origin}${api}/${name}`)).json()) as { rows: Stored[] }).rows
    const before = id === undefined ? undefined : (await rowsOf(table)).find((row) => row.id === id)

    // A trip goes with every expense on it.
    if (table === 'trips' && method === 'DELETE' && before) {
      for (const expense of (await rowsOf('expenses')).filter((row) => row.trip === id)) {
        await demo(`${url.origin}${api}/expenses/${encodeURIComponent(expense.id)}`, { method: 'DELETE' })
        record('delete', 'expenses', expense, fieldsText(expense))
      }
    }

    let body = method === 'DELETE' ? undefined : ((await request.json()) as Record<string, unknown>)
    // New trips and categories get the readable ID the backend would mint, never one in use.
    if (method === 'POST' && body && table !== 'expenses') {
      const used = new Set((await rowsOf(table)).map((row) => row.id))
      const base = nameId(String(body.name ?? ''))
      let minted = base
      for (let n = 2; used.has(minted); n++) minted = `${base}-${n}`
      body = { ...body, id: minted }
    }
    const response = await demo(request.url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.ok) {
      const { row } = (await response.clone().json()) as { row?: Stored }
      if (method === 'POST' && row) record('create', table, row, fieldsText(row))
      else if (method === 'PATCH' && row && before) record('update', table, row, diffText(before, row))
      else if (method === 'DELETE' && before) record('delete', table, before, fieldsText(before))
    }
    return response
  }
}
