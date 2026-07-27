/**
 * Mock data for offline development.
 *
 * A small, representative fixture so the whole UI works without a live sheet.
 * The SPA falls back to this whenever no backend is configured (`hasBackend`
 * in config.ts). Not the source of truth — the sheet is.
 */
import type { Expense, Participant, Trip } from './types'

export const MOCK_PARTICIPANTS: Participant[] = [{ name: 'Alex' }, { name: 'Sam' }]

export const MOCK_CATEGORIES: string[] = [
  'Groceries',
  'Rent',
  'Utilities',
  'Dining out',
  'Transport',
  'Other',
]

export const MOCK_TRIPS: Trip[] = [
  { id: '🏖️ seaside', name: 'seaside', emoji: '🏖️', startDate: '2026-05-10', endDate: '2026-05-17' },
  { id: '🏔️ mountains', name: 'mountains', emoji: '🏔️', startDate: '2026-07-20', endDate: '2026-08-03' },
  { id: '🎡 city break', name: 'city break', emoji: '🎡', startDate: '2026-11-05', endDate: '2026-11-09' },
]

export const MOCK_EXPENSES: Expense[] = [
  {
    id: 'exp-1',
    date: '2026-07-01',
    description: 'Rent',
    category: 'Rent',
    payer: 'Alex',
    amount: 1200,
    splits: { Alex: 50, Sam: 50 },
    recurring: true,
  },
  {
    id: 'exp-2',
    date: '2026-07-04',
    description: 'Weekly groceries',
    category: 'Groceries',
    payer: 'Sam',
    amount: 84.5,
    splits: { Alex: 50, Sam: 50 },
    recurring: false,
  },
  {
    id: 'exp-3',
    date: '2026-07-12',
    description: 'Electricity bill',
    category: 'Utilities',
    payer: 'Alex',
    amount: 63.2,
    splits: { Alex: 50, Sam: 50 },
    recurring: false,
  },
]

export const MOCK_TRIP_EXPENSES: Record<string, Expense[]> = {
  '🏔️ mountains': [
    {
      id: 'trip-exp-1',
      date: '2026-07-20',
      description: 'Cabin rental',
      category: 'Lodging',
      payer: 'Alex',
      amount: 640,
      splits: { Alex: 50, Sam: 50 },
      recurring: false,
    },
  ],
}
