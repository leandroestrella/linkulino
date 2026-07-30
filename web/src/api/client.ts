/**
 * Typed API client for the Linkulino backend.
 *
 * Three modes:
 *  - **backend mode** (a `VITE_API_URL` is configured): reads via GET, writes
 *    via POST to the Apps Script web app.
 *  - **mock mode** (no backend): serves and mutates an in-memory copy of the
 *    fixtures so the whole UI works offline. Mutations persist for the session.
 *  - **demo mode** (a backend exists, but nobody is signed in): serves those
 *    same fixtures, so a visitor lands in a working app rather than a locked
 *    door. Unlike the other two this is a *runtime* switch — `hasBackend` is
 *    fixed at build time, but whether anyone is signed in is not (see
 *    setDemoMode, driven by AuthProvider).
 *
 * Expenses live on either the household tab or a trip tab; pass a trip's `id`
 * as `sheetId` to address its expenses instead of the household ones.
 */
import { config, hasBackend } from '@/config'
import { diffExpense, diffTrip, expenseLabel, formatCategorySummary, formatTripSummary } from '@/lib/history'
import type {
  Category,
  Expense,
  ExpenseInput,
  HistoryEntry,
  NewCategory,
  NewTrip,
  Participant,
  Trip,
} from './types'
import {
  MOCK_CATEGORIES,
  MOCK_EXPENSES,
  MOCK_HISTORY,
  MOCK_PARTICIPANTS,
  MOCK_TRIPS,
  MOCK_TRIP_EXPENSES,
} from './mock'

/** Attributed to every mock/demo-mode action — there's no real sign-in to name an actor after (see fetchMe). */
const MOCK_ACTOR = 'dev'

/** Shape of every backend JSON response. */
type ApiEnvelope<T> = ({ ok: true } & T) | { ok: false; error: string }

/** Raised when the backend returns `{ ok: false }` or the request fails. */
export class ApiError extends Error {}

/** Supplies the current signed-in ID token; wired up by AuthProvider. */
let getIdToken: () => string | null = () => null

/** Registers the provider used to obtain the ID token for reads and writes. */
export function setIdTokenProvider(provider: () => string | null): void {
  getIdToken = provider
}

let mock = freshMockStore()

function freshMockStore() {
  return {
    expenses: clone(MOCK_EXPENSES),
    tripExpenses: clone(MOCK_TRIP_EXPENSES),
    participants: clone(MOCK_PARTICIPANTS),
    categories: clone(MOCK_CATEGORIES),
    trips: clone(MOCK_TRIPS),
    history: clone(MOCK_HISTORY),
  }
}

type MockHistoryInput = Pick<HistoryEntry, 'action' | 'entity' | 'label'> &
  Partial<Pick<HistoryEntry, 'entityId' | 'sheetId' | 'category' | 'amount' | 'date' | 'changes'>>

/** Prepends a mock history entry (newest-first, matching getHistory_'s server-side ordering). */
function logMockHistory(entry: MockHistoryInput): void {
  mock.history.unshift({
    timestamp: new Date().toISOString(),
    actor: MOCK_ACTOR,
    entityId: '',
    sheetId: '',
    category: '',
    amount: 0,
    date: '',
    changes: '',
    ...entry,
  })
}

function mockExpensesFor(sheetId?: string): Expense[] {
  if (!sheetId) return mock.expenses
  return (mock.tripExpenses[sheetId] ??= [])
}

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

let demoMode = false

/**
 * Turns the sample-data demo on or off. On means every read and write is
 * answered from the in-memory fixtures instead of the network, even though a
 * real backend is configured — so a signed-out visitor gets a working app
 * without ever touching (or being able to touch) somebody's real sheet.
 *
 * Entering resets the fixtures, so each visit starts from the same clean
 * sample rather than inheriting the last visitor's edits. Either direction
 * clears the read cache, so demo data can never be served to a signed-in user
 * or vice versa.
 */
export function setDemoMode(on: boolean): void {
  if (demoMode === on) return
  demoMode = on
  clearReadCache()
  if (on) mock = freshMockStore()
}

/** True when this call should be answered from the fixtures rather than the network. */
function servingMock(): boolean {
  return !hasBackend || demoMode
}

// ---------------------------------------------------------------------------
// Read cache (backend mode only)
// ---------------------------------------------------------------------------

/**
 * Every read hits a real Apps Script web app, which has a fixed ~1s latency
 * floor regardless of what it's reading (see docs/deployment.md) — so
 * switching between pages that mostly want the same reference data
 * (participants, categories, trips) paid that cost again on every
 * navigation. Cached reads are re-fetched at most once per TTL window, and
 * a write invalidates only the entries it can affect, so the UI never shows
 * stale data after the user's own change.
 */
const CACHE_TTL_MS = 30_000
const cache = new Map<string, { value: unknown; expires: number }>()

/** Clears every cached read — called on sign-out so a later sign-in never sees a stale reply. */
export function clearReadCache(): void {
  cache.clear()
}

function invalidate(key: string): void {
  cache.delete(key)
}

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache.get(key)
  if (entry && entry.expires > Date.now()) return clone(entry.value as T)
  const value = await fetcher()
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS })
  return clone(value)
}

function expensesCacheKey(sheetId?: string): string {
  return `expenses:${sheetId ?? ''}`
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getExpenses(sheetId?: string): Promise<Expense[]> {
  if (servingMock()) return clone(mockExpensesFor(sheetId))
  const action = sheetId ? `expenses&sheet=${encodeURIComponent(sheetId)}` : 'expenses'
  return cached(expensesCacheKey(sheetId), async () => {
    const data = await get<{ expenses: Expense[] }>(action)
    return data.expenses
  })
}

export async function getParticipants(): Promise<Participant[]> {
  if (servingMock()) return clone(mock.participants)
  return cached('participants', async () => {
    const data = await get<{ participants: Participant[] }>('participants')
    return data.participants
  })
}

export async function getCategories(): Promise<Category[]> {
  if (servingMock()) return clone(mock.categories)
  return cached('categories', async () => {
    const data = await get<{ categories: Category[] }>('categories')
    return data.categories
  })
}

export async function getTrips(): Promise<Trip[]> {
  if (servingMock()) return clone(mock.trips)
  return cached('trips', async () => {
    const data = await get<{ trips: Trip[] }>('trips')
    return data.trips
  })
}

/** Every logged add/edit/delete action, newest first. */
export async function getHistory(): Promise<HistoryEntry[]> {
  if (servingMock()) return clone(mock.history)
  return cached('history', async () => {
    const data = await get<{ history: HistoryEntry[] }>('history')
    return data.history
  })
}

/** The caller's authorization status, resolved server-side from their ID token. */
export interface Me {
  authorized: boolean
  email: string
  name: string
  reason: string
}

/**
 * Asks the backend whether the current ID token belongs to an allowed
 * participant. In mock mode (offline dev) there is no sign-in, so we grant
 * authorization to keep the write UI reachable against the in-memory store.
 */
export async function fetchMe(): Promise<Me> {
  if (servingMock()) return { authorized: true, email: 'dev@local', name: 'dev', reason: 'mock mode' }
  return post<Me>({ action: 'me' })
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Creates an expense; the backend assigns its ID. */
export async function addExpense(expense: ExpenseInput, sheetId?: string): Promise<Expense> {
  if (servingMock()) {
    const created: Expense = { ...expense, id: crypto.randomUUID() }
    const list = mockExpensesFor(sheetId)
    list.push(created)
    logMockHistory({
      action: 'add',
      entity: 'expense',
      entityId: created.id,
      sheetId,
      label: expenseLabel(created),
      category: created.category,
      amount: created.amount,
      date: created.date,
    })
    return created
  }
  const data = await post<{ expense: Expense }>({ action: 'addExpense', expense, sheet: sheetId })
  invalidate(expensesCacheKey(sheetId))
  invalidate('history')
  return data.expense
}

/** Updates an existing expense in place. */
export async function updateExpense(id: string, expense: ExpenseInput, sheetId?: string): Promise<Expense> {
  if (servingMock()) {
    const list = mockExpensesFor(sheetId)
    const index = list.findIndex((e) => e.id === id)
    const before = index === -1 ? null : list[index]
    const updated: Expense = { ...expense, id }
    if (index === -1) list.push(updated)
    else list[index] = updated
    logMockHistory({
      action: 'update',
      entity: 'expense',
      entityId: updated.id,
      sheetId,
      label: expenseLabel(updated),
      category: updated.category,
      amount: updated.amount,
      date: updated.date,
      changes: diffExpense(before, updated),
    })
    return updated
  }
  const data = await post<{ expense: Expense }>({ action: 'updateExpense', id, expense, sheet: sheetId })
  invalidate(expensesCacheKey(sheetId))
  invalidate('history')
  return data.expense
}

/** Deletes an existing expense. */
export async function deleteExpense(id: string, sheetId?: string): Promise<void> {
  if (servingMock()) {
    const list = mockExpensesFor(sheetId)
    const index = list.findIndex((e) => e.id === id)
    if (index !== -1) {
      const [deleted] = list.splice(index, 1)
      // No entityId: the mock list has already dropped this expense, so
      // there's nothing left to link to (matches the real backend's behavior).
      logMockHistory({
        action: 'delete',
        entity: 'expense',
        sheetId,
        label: expenseLabel(deleted),
        category: deleted.category,
        amount: deleted.amount,
        date: deleted.date,
      })
    }
    return
  }
  await post({ action: 'deleteExpense', id, sheet: sheetId })
  invalidate(expensesCacheKey(sheetId))
  invalidate('history')
}

/** Creates a new expense category. */
export async function addCategory(category: NewCategory): Promise<Category> {
  if (servingMock()) {
    mock.categories = [...mock.categories, category]
    // No entityId: there's no per-category page to link to.
    logMockHistory({ action: 'add', entity: 'category', label: formatCategorySummary(category) })
    return category
  }
  const data = await post<{ category: Category }>({ action: 'addCategory', category })
  invalidate('categories')
  invalidate('history')
  return data.category
}

/** Creates a new trip tab (duplicated from the template) and returns its metadata. */
export async function createTrip(trip: NewTrip): Promise<Trip> {
  if (servingMock()) {
    const created: Trip = { ...trip, id: `${trip.emoji} ${trip.name}` }
    mock.trips = [...mock.trips, created]
    logMockHistory({ action: 'add', entity: 'trip', entityId: created.id, label: formatTripSummary(created) })
    return created
  }
  const data = await post<{ trip: Trip }>({ action: 'createTrip', trip })
  invalidate('trips')
  invalidate('history')
  return data.trip
}

/** Updates an existing trip's metadata. Renaming or re-emoji-ing changes its id. */
export async function updateTrip(id: string, trip: NewTrip): Promise<Trip> {
  if (servingMock()) {
    const before = mock.trips.find((t) => t.id === id) ?? null
    const updated: Trip = { ...trip, id: `${trip.emoji} ${trip.name}` }
    mock.trips = mock.trips.map((t) => (t.id === id ? updated : t))
    if (updated.id !== id) {
      mock.tripExpenses[updated.id] = mock.tripExpenses[id] ?? []
      delete mock.tripExpenses[id]
    }
    logMockHistory({
      action: 'update',
      entity: 'trip',
      entityId: updated.id,
      label: formatTripSummary(updated),
      changes: diffTrip(before, trip),
    })
    return updated
  }
  const data = await post<{ trip: Trip }>({ action: 'updateTrip', id, trip })
  invalidate('trips')
  invalidate('history')
  invalidate(expensesCacheKey(id))
  invalidate(expensesCacheKey(data.trip.id))
  return data.trip
}

/** Deletes a trip and every expense on it. */
export async function deleteTrip(id: string): Promise<void> {
  if (servingMock()) {
    const deleted = mock.trips.find((t) => t.id === id) ?? null
    mock.trips = mock.trips.filter((t) => t.id !== id)
    delete mock.tripExpenses[id]
    // No entityId: the tab is gone.
    if (deleted) logMockHistory({ action: 'delete', entity: 'trip', label: formatTripSummary(deleted) })
    return
  }
  await post({ action: 'deleteTrip', id })
  invalidate('trips')
  invalidate('history')
  invalidate(expensesCacheKey(id))
}

// ---------------------------------------------------------------------------
// HTTP transport (backend mode)
// ---------------------------------------------------------------------------

async function get<T>(action: string): Promise<T> {
  // Reads are gated the same as writes (see apps-script/Code.js) — GET has no
  // body, so the token rides along as a query param instead.
  const token = getIdToken()
  const url = `${config.apiUrl}?action=${action}${token ? `&idToken=${encodeURIComponent(token)}` : ''}`
  let res: Response
  try {
    res = await fetch(url, { method: 'GET' })
  } catch (err) {
    throw new ApiError(`Network error contacting the backend: ${String(err)}`)
  }
  return unwrap<T>(await res.json())
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const token = getIdToken()
  const payload = token ? { ...body, idToken: token } : body
  let res: Response
  try {
    // text/plain avoids a CORS preflight, which Apps Script web apps can't answer.
    res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    throw new ApiError(`Network error contacting the backend: ${String(err)}`)
  }
  return unwrap<T>(await res.json())
}

function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (!envelope.ok) throw new ApiError(envelope.error)
  const { ok: _ok, ...rest } = envelope
  return rest as T
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
