import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExpenses, getParticipants, getTrips } from '@/api/client'
import type { Expense, Participant } from '@/api/types'
import { LoadingDots } from '@/components/LoadingDots'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatAmount } from '@/lib/format'

/** Sums amounts grouped by a key derived from each expense, sorted by key descending. */
function totalsBy(expenses: Expense[], key: (e: Expense) => string): [string, number][] {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    const k = key(expense)
    totals.set(k, (totals.get(k) ?? 0) + expense.amount)
  }
  return [...totals.entries()].sort((a, b) => b[0].localeCompare(a[0]))
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

export function OverviewPage() {
  const { t } = useTranslation()
  const [household, setHousehold] = useState<Expense[]>([])
  const [vacations, setVacations] = useState<Expense[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([getExpenses(), getParticipants(), getTrips()]).then(async ([h, p, trips]) => {
      const perTrip = await Promise.all(trips.map((trip) => getExpenses(trip.id)))
      setHousehold(h)
      setParticipants(p)
      setVacations(perTrip.flat())
      setLoading(false)
    })
  }, [])

  const byMonth = totalsBy(household, (e) => e.date.slice(0, 7))
  const byYear = totalsBy(household, (e) => e.date.slice(0, 4))
  const vacationsTotal = vacations.reduce((sum, e) => sum + e.amount, 0)
  const byUser = totalsByParticipant(household, participants)
  const common = household.filter(isCommon)
  const singleUser = household.filter((e) => !isCommon(e))
  const commonTotal = common.reduce((sum, e) => sum + e.amount, 0)
  const singleUserTotal = singleUser.reduce((sum, e) => sum + e.amount, 0)
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
        <CardContent className="flex flex-col gap-1.5">
          {byMonth.length === 0 && <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>}
          {byMonth.map(([month, total]) => (
            <div key={month} className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">{month}</span>
              <span className="font-medium">{formatAmount(total)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.byYear')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {byYear.length === 0 && <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>}
          {byYear.map(([year, total]) => (
            <div key={year} className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">{year}</span>
              <span className="font-medium">{formatAmount(total)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.vacationsOverall')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-medium">{formatAmount(vacationsTotal)}</p>
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
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">{t('overview.common')}</span>
            <span className="font-medium">{formatAmount(commonTotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">{t('overview.singleUser')}</span>
            <span className="font-medium">{formatAmount(singleUserTotal)}</span>
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
