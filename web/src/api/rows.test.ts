import { describe, expect, it } from 'vitest'
import { expenseFields, toExpense, toHistory, type LogEntry, type ParticipantRow } from './rows'

// Persona B listed first: whose share is whose is said by `persona`, not by the order.
const PEOPLE: ParticipantRow[] = [
  { name: 'leandro', icon: '🦊', persona: 'B' },
  { name: 'maria', icon: '⚽', persona: 'A' },
]

describe('an expense, between the backend and the pages', () => {
  it('gets its shares by name, and empty fields as the pages expect them', () => {
    const expense = toExpense({ id: 'x1', description: 'pizza', amount: 20, splitA: 60, splitB: 40, date: null, notes: null, recurring: null, trip: 'rieti' }, PEOPLE)
    expect(expense).toEqual({ id: 'x1', date: '', description: 'pizza', category: '', payer: '', amount: 20, splits: { maria: 60, leandro: 40 }, recurring: false, notes: '' })
  })

  it('goes back with each share in its own field, naming its trip, and never recurring on one', () => {
    const input = { date: '2026-10-05', description: 'pizza', category: 'Cibo', payer: 'maria', amount: 20, splits: { leandro: 40, maria: 60 }, recurring: true, notes: '' }
    expect(expenseFields(input, PEOPLE)).toEqual({ date: '2026-10-05', description: 'pizza', category: 'Cibo', payer: 'maria', amount: 20, splitA: 60, splitB: 40, recurring: true, notes: null, trip: null })
    expect(expenseFields(input, PEOPLE, 'rieti')).toMatchObject({ recurring: null, trip: 'rieti' })
  })
})

describe('the backend log, as the activity page shows it', () => {
  const entry = (seq: number, action: LogEntry['action'], entity: string, entityId: string, label: string, changes: string): LogEntry => ({ seq, at: '2026-10-05T10:00:00.000Z', actor: 'maria', action, entity, entityId, label, changes })
  const history = toHistory(
    [
      entry(7, 'conflict', 'expenses', 'x1', 'pizza', `amount: the sheet's "19" was replaced by the app's "21"`),
      entry(6, 'update', 'users', 'maria@example.com', 'maria', 'savings: 0 → 8000'),
      entry(5, 'delete', 'trips', 'rieti', '💍 rieti', 'name: rieti; emoji: 💍'),
      entry(4, 'delete', 'expenses', 'x2', 'treno; andata', 'date: 2026-09-01; description: treno; andata; category: Trasporti; amount: 39.9; trip: rieti'),
      entry(3, 'update', 'expenses', 'x1', 'pizza', 'amount: 20 → 21; splitA: 50 → 60; splitB: 50 → 40'),
      entry(2, 'create', 'categories', 'cibo', '🍽️ Cibo', 'name: Cibo; icon: 🍽️'),
      entry(1, 'create', 'expenses', 'x1', 'pizza', 'date: 2026-10-01; description: pizza; category: Cibo; amount: 20; splitA: 50; splitB: 50'),
    ],
    [{ id: 'x1', date: '2026-10-02', category: 'Cena', amount: 21, trip: null }],
    [],
    PEOPLE,
  )

  it('keeps expenses, trips and categories, and leaves the rest of the log out', () => {
    expect(history.map((item) => [item.action, item.entity])).toEqual([
      ['update', 'expense'], ['delete', 'trip'], ['delete', 'expense'], ['update', 'expense'], ['add', 'category'], ['add', 'expense'],
    ])
  })

  it('shows an added or removed expense with the category, amount and date it had then', () => {
    expect(history[5]).toMatchObject({ entityId: 'x1', label: 'pizza', category: 'Cibo', amount: 20, date: '2026-10-01', sheetId: '', changes: '' })
    // a value holding "; " stays in one piece
    expect(history[2]).toMatchObject({ label: 'treno; andata', category: 'Trasporti', amount: 39.9, date: '2026-09-01', sheetId: 'rieti', changes: '' })
  })

  it('shows an edit with what the expense has now, and its shares by name', () => {
    expect(history[3]).toMatchObject({ entityId: 'x1', category: 'Cena', amount: 21, date: '2026-10-02', changes: 'amount: 20 → 21; split maria: 50 → 60; split leandro: 50 → 40' })
  })

  it('links only to what is still there: never a deleted row, a category, or a trip that is gone', () => {
    expect(history.map((item) => item.entityId)).toEqual(['x1', '', '', 'x1', '', 'x1'])
  })
})
