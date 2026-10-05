/**
 * The backend's rows as the pages know them, and back.
 *
 * The backend keeps every expense in one table: a trip's expenses name their
 * trip, and the two shares sit in `splitA` and `splitB`, for the participants
 * the `Users` tab calls Persona A and B. Pages have always worked with a
 * `splits` record keyed by participant name, '' for an empty field, and a
 * history entry that carries the expense's category, amount and date — so
 * that is what these functions give them. Pure, and shared by the API client
 * and the in-page demo backend.
 */
import type { CategoryRow, ExpenseRow, Persona, TripRow } from '../../../server/src/schema'
import type { Category, Expense, ExpenseInput, HistoryEntry, NewCategory, NewTrip, Participant, Trip } from './types'

/** A participant as the backend sends them: with which of the two shares is theirs. */
export interface ParticipantRow extends Participant {
  persona: Persona
}

type Fields<R> = Omit<R, 'id' | 'rev' | 'updatedAt'>
type Loose<R> = Partial<R> & { id: string }

const nameOf = (people: ParticipantRow[], persona: Persona) => people.find((person) => person.persona === persona)?.name

export function toExpense(row: Loose<ExpenseRow>, people: ParticipantRow[]): Expense {
  const splits: Record<string, number> = {}
  const [a, b] = [nameOf(people, 'A'), nameOf(people, 'B')]
  if (a) splits[a] = row.splitA ?? 0
  if (b) splits[b] = row.splitB ?? 0
  return {
    id: row.id,
    date: row.date ?? '',
    description: row.description ?? '',
    category: row.category ?? '',
    payer: row.payer ?? '',
    amount: row.amount ?? 0,
    splits,
    recurring: row.recurring ?? false,
    notes: row.notes ?? '',
  }
}

/** An expense as the backend takes it. `tripId` is the trip it was spent on; none for the household. */
export function expenseFields(input: ExpenseInput, people: ParticipantRow[], tripId?: string): Fields<ExpenseRow> {
  const share = (persona: Persona) => {
    const name = nameOf(people, persona)
    return name === undefined ? null : (input.splits?.[name] ?? 0)
  }
  return {
    date: input.date || null,
    description: input.description || null,
    category: input.category || null,
    payer: input.payer || null,
    amount: input.amount,
    splitA: share('A'),
    splitB: share('B'),
    // Trips are time-boxed, so "repeats every month" never applies to them.
    recurring: tripId ? null : input.recurring,
    notes: input.notes || null,
    trip: tripId || null,
  }
}

export function toTrip(row: Loose<TripRow>): Trip {
  return { id: row.id, name: row.name ?? '', emoji: row.emoji ?? '', startDate: row.startDate ?? '', endDate: row.endDate ?? '' }
}

export function tripFields(trip: NewTrip): Fields<TripRow> {
  return { name: trip.name.trim(), emoji: trip.emoji.trim() || '🧳', startDate: trip.startDate || null, endDate: trip.endDate || null }
}

export function toCategory(row: Loose<CategoryRow>): Category {
  return { name: row.name ?? '', icon: row.icon ?? '', overhead: row.overhead ?? false }
}

export function categoryFields(category: NewCategory): Fields<CategoryRow> {
  return { name: category.name.trim(), icon: category.icon.trim() || null, overhead: category.overhead }
}

// ---------------------------------------------------------------------------
// The history log
// ---------------------------------------------------------------------------

/** One entry of the backend's log: who changed which row of which table, and how. */
export interface LogEntry {
  seq: number
  at: string
  actor: string
  action: 'create' | 'update' | 'delete' | 'conflict'
  entity: string
  entityId: string
  label: string
  /** `field: value; …` for a row added or removed, `field: before → after; …` for one changed. */
  changes: string
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))

/** A row's non-empty fields as the log lists them for a row added or removed. */
export function fieldsText(row: Record<string, unknown>): string {
  return Object.entries(row)
    .filter(([key, value]) => !['id', 'rev', 'updatedAt'].includes(key) && text(value) !== '')
    .map(([key, value]) => `${key}: ${text(value)}`)
    .join('; ')
}

/** The fields that differ, as the log lists them for a row changed. */
export function diffText(before: Record<string, unknown>, after: Record<string, unknown>): string {
  return Object.keys(after)
    .filter((key) => !['id', 'rev', 'updatedAt'].includes(key) && text(before[key]) !== text(after[key]))
    .map((key) => `${key}: ${text(before[key])} → ${text(after[key])}`)
    .join('; ')
}

/** Reads `field: value; field: value` back. A value holding `; ` itself stays in one piece. */
function parseFields(changes: string): Record<string, string> {
  const fields: Record<string, string> = {}
  let last = ''
  for (const part of changes.split('; ')) {
    const at = part.indexOf(': ')
    const key = at > 0 ? part.slice(0, at) : ''
    if (/^[a-zA-Z]+$/.test(key)) fields[(last = key)] = part.slice(at + 2)
    else if (last) fields[last] += `; ${part}`
  }
  return fields
}

const ENTITIES = { expenses: 'expense', trips: 'trip', categories: 'category' } as const

/**
 * The backend's log as the activity page shows it, newest first. A page links
 * an entry to its expense or trip only while that still exists; an expense's
 * category, amount and date are the ones it had when it was added or removed
 * (the log lists them), and the ones it has now for an edit.
 */
export function toHistory(entries: LogEntry[], expenses: Loose<ExpenseRow>[], trips: Loose<TripRow>[], people: ParticipantRow[]): HistoryEntry[] {
  const expenseById = new Map(expenses.map((row) => [row.id, row]))
  const tripIds = new Set(trips.map((row) => row.id))
  // The log names fields as the backend does; the two shares read better by name.
  const renamed: Record<string, string> = { startDate: 'start date', endDate: 'end date' }
  for (const persona of ['A', 'B'] as const) {
    const name = nameOf(people, persona)
    if (name) renamed[`split${persona}`] = `split ${name}`
  }
  const readable = (changes: string) => changes.replace(/(^|; )([a-zA-Z]+): /g, (whole, lead: string, key: string) => (renamed[key] ? `${lead}${renamed[key]}: ` : whole))

  return entries.flatMap((entry): HistoryEntry[] => {
    const entity = ENTITIES[entry.entity as keyof typeof ENTITIES]
    if (!entity) return []
    const action = entry.action === 'create' ? 'add' : entry.action === 'delete' ? 'delete' : 'update'
    const listed = action === 'update' ? {} : parseFields(entry.changes)
    const now = entity === 'expense' ? expenseById.get(entry.entityId) : undefined
    const exists = entity === 'expense' ? Boolean(now) : entity === 'trip' && tripIds.has(entry.entityId)
    return [{
      timestamp: entry.at,
      actor: entry.actor,
      action,
      entity,
      entityId: action !== 'delete' && exists ? entry.entityId : '',
      sheetId: entity === 'expense' ? (listed.trip ?? now?.trip ?? '') : '',
      label: entry.label,
      category: entity === 'expense' ? (listed.category ?? now?.category ?? '') : '',
      amount: entity === 'expense' ? Number(listed.amount ?? now?.amount ?? 0) || 0 : 0,
      date: entity === 'expense' ? (listed.date ?? now?.date ?? '') : '',
      changes: action === 'update' ? readable(entry.changes) : '',
    }]
  })
}
