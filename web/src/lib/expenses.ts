import type { Expense } from '@/api/types'

/** An expense is "common" when more than one participant has a nonzero share, else "single-user". */
export function isCommon(expense: Expense): boolean {
  return Object.values(expense.splits).filter((pct) => pct > 0).length > 1
}
