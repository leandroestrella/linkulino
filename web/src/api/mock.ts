/**
 * Mock data for offline development.
 *
 * A small, representative fixture so the whole UI works without a live sheet.
 * The SPA falls back to this whenever no backend is configured (`hasBackend`
 * in config.ts). Not the source of truth — the sheet is.
 */
import type { Category, Expense, Participant, Trip } from './types'

export const MOCK_PARTICIPANTS: Participant[] = [
  { name: 'Alex', icon: '🧮' },
  // Icons can be a plain emoji (Alex) or an image URL (Sam) — both are supported.
  { name: 'Sam', icon: 'https://www.leandroestrella.com/img/favicon.ico' },
]

export const MOCK_CATEGORIES: Category[] = [
  { name: 'Groceries', icon: '🛒' },
  { name: 'Rent', icon: '🏠' },
  { name: 'Utilities', icon: '💡' },
  { name: 'Dining out', icon: '🍽️' },
  { name: 'Transport', icon: '🚌' },
  { name: 'Other', icon: '❔' },
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
  {
    id: 'exp-4',
    date: '2026-07-15',
    description: "Alex's new headphones",
    category: 'Other',
    payer: 'Alex',
    amount: 89,
    splits: { Alex: 100, Sam: 0 },
    recurring: false,
  },
  {
    id: 'exp-5',
    date: '2026-06-18',
    description: 'Rent',
    category: 'Rent',
    payer: 'Alex',
    amount: 1200,
    splits: { Alex: 50, Sam: 50 },
    recurring: true,
  },
  {
    id: 'exp-6',
    date: '2026-06-22',
    description: 'Weekly groceries',
    category: 'Groceries',
    // Deliberately mismatched casing vs. the "Sam" participant name — sheet free
    // text won't always match exactly (e.g. historical rows), and this exercises
    // the case-insensitive payer matching in balances()/findParticipant().
    payer: 'sam',
    amount: 76.3,
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
  '🏖️ seaside': [
    {
      id: 'trip-exp-2',
      date: '2026-05-11',
      description: 'Beach house',
      category: 'Lodging',
      payer: 'Sam',
      amount: 480,
      splits: { Alex: 50, Sam: 50 },
      recurring: false,
    },
  ],
}
