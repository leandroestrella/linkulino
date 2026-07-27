import type { Expense, Trip } from '@/api/types'

/** A trip's length in days (inclusive of both start and end date), or 0 if its dates are missing. */
export function tripDays(trip: Trip): number {
  if (!trip.startDate || !trip.endDate) return 0
  const start = new Date(trip.startDate).getTime()
  const end = new Date(trip.endDate).getTime()
  return Math.max(Math.round((end - start) / 86_400_000) + 1, 0)
}

export interface VacationsSummary {
  total: number
  perVacation: number | null
  perDay: number | null
}

/** Aggregate vacation spend across every trip: total, and per-vacation/per-day averages. */
export function vacationsSummary(trips: Trip[], vacations: Expense[]): VacationsSummary {
  const total = vacations.reduce((sum, e) => sum + e.amount, 0)
  const totalDays = trips.reduce((sum, trip) => sum + tripDays(trip), 0)
  return {
    total,
    perVacation: trips.length > 0 ? total / trips.length : null,
    perDay: totalDays > 0 ? total / totalDays : null,
  }
}
