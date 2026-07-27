import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCategories, getExpenses, getParticipants, getTrips } from '@/api/client'
import type { Category, Expense, Participant, Trip } from '@/api/types'
import { LoadingDots } from '@/components/LoadingDots'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatAmount } from '@/lib/format'

/** Groups expenses by a key derived from each one (e.g. month, year), sorted by key descending. */
function groupBy(expenses: Expense[], key: (e: Expense) => string): [string, Expense[]][] {
  const groups = new Map<string, Expense[]>()
  for (const expense of expenses) {
    const k = key(expense)
    const group = groups.get(k)
    if (group) group.push(expense)
    else groups.set(k, [expense])
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

/** Each participant's total responsibility (their % share of every expense), not what they paid. */
function totalsByParticipant(expenses: Expense[], participants: Participant[]): [string, number][] {
  const totals = new Map(participants.map((p) => [p.name, 0]))
  for (const expense of expenses) {
    for (const [name, percent] of Object.entries(expense.splits)) {
      totals.set(name, (totals.get(name) ?? 0) + (expense.amount * percent) / 100)
    }
  }
  return [...totals.entries()]
}

/** Each category's total, sorted highest first. */
function totalsByCategory(expenses: Expense[]): [string, number][] {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount)
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])
}

/** An expense is "common" when more than one participant has a nonzero share, else "single-user". */
function isCommon(expense: Expense): boolean {
  return Object.values(expense.splits).filter((pct) => pct > 0).length > 1
}

/** A trip's length in days (inclusive of both start and end date), or 0 if its dates are missing. */
function tripDays(trip: Trip): number {
  if (!trip.startDate || !trip.endDate) return 0
  const start = new Date(trip.startDate).getTime()
  const end = new Date(trip.endDate).getTime()
  return Math.max(Math.round((end - start) / 86_400_000) + 1, 0)
}

function sum(expenses: Expense[]): number {
  return expenses.reduce((total, e) => total + e.amount, 0)
}

/** Compact wrapped list of each category's total, with its emoji. */
function CategoryBreakdown({ expenses, categories }: { expenses: Expense[]; categories: Category[] }) {
  const breakdown = totalsByCategory(expenses)
  if (breakdown.length === 0) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
      {breakdown.map(([name, total]) => (
        <span key={name} className="text-muted-foreground text-xs">
          {categories.find((c) => c.name === name)?.icon ?? '💸'} {name} {formatAmount(total)}
        </span>
      ))}
    </div>
  )
}

export function OverviewPage() {
  const { t } = useTranslation()
  const [household, setHousehold] = useState<Expense[]>([])
  const [vacations, setVacations] = useState<Expense[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([getExpenses(), getParticipants(), getCategories(), getTrips()]).then(
      async ([h, p, c, tripList]) => {
        const perTrip = await Promise.all(tripList.map((trip) => getExpenses(trip.id)))
        setHousehold(h)
        setParticipants(p)
        setCategories(c)
        setTrips(tripList)
        setVacations(perTrip.flat())
        setLoading(false)
      },
    )
  }, [])

  const byMonth = groupBy(household, (e) => e.date.slice(0, 7))
  const byYear = groupBy(household, (e) => e.date.slice(0, 4))
  const vacationsTotal = sum(vacations)
  const totalDays = trips.reduce((total, trip) => total + tripDays(trip), 0)
  const byUser = totalsByParticipant(household, participants)
  const common = household.filter(isCommon)
  const singleUser = household.filter((e) => !isCommon(e))
  const commonTotal = sum(common)
  const singleUserTotal = sum(singleUser)
  const singleUserByParticipant = totalsByParticipant(singleUser, participants)

  if (loading) {
    return (
      <p className="text-muted-foreground">
        {t('home.loading')}
        <LoadingDots />
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">{t('overview.title')}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.byMonth')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {byMonth.length === 0 && <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>}
          {byMonth.map(([month, expenses]) => (
            <div key={month}>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">{month}</span>
                <span className="font-medium">{formatAmount(sum(expenses))}</span>
              </div>
              <CategoryBreakdown expenses={expenses} categories={categories} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.byYear')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {byYear.length === 0 && <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>}
          {byYear.map(([year, expenses]) => (
            <div key={year}>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">{year}</span>
                <span className="font-medium">{formatAmount(sum(expenses))}</span>
              </div>
              <CategoryBreakdown expenses={expenses} categories={categories} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.vacationsOverall')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <p className="text-muted-foreground text-sm">{t('home.total')}</p>
            <p className="text-xl font-medium">{formatAmount(vacationsTotal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">{t('overview.perVacation')}</p>
            <p className="text-xl font-medium">
              {trips.length > 0 ? formatAmount(vacationsTotal / trips.length) : '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">{t('overview.perDay')}</p>
            <p className="text-xl font-medium">{totalDays > 0 ? formatAmount(vacationsTotal / totalDays) : '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.byUser')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-8 gap-y-2">
          {byUser.map(([name, total]) => (
            <div key={name}>
              <p className="text-muted-foreground text-sm">{name}</p>
              <p className="text-xl font-medium">{formatAmount(total)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.commonVsSingle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">{t('overview.common')}</span>
              <span className="font-medium">{formatAmount(commonTotal)}</span>
            </div>
            <CategoryBreakdown expenses={common} categories={categories} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">{t('overview.singleUser')}</span>
              <span className="font-medium">{formatAmount(singleUserTotal)}</span>
            </div>
            <CategoryBreakdown expenses={singleUser} categories={categories} />
          </div>
          {singleUserTotal > 0 && (
            <div className="flex flex-wrap gap-x-8 gap-y-2 pt-1">
              {singleUserByParticipant
                .filter(([, total]) => total > 0)
                .map(([name, total]) => (
                  <div key={name}>
                    <p className="text-muted-foreground text-sm">{name}</p>
                    <p className="font-medium">{formatAmount(total)}</p>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
