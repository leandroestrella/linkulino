/**
 * Shared data model for the Linkulino SPA.
 *
 * Mirrors the shape of the Google Sheet: each expense has a payer and a split
 * across participants (percentage per participant, e.g. 50/50). The backend
 * computes each participant's quota and running balance from these.
 */

export interface Participant {
  name: string
}

/** A single tracked expense — a household expense, or one logged against a trip. */
export interface Expense {
  id: string
  /** ISO `YYYY-MM-DD`. */
  date: string
  description: string
  category: string
  /** Participant name who paid. */
  payer: string
  amount: number
  /** Participant name → share of the expense, in percent. Values sum to 100. */
  splits: Record<string, number>
}

/** Fields accepted when creating an expense. The backend assigns `id`. */
export type NewExpense = Omit<Expense, 'id'>

/** A trip (vacation) that side-tracks its own expenses, separate from the household budget. */
export interface Trip {
  id: string
  name: string
}
