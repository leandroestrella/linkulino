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

export type TripStatus = 'active' | 'upcoming' | 'past'

/** A trip's status today, by comparing its date range to the given date (defaults to now). */
export function tripStatus(trip: Trip, today: string = todayIso()): TripStatus {
  if (trip.startDate && today < trip.startDate) return 'upcoming'
  if (trip.endDate && today > trip.endDate) return 'past'
  return 'active'
}
