/**
 * Mock data for offline development.
 *
 * A small, representative fixture so the whole UI works without a live sheet.
 * The SPA falls back to this whenever no backend is configured (`hasBackend`
 * in config.ts). Not the source of truth — the sheet is.
 *
 * Dates are computed relative to today (not hardcoded) so "this month"/"last
 * month", the timeframe presets (last 7/30/90 days, this/last year…), and a
 * trip's current/upcoming/past status all keep demoing correctly no matter
 * when the dev server happens to be started.
 */
import type { Category, Expense, Participant, Trip } from './types'
import { localIsoDate } from '@/lib/date'

/** ISO date for `day` of the month that is `monthOffset` months from the current one (0 = this month). */
function ymd(monthOffset: number, day: number): string {
  const d = new Date()
  d.setDate(1) // pin to day 1 first so setMonth can't overflow into the wrong month
  d.setMonth(d.getMonth() + monthOffset)
  d.setDate(day)
  return localIsoDate(d)
}

/** ISO date `days` from today (negative = past). */
function daysFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localIsoDate(d)
}

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
  { id: '🏖️ seaside', name: 'seaside', emoji: '🏖️', startDate: daysFromToday(-80), endDate: daysFromToday(-73) },
  { id: '🏔️ mountains', name: 'mountains', emoji: '🏔️', startDate: daysFromToday(-8), endDate: daysFromToday(6) },
  { id: '🎡 city break', name: 'city break', emoji: '🎡', startDate: daysFromToday(100), endDate: daysFromToday(104) },
]

export const MOCK_EXPENSES: Expense[] = [
  {
    id: 'exp-1',
    date: ymd(0, 1),
    description: 'Rent',
    category: 'Rent',
    payer: 'Alex',
    amount: 1200,
    splits: { Alex: 50, Sam: 50 },
    recurring: true,
  },
  {
    id: 'exp-2',
    date: ymd(0, 4),
    description: 'Weekly groceries',
    category: 'Groceries',
    payer: 'Sam',
    amount: 84.5,
    splits: { Alex: 50, Sam: 50 },
    recurring: false,
  },
  {
    id: 'exp-3',
    date: ymd(0, 12),
    description: 'Electricity bill',
    category: 'Utilities',
    payer: 'Alex',
    amount: 63.2,
    splits: { Alex: 50, Sam: 50 },
    recurring: false,
  },
  {
    id: 'exp-4',
    date: ymd(0, 15),
    description: "Alex's new headphones",
    category: 'Other',
    payer: 'Alex',
    amount: 89,
    splits: { Alex: 100, Sam: 0 },
    recurring: false,
  },
  {
    id: 'exp-5',
    date: ymd(-1, 18),
    description: 'Rent',
    category: 'Rent',
    payer: 'Alex',
    amount: 1200,
    splits: { Alex: 50, Sam: 50 },
    recurring: true,
  },
  {
    id: 'exp-6',
    date: ymd(-1, 22),
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
  {
    id: 'exp-7',
    date: ymd(-13, 9),
    description: 'Annual insurance',
    category: 'Other',
    payer: 'Sam',
    amount: 210,
    splits: { Alex: 50, Sam: 50 },
    recurring: false,
  },
]

export const MOCK_TRIP_EXPENSES: Record<string, Expense[]> = {
  '🏔️ mountains': [
    {
      id: 'trip-exp-1',
      date: daysFromToday(-7),
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
      date: daysFromToday(-79),
      description: 'Beach house',
      category: 'Lodging',
      payer: 'Sam',
      amount: 480,
      splits: { Alex: 50, Sam: 50 },
      recurring: false,
    },
  ],
}
