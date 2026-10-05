/**
 * Recurring expenses: which household expenses (rent, internet…) need a fresh
 * copy for the current month. Pure logic, so it is tested without a database.
 */
import type { ExpenseRow } from './schema.js'

type Fields = Omit<ExpenseRow, 'id' | 'rev' | 'updatedAt'>

/**
 * For each description marked recurring anywhere in the household expenses, its
 * most recent occurrence becomes the template — unless that description already
 * has an entry dated this month, in which case it's skipped (so running this
 * more than once in the same month adds nothing). Trips are time-boxed, so
 * their expenses never recur.
 * @param expenses every expense, trips' included
 * @param today `YYYY-MM-DD`; the new expenses are dated with it
 */
export function expensesToRecreate(expenses: Fields[], today: string): Fields[] {
  const month = today.slice(0, 7)
  const household = expenses.filter((expense) => !expense.trip)

  const alreadyThisMonth = new Set(household.filter((expense) => expense.date?.slice(0, 7) === month).map((expense) => expense.description))

  const latest = new Map<string | null, Fields>()
  for (const expense of household) {
    if (!expense.recurring) continue
    const current = latest.get(expense.description)
    if (!current || (expense.date ?? '') > (current.date ?? '')) latest.set(expense.description, expense)
  }

  return [...latest.values()]
    .filter((template) => !alreadyThisMonth.has(template.description))
    .map((template) => ({
      date: today,
      description: template.description,
      category: template.category,
      payer: template.payer,
      amount: template.amount,
      splitA: template.splitA,
      splitB: template.splitB,
      recurring: true,
      notes: template.notes,
      trip: null,
    }))
}
