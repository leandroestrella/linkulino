import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getCategories, getExpenses, getParticipants, getTrips } from '@/api/client'
import type { Category, Expense, Participant, Trip } from '@/api/types'
import { CategoryPieChart } from '@/components/CategoryPieChart'
import { LoadingDots } from '@/components/LoadingDots'
import { PersonName } from '@/components/PersonName'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { filtersToSearch } from '@/lib/filters'
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

/** `from`/`to` ISO bounds covering an entire `YYYY-MM` month. */
function monthRange(month: string): { from: string; to: string } {
  const [year, monthNum] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNum, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

/** `from`/`to` ISO bounds covering an entire `YYYY` year. */
function yearRange(year: string): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

/** A value that links back to the (filtered) home dashboard — the click target for month/year/user totals. */
function FilterLink({ search, children }: { search: string; children: React.ReactNode }) {
  return (
    <Link to={`/${search}`} className="rounded-sm transition-opacity hover:opacity-60">
      {children}
    </Link>
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
        <CardContent className="flex flex-col gap-4">
          {byMonth.length === 0 && <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>}
          {byMonth.map(([month, expenses]) => (
            <div key={month}>
              <FilterLink search={filtersToSearch(monthRange(month))}>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">{month}</span>
                  <span className="font-medium">{formatAmount(sum(expenses))}</span>
                </div>
              </FilterLink>
              <CategoryPieChart expenses={expenses} categories={categories} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.byYear')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {byYear.length === 0 && <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>}
          {byYear.map(([year, expenses]) => (
            <div key={year}>
              <FilterLink search={filtersToSearch(yearRange(year))}>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">{year}</span>
                  <span className="font-medium">{formatAmount(sum(expenses))}</span>
                </div>
              </FilterLink>
              <CategoryPieChart expenses={expenses} categories={categories} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.vacationsOverall')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm">{t('home.total')}</p>
            <p className="text-xl font-medium">{formatAmount(vacationsTotal)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-sm">{t('overview.perVacation')}</p>
            <p className="text-xl font-medium">
              {trips.length > 0 ? formatAmount(vacationsTotal / trips.length) : '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-sm">{t('overview.perDay')}</p>
            <p className="text-xl font-medium">{totalDays > 0 ? formatAmount(vacationsTotal / totalDays) : '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.byUser')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          {byUser.map(([name, total], i) => {
            const person = participants.find((p) => p.name === name) ?? { name, icon: '' }
            return (
              <FilterLink key={name} search={filtersToSearch({ payer: name })}>
                <div className={i === byUser.length - 1 ? 'text-right' : undefined}>
                  <p className="text-muted-foreground text-sm">
                    <PersonName person={person} />
                  </p>
                  <p className="text-xl font-medium">{formatAmount(total)}</p>
                </div>
              </FilterLink>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.commonVsSingle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">{t('overview.common')}</span>
              <span className="font-medium">{formatAmount(commonTotal)}</span>
            </div>
            <CategoryPieChart expenses={common} categories={categories} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">{t('overview.singleUser')}</span>
              <span className="font-medium">{formatAmount(singleUserTotal)}</span>
            </div>
            <CategoryPieChart expenses={singleUser} categories={categories} />
            {singleUserTotal > 0 && (
              <div className="flex flex-wrap gap-x-8 gap-y-2 pt-2">
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
