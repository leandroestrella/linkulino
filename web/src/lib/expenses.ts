import type { Category, Expense } from '@/api/types'

/** An expense is "common" when more than one participant has a nonzero share, else "single-user". */
export function isCommon(expense: Expense): boolean {
  return Object.values(expense.splits).filter((pct) => pct > 0).length > 1
}

/** True when an expense's category is flagged `overhead` (the "four walls" essentials) — false if the category is unrecognized. */
export function isOverheadExpense(expense: Expense, categories: Category[]): boolean {
  return categories.find((c) => c.name === expense.category)?.overhead ?? false
}
