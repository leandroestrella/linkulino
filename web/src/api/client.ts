/**
 * Typed API client for the Linkulino backend.
 *
 * Two modes, chosen automatically:
 *  - **backend mode** (a `VITE_API_URL` is configured): reads via GET, writes
 *    via POST to the Apps Script web app.
 *  - **mock mode** (no backend): serves and mutates an in-memory copy of the
 *    fixtures so the whole UI works offline. Mutations persist for the session.
 *
 * Expenses live on either the household tab or a trip tab; pass a trip's `id`
 * as `sheetId` to address its expenses instead of the household ones.
 */
import { config, hasBackend } from '@/config'
import type { Category, Expense, ExpenseInput, NewCategory, NewTrip, Participant, Trip } from './types'
import {
  MOCK_CATEGORIES,
  MOCK_EXPENSES,
  MOCK_PARTICIPANTS,
  MOCK_TRIPS,
  MOCK_TRIP_EXPENSES,
} from './mock'

/** Shape of every backend JSON response. */
type ApiEnvelope<T> = ({ ok: true } & T) | { ok: false; error: string }

/** Raised when the backend returns `{ ok: false }` or the request fails. */
export class ApiError extends Error {}

/** Supplies the current signed-in ID token for writes; wired up by AuthProvider. */
let getIdToken: () => string | null = () => null

/** Registers the provider used to obtain the ID token for write calls. */
export function setIdTokenProvider(provider: () => string | null): void {
  getIdToken = provider
}

const mock = {
  expenses: clone(MOCK_EXPENSES),
  tripExpenses: clone(MOCK_TRIP_EXPENSES),
  participants: clone(MOCK_PARTICIPANTS),
  categories: clone(MOCK_CATEGORIES),
  trips: clone(MOCK_TRIPS),
}

function mockExpensesFor(sheetId?: string): Expense[] {
  if (!sheetId) return mock.expenses
  return (mock.tripExpenses[sheetId] ??= [])
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getExpenses(sheetId?: string): Promise<Expense[]> {
  if (!hasBackend) return clone(mockExpensesFor(sheetId))
  const action = sheetId ? `expenses&sheet=${encodeURIComponent(sheetId)}` : 'expenses'
  const data = await get<{ expenses: Expense[] }>(action)
  return data.expenses
}

export async function getParticipants(): Promise<Participant[]> {
  if (!hasBackend) return clone(mock.participants)
  const data = await get<{ participants: Participant[] }>('participants')
  return data.participants
}

export async function getCategories(): Promise<Category[]> {
  if (!hasBackend) return clone(mock.categories)
  const data = await get<{ categories: Category[] }>('categories')
  return data.categories
}

export async function getTrips(): Promise<Trip[]> {
  if (!hasBackend) return clone(mock.trips)
  const data = await get<{ trips: Trip[] }>('trips')
  return data.trips
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
  if (!hasBackend) return { authorized: true, email: 'dev@local', name: 'dev', reason: 'mock mode' }
  return post<Me>({ action: 'me' })
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Creates an expense; the backend assigns its ID. */
export async function addExpense(expense: ExpenseInput, sheetId?: string): Promise<Expense> {
  if (!hasBackend) {
    const created: Expense = { ...expense, id: crypto.randomUUID() }
    const list = mockExpensesFor(sheetId)
    list.push(created)
    return created
  }
  const data = await post<{ expense: Expense }>({ action: 'addExpense', expense, sheet: sheetId })
  return data.expense
}

/** Updates an existing expense in place. */
export async function updateExpense(id: string, expense: ExpenseInput, sheetId?: string): Promise<Expense> {
  if (!hasBackend) {
    const list = mockExpensesFor(sheetId)
    const index = list.findIndex((e) => e.id === id)
    const updated: Expense = { ...expense, id }
    if (index === -1) list.push(updated)
    else list[index] = updated
    return updated
  }
  const data = await post<{ expense: Expense }>({ action: 'updateExpense', id, expense, sheet: sheetId })
  return data.expense
}

/** Creates a new expense category. */
export async function addCategory(category: NewCategory): Promise<Category> {
  if (!hasBackend) {
    mock.categories = [...mock.categories, category]
    return category
  }
  const data = await post<{ category: Category }>({ action: 'addCategory', category })
  return data.category
}

/** Creates a new trip tab (duplicated from the template) and returns its metadata. */
export async function createTrip(trip: NewTrip): Promise<Trip> {
  if (!hasBackend) {
    const created: Trip = { ...trip, id: `${trip.emoji} ${trip.name}` }
    mock.trips = [...mock.trips, created]
    return created
  }
  const data = await post<{ trip: Trip }>({ action: 'createTrip', trip })
  return data.trip
}

// ---------------------------------------------------------------------------
// HTTP transport (backend mode)
// ---------------------------------------------------------------------------

async function get<T>(action: string): Promise<T> {
  const url = `${config.apiUrl}?action=${action}`
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
