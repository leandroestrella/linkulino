/**
 * Pure history-entry formatting, mirroring apps-script/sheet.js's
 * expenseLabel/formatTripSummary/formatCategorySummary/diff* functions. The
 * real backend does this server-side and logs to the History tab; mock/demo
 * mode has no backend to do that, so api/client.ts's mock write paths call
 * these directly to keep the activity page populated the same way in every
 * mode.
 */
import type { Category, Expense, NewCategory, NewTrip, Trip } from '@/api/types'

/** An expense's display label, consistent across add/update/delete. */
export function expenseLabel(expense: Expense | ExpenseLike): string {
  return expense.description || '(no description)'
}

type ExpenseLike = Omit<Expense, 'id'>

/** Field-by-field diff between an expense's state before and after an edit. */
export function diffExpense(before: Expense | null, after: ExpenseLike): string {
  if (!before) return ''
  const parts: string[] = []
  if (before.date !== after.date) parts.push(`date: ${before.date} → ${after.date}`)
  if (before.description !== after.description) parts.push(`description: ${before.description} → ${after.description}`)
  if (before.category !== after.category) parts.push(`category: ${before.category} → ${after.category}`)
  if (before.payer !== after.payer) parts.push(`payer: ${before.payer} → ${after.payer}`)
  if (before.amount !== after.amount) parts.push(`amount: ${before.amount} → ${after.amount}`)
  if (!!before.recurring !== !!after.recurring) parts.push(`recurring: ${!!before.recurring} → ${!!after.recurring}`)
  if ((before.notes || '') !== (after.notes || '')) {
    parts.push(`notes: ${before.notes || '(none)'} → ${after.notes || '(none)'}`)
  }

  const names = new Set([...Object.keys(before.splits || {}), ...Object.keys(after.splits || {})])
  for (const name of names) {
    const b = before.splits?.[name] || 0
    const a = after.splits?.[name] || 0
    if (b !== a) parts.push(`split ${name}: ${b}% → ${a}%`)
  }
  return parts.join('; ')
}

/** One-line label for a trip. */
export function formatTripSummary(trip: Trip | NewTrip): string {
  return trip.emoji ? `${trip.emoji} ${trip.name}` : trip.name
}

/** Field-by-field diff between a trip's state before and after an edit. */
export function diffTrip(before: Trip | null, after: NewTrip): string {
  if (!before) return ''
  const parts: string[] = []
  if (before.name !== after.name) parts.push(`name: ${before.name} → ${after.name}`)
  if (before.emoji !== after.emoji) parts.push(`emoji: ${before.emoji} → ${after.emoji}`)
  if (before.startDate !== after.startDate) parts.push(`start date: ${before.startDate} → ${after.startDate}`)
  if (before.endDate !== after.endDate) parts.push(`end date: ${before.endDate} → ${after.endDate}`)
  return parts.join('; ')
}

/** One-line label for a category. */
export function formatCategorySummary(category: Category | NewCategory): string {
  return category.icon ? `${category.icon} ${category.name}` : category.name
}
