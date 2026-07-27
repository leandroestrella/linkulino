import type { Expense } from '@/api/types'

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
