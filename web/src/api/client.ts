/**
 * Typed API client for the Linkulino backend: a Cloudflare Worker with a JSON
 * API under `/api/v1` (see `server/README.md`). Pages call the functions here
 * and never the network themselves.
 *
 * Which backend answers is `backend.ts`'s business: the real one for someone
 * signed in, the in-page demo over the sample fixtures for everyone else (and
 * for everything, when no backend is configured).
 *
 * Reads are kept on the device by the underlying client, so a page opens on
 * the last copy while the fresh one is on its way, and a save changes those
 * copies in place. A save made from an outdated copy is refused by the
 * backend.
 *
 * The backend keeps every expense in one table, a trip's expenses naming
 * their trip; pass a trip's `id` as `sheetId` to address its expenses instead
 * of the household ones. `rows.ts` turns the backend's rows into the shapes
 * the pages have always had.
 */
import { ApiError as BackendError, type Row, type TableClient } from '@lndrstrll/pomuku-data'
import { backend } from '@/backend'
import {
  categoryFields, expenseFields, toCategory, toExpense, toHistory, toTrip, tripFields,
  type LogEntry, type ParticipantRow,
} from './rows'
import type { Category, Expense, ExpenseInput, HistoryEntry, NewCategory, NewTrip, Participant, RunwaySettings, Trip } from './types'

/** Raised when the backend refuses a request or can't be reached. */
export { BackendError as ApiError }

/** The `rev` of the device's copy of a row, so a save made from an outdated copy is refused. */
function revOf<R extends Row>(table: TableClient<R>, id: string): number | undefined {
  return table.peek()?.find((row) => row.id === id)?.rev || undefined
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The two participants with which share is whose, Persona A first. */
async function participantRows(): Promise<ParticipantRow[]> {
  const { participants } = await backend().client.read<{ participants: ParticipantRow[] }>('participants', '/participants', 'account')
  return participants
}

export async function getParticipants(): Promise<Participant[]> {
  return (await participantRows()).map(({ name, icon }) => ({ name, icon }))
}

export async function getExpenses(sheetId?: string): Promise<Expense[]> {
  const [rows, people] = await Promise.all([backend().expenses.list(), participantRows()])
  return rows.filter((row) => (row.trip ?? '') === (sheetId ?? '')).map((row) => toExpense(row, people))
}

export async function getCategories(): Promise<Category[]> {
  return (await backend().categories.list()).map(toCategory)
}

export async function getTrips(): Promise<Trip[]> {
  return (await backend().trips.list()).map(toTrip)
}

/** Every logged add/edit/delete action, newest first. */
export async function getHistory(): Promise<HistoryEntry[]> {
  const from = backend()
  const [{ entries }, expenses, trips, people] = await Promise.all([
    from.client.request<{ entries: LogEntry[] }>('GET', '/history?limit=500'),
    from.expenses.list(),
    from.trips.list(),
    participantRows(),
  ])
  return toHistory(entries, expenses, trips, people)
}

/** The caller's OWN runway settings (enable flag + savings amount) — never a partner's. */
export async function getRunwaySettings(): Promise<RunwaySettings> {
  return (await backend().client.request<{ runway: RunwaySettings }>('GET', '/runway')).runway
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Updates the CALLER'S OWN runway settings. */
export async function updateRunwaySettings(settings: RunwaySettings): Promise<RunwaySettings> {
  return (await backend().client.request<{ runway: RunwaySettings }>('PATCH', '/runway', settings)).runway
}

/** Creates an expense; the backend assigns its ID. */
export async function addExpense(expense: ExpenseInput, sheetId?: string): Promise<Expense> {
  const people = await participantRows()
  return toExpense(await backend().expenses.create(expenseFields(expense, people, sheetId)), people)
}

/** Updates an existing expense in place. */
export async function updateExpense(id: string, expense: ExpenseInput, sheetId?: string): Promise<Expense> {
  const people = await participantRows()
  const { expenses } = backend()
  return toExpense(await expenses.update(id, expenseFields(expense, people, sheetId), revOf(expenses, id)), people)
}

/** Deletes an existing expense. */
export async function deleteExpense(id: string, _sheetId?: string): Promise<void> {
  await backend().expenses.remove(id)
}

/** Creates a new expense category. */
export async function addCategory(category: NewCategory): Promise<Category> {
  return toCategory(await backend().categories.create(categoryFields(category)))
}

/** Creates a trip; the backend makes its ID from its name, once. */
export async function createTrip(trip: NewTrip): Promise<Trip> {
  return toTrip(await backend().trips.create(tripFields(trip)))
}

/** Updates an existing trip's name, emoji or dates. Its ID stays as it is. */
export async function updateTrip(id: string, trip: NewTrip): Promise<Trip> {
  const { trips } = backend()
  return toTrip(await trips.update(id, tripFields(trip), revOf(trips, id)))
}

/** Deletes a trip and every expense on it (the backend does both as one). */
export async function deleteTrip(id: string): Promise<void> {
  await backend().trips.remove(id)
}
