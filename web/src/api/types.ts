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

/** A participant's own private runway settings (see lib/runway.ts). */
export interface RunwaySettings {
  enableRunway: boolean
  savings: number
}

/** An expense category, with the emoji shown next to it. */
export interface Category {
  name: string
  icon: string
  /** Flags an essential/"four walls" category (groceries, rent, utilities, transport…) for the Overview page's breakdown. */
  overhead: boolean
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
  /** Optional free-text note — e.g. "split with the neighbors too". */
  notes: string
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
  /**
   * The row number (expense) or tab name (trip) this entry refers to — used to
   * link back to it. Blank for deletes (nothing left to link to) and
   * categories (no per-category page exists).
   */
  entityId: string
  /** The trip tab an expense lives on; '' for a household expense or a non-expense entry. */
  sheetId: string
  /** Description/name/category label for the item. */
  label: string
  /** Expense category — '' for trip/category entries. */
  category: string
  /** Expense amount — 0 for trip/category entries. */
  amount: number
  /** Expense date (ISO `YYYY-MM-DD`) — '' for trip/category entries. */
  date: string
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
