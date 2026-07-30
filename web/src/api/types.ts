/**
 * Shared data model for the Linkulino SPA.
 *
 * Mirrors the shape of the Google Sheet: each expense has a payer and a split
 * across participants (percentage per participant, e.g. 50/50). The backend
 * computes each participant's quota and running balance from these.
 */
import { todayIso } from '@/lib/date'

export interface Participant {
  name: string
  icon: string
}

/** An expense category, with the emoji shown next to it. */
export interface Category {
  name: string
  icon: string
}

/** Fields accepted when creating a category. */
export type NewCategory = Category

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
  /** True for expenses that repeat every month (e.g. rent, internet). */
  recurring: boolean
}

/** Fields accepted when creating or editing an expense. The backend assigns `id`. */
export type ExpenseInput = Omit<Expense, 'id'>

/** A trip (vacation) that side-tracks its own expenses, separate from the household budget. */
export interface Trip {
  /** The tab name — also used to address its expenses. */
  id: string
  name: string
  emoji: string
  /** ISO `YYYY-MM-DD`. */
  startDate: string
  /** ISO `YYYY-MM-DD`. */
  endDate: string
}

/** Fields accepted when creating a trip. The backend derives the tab name from `name`. */
export type NewTrip = Omit<Trip, 'id'>

/** One logged action against an expense, trip, or category — see apps-script/Code.js's History tab. */
export interface HistoryEntry {
  /** ISO 8601 timestamp (UTC). */
  timestamp: string
  /** Participant name who performed the action. */
  actor: string
  action: 'add' | 'update' | 'delete'
  entity: 'expense' | 'trip' | 'category'
  /** One-line label for the affected item. */
  summary: string
  /** Field-by-field diff for an edit (e.g. "amount: 50 → 84.5"), '' otherwise. */
  changes: string
}

export type TripStatus = 'active' | 'upcoming' | 'past'

/** A trip's status today, by comparing its date range to the given date (defaults to now). */
export function tripStatus(trip: Trip, today: string = todayIso()): TripStatus {
  if (trip.startDate && today < trip.startDate) return 'upcoming'
  if (trip.endDate && today > trip.endDate) return 'past'
  return 'active'
}
