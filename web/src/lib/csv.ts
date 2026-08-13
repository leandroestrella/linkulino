import type { Expense, Participant } from '@/api/types'

/** An expense plus which tab it lives on ("household", or a trip's name) — see expensesToCsv. */
export interface ExportableExpense extends Expense {
  sheet: string
}

/** Escapes one CSV field: quoted (with doubled internal quotes) whenever it contains a comma, quote, or newline. */
function csvField(value: string | number | boolean): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Builds a CSV of the given expenses, one row each, with a dynamic
 * "<name> %" column per participant — mirrors the sheet's own Quota %
 * columns, so the export reads the same way the source data does.
 */
export function expensesToCsv(expenses: ExportableExpense[], participants: Participant[]): string {
  const header = [
    'sheet',
    'date',
    'description',
    'category',
    'payer',
    'amount',
    ...participants.map((p) => `${p.name} %`),
    'recurring',
    'notes',
  ]
  const rows = expenses.map((e) => [
    e.sheet,
    e.date,
    e.description,
    e.category,
    e.payer,
    e.amount,
    ...participants.map((p) => e.splits[p.name] ?? ''),
    e.recurring,
    e.notes,
  ])
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n')
}
