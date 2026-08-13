import type { Expense } from '@/api/types'
import { localIsoDate } from '@/lib/date'

/** An approximate runway estimate — a tagged union so the UI never has to divide by zero or format a nonsense date. */
export type RunwayResult =
  | { kind: 'depleted' } // savings <= 0 while spending is ongoing
  | { kind: 'indefinite' } // no ongoing spend (monthly rate <= 0), so savings never run out
  | { kind: 'date'; date: string } // ISO YYYY-MM-DD estimated depletion date

/**
 * A participant's quota-weighted share of ALL given expenses — both their
 * single-user (100%-split) expenses and their percentage share of common
 * ones. See isCommon/splits in lib/expenses.ts for the underlying model:
 * `splits[name]` is a percentage (0-100), not an amount.
 */
export function personalSpendTotal(expenses: Expense[], participantName: string): number {
  return expenses.reduce((sum, e) => sum + (e.amount * (e.splits[participantName] ?? 0)) / 100, 0)
}

/**
 * Whole calendar months between two ISO dates, floored to 1 so a participant
 * whose only expenses are from the current month doesn't divide by
 * (near-)zero and produce an inflated rate.
 */
export function monthsSince(earliestIso: string, todayIso: string): number {
  if (!earliestIso) return 1
  const [ey, em] = earliestIso.split('-').map(Number)
  const [ty, tm] = todayIso.split('-').map(Number)
  return Math.max(1, (ty - ey) * 12 + (tm - em))
}

/**
 * Average monthly personal spend: total personal spend across every given
 * expense, divided by months since the EARLIEST expense in the list (not
 * necessarily this participant's own earliest) — simpler and more stable
 * than tracking each participant's own start date separately.
 */
export function averageMonthlySpend(expenses: Expense[], participantName: string, todayIso: string): number {
  if (expenses.length === 0) return 0
  const earliest = expenses.reduce((min, e) => (e.date < min ? e.date : min), expenses[0].date)
  return personalSpendTotal(expenses, participantName) / monthsSince(earliest, todayIso)
}

/**
 * Estimated runway: today + (savings ÷ average monthly spend), approximated
 * to the nearest day. See RunwayResult for the non-crashing depleted/
 * indefinite cases — never divides by zero.
 */
export function runwayDepletionDate(
  expenses: Expense[],
  participantName: string,
  savings: number,
  todayIso: string,
): RunwayResult {
  const monthlyRate = averageMonthlySpend(expenses, participantName, todayIso)
  if (monthlyRate <= 0) return { kind: 'indefinite' }
  if (savings <= 0) return { kind: 'depleted' }
  const monthsLeft = savings / monthlyRate
  const [y, m, d] = todayIso.split('-').map(Number)
  // 30-day months are an approximation (this is an "approximate" estimate by
  // design) — Date rolls an out-of-range day into the following month, which
  // is fine here and not a bug.
  const result = new Date(y, m - 1, d + Math.round(monthsLeft * 30))
  return { kind: 'date', date: localIsoDate(result) }
}
