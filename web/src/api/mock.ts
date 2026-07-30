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
import type { Category, Expense, HistoryEntry, Participant, Trip } from './types'
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

/** Full ISO timestamp `hours` in the past — for history entries, where a plain date isn't enough. */
function hoursAgo(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() - hours)
  return d.toISOString()
}

export const MOCK_PARTICIPANTS: Participant[] = [
  { name: 'momra', icon: '🐠' },
  { name: 'mara', icon: '⚽' },
]

export const MOCK_CATEGORIES: Category[] = [
  { name: 'groceries', icon: '🛒' },
  { name: 'rent', icon: '🏠' },
  { name: 'utilities', icon: '💡' },
  { name: 'dining out', icon: '🍽️' },
  { name: 'transport', icon: '🚌' },
  { name: 'other', icon: '❔' },
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
    description: 'rent',
    category: 'rent',
    payer: 'momra',
    amount: 1200,
    splits: { momra: 50, mara: 50 },
    recurring: true,
  },
  {
    id: 'exp-2',
    date: ymd(0, 4),
    description: 'weekly groceries',
    category: 'groceries',
    payer: 'mara',
    amount: 84.5,
    splits: { momra: 50, mara: 50 },
    recurring: false,
  },
  {
    id: 'exp-3',
    date: ymd(0, 12),
    description: 'electricity bill',
    category: 'utilities',
    payer: 'momra',
    amount: 63.2,
    splits: { momra: 50, mara: 50 },
    recurring: false,
  },
  {
    id: 'exp-4',
    date: ymd(0, 15),
    description: "momra's new headphones",
    category: 'other',
    payer: 'momra',
    amount: 89,
    splits: { momra: 100, mara: 0 },
    recurring: false,
  },
  {
    id: 'exp-4b',
    date: ymd(0, 16),
    description: "mara's phone case",
    category: 'other',
    payer: 'mara',
    amount: 24,
    splits: { momra: 0, mara: 100 },
    recurring: false,
  },
  {
    id: 'exp-5',
    date: ymd(-1, 18),
    description: 'rent',
    category: 'rent',
    payer: 'momra',
    amount: 1200,
    splits: { momra: 50, mara: 50 },
    recurring: true,
  },
  {
    id: 'exp-6',
    date: ymd(-1, 22),
    description: 'weekly groceries',
    category: 'groceries',
    // Deliberately mismatched casing vs. the "mara" participant name — sheet free
    // text won't always match exactly (e.g. historical rows), and this exercises
    // the case-insensitive payer matching in balances()/findParticipant().
    payer: 'Mara',
    amount: 76.3,
    splits: { momra: 50, mara: 50 },
    recurring: false,
  },
  {
    id: 'exp-7',
    date: ymd(-13, 9),
    description: 'annual insurance',
    category: 'other',
    payer: 'mara',
    amount: 210,
    splits: { momra: 50, mara: 50 },
    recurring: false,
  },
]

export const MOCK_TRIP_EXPENSES: Record<string, Expense[]> = {
  '🏔️ mountains': [
    {
      id: 'trip-exp-1',
      date: daysFromToday(-7),
      description: 'cabin rental',
      category: 'lodging',
      payer: 'momra',
      amount: 640,
      splits: { momra: 50, mara: 50 },
      recurring: false,
    },
  ],
  '🏖️ seaside': [
    {
      id: 'trip-exp-2',
      date: daysFromToday(-79),
      description: 'beach house',
      category: 'lodging',
      payer: 'mara',
      amount: 480,
      splits: { momra: 50, mara: 50 },
      recurring: false,
    },
  ],
}

/**
 * A small, plausible-looking activity log so a fresh demo visit lands with
 * something to show on the activity page, instead of "no activity yet" — the
 * entries reference real mock ids (exp-4b, exp-4, 🎡 city break) so clicking
 * through actually lands on that expense/trip, same as a real logged action.
 * Newest first, matching how logMockHistory prepends new entries in client.ts.
 */
export const MOCK_HISTORY: HistoryEntry[] = [
  {
    timestamp: hoursAgo(2),
    actor: 'mara',
    action: 'add',
    entity: 'expense',
    entityId: 'exp-4b',
    sheetId: '',
    label: "mara's phone case",
    category: 'other',
    amount: 24,
    date: ymd(0, 16),
    changes: '',
  },
  {
    timestamp: hoursAgo(26),
    actor: 'momra',
    action: 'add',
    entity: 'expense',
    entityId: 'exp-4',
    sheetId: '',
    label: "momra's new headphones",
    category: 'other',
    amount: 89,
    date: ymd(0, 15),
    changes: '',
  },
  {
    timestamp: hoursAgo(50),
    actor: 'momra',
    action: 'update',
    entity: 'expense',
    entityId: 'exp-3',
    sheetId: '',
    label: 'electricity bill',
    category: 'utilities',
    amount: 63.2,
    date: ymd(0, 12),
    changes: 'amount: 58.1 → 63.2',
  },
  {
    timestamp: hoursAgo(96),
    actor: 'mara',
    action: 'add',
    entity: 'trip',
    entityId: '🎡 city break',
    sheetId: '',
    label: '🎡 city break',
    category: '',
    amount: 0,
    date: '',
    changes: '',
  },
  {
    timestamp: hoursAgo(150),
    actor: 'momra',
    action: 'delete',
    entity: 'expense',
    entityId: '',
    sheetId: '',
    label: 'coffee machine',
    category: 'other',
    amount: 45,
    date: ymd(0, 3),
    changes: '',
  },
  {
    timestamp: hoursAgo(170),
    actor: 'mara',
    action: 'add',
    entity: 'category',
    entityId: '',
    sheetId: '',
    label: '🍽️ dining out',
    category: '',
    amount: 0,
    date: '',
    changes: '',
  },
]
