import type { Expense } from '@/api/types'
import { localIsoDate } from '@/lib/date'

export interface ExpenseFilterValues {
  category: string
  payer: string
  /** ISO `YYYY-MM-DD`, inclusive. */
  from: string
  /** ISO `YYYY-MM-DD`, inclusive. */
  to: string
}

export const EMPTY_FILTERS: ExpenseFilterValues = { category: '', payer: '', from: '', to: '' }

export function hasActiveFilters(filters: ExpenseFilterValues): boolean {
  return Boolean(filters.category || filters.payer || filters.from || filters.to)
}

/** Applies category/payer (case-insensitive)/date-range filters; blank values are no-ops. */
export function filterExpenses(expenses: Expense[], filters: ExpenseFilterValues): Expense[] {
  const payer = filters.payer.toLowerCase()
  return expenses.filter((e) => {
    if (filters.category && e.category !== filters.category) return false
    if (filters.payer && e.payer.toLowerCase() !== payer) return false
    if (filters.from && e.date < filters.from) return false
    if (filters.to && e.date > filters.to) return false
    return true
  })
}

export function filtersFromSearchParams(params: URLSearchParams): ExpenseFilterValues {
  return {
    category: params.get('category') ?? '',
    payer: params.get('payer') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
}

/** Builds a `?category=...&payer=...` query string for linking into a filtered homepage. */
export function filtersToSearch(filters: Partial<ExpenseFilterValues>): string {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.payer) params.set('payer', filters.payer)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const search = params.toString()
  return search ? `?${search}` : ''
}

// ---------------------------------------------------------------------------
// Timeframe presets
// ---------------------------------------------------------------------------

/**
 * Common shortcut date ranges for expense/accounting filtering — the calendar
 * ("this/last month", "this/last year") and rolling-window ("last N days/
 * months") presets seen across dashboard tools (Grow, GoodData, Qualtrics,
 * etc.): https://help.grow.com/hc/en-us/articles/23157408988173
 */
export const TIMEFRAME_KEYS = [
  'thisMonth',
  'lastMonth',
  'last7Days',
  'last30Days',
  'last90Days',
  'last3Months',
  'last6Months',
  'thisYear',
  'lastYear',
] as const

export type TimeframeKey = (typeof TIMEFRAME_KEYS)[number]

/** Full calendar-month bounds, `monthsAgo` months before `today` (0 = the current month). */
function monthBounds(today: Date, monthsAgo: number): { from: string; to: string } {
  const first = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1)
  const last = new Date(today.getFullYear(), today.getMonth() - monthsAgo + 1, 0)
  return { from: localIsoDate(first), to: localIsoDate(last) }
}

/** Full calendar-year bounds, `yearsAgo` years before `today` (0 = the current year). */
function yearBounds(today: Date, yearsAgo: number): { from: string; to: string } {
  const y = today.getFullYear() - yearsAgo
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

/** A trailing window of `n` days, inclusive of today. */
function lastNDays(today: Date, n: number): { from: string; to: string } {
  const from = new Date(today)
  from.setDate(from.getDate() - (n - 1))
  return { from: localIsoDate(from), to: localIsoDate(today) }
}

/** A trailing window of `n` months, ending today. */
function lastNMonths(today: Date, n: number): { from: string; to: string } {
  const from = new Date(today)
  from.setMonth(from.getMonth() - n)
  return { from: localIsoDate(from), to: localIsoDate(today) }
}

/** Computes a timeframe preset's `{from, to}` bounds, relative to `today` (defaults to now). */
export function timeframeRange(key: TimeframeKey, today: Date = new Date()): { from: string; to: string } {
  switch (key) {
    case 'thisMonth':
      return monthBounds(today, 0)
    case 'lastMonth':
      return monthBounds(today, 1)
    case 'last7Days':
      return lastNDays(today, 7)
    case 'last30Days':
      return lastNDays(today, 30)
    case 'last90Days':
      return lastNDays(today, 90)
    case 'last3Months':
      return lastNMonths(today, 3)
    case 'last6Months':
      return lastNMonths(today, 6)
    case 'thisYear':
      return yearBounds(today, 0)
    case 'lastYear':
      return yearBounds(today, 1)
  }
}

/** The preset (if any) whose bounds exactly match the filters' current from/to — drives the timeframe dropdown's selected state. */
export function matchingTimeframeKey(filters: ExpenseFilterValues, today: Date = new Date()): TimeframeKey | null {
  return TIMEFRAME_KEYS.find((key) => {
    const range = timeframeRange(key, today)
    return range.from === filters.from && range.to === filters.to
  }) ?? null
}
