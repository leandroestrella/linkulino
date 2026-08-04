import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getCategories, getExpenses, getParticipants, getTrips } from '@/api/client'
import type { Category, Expense, Participant, Trip } from '@/api/types'
import { CategoryPieChart } from '@/components/CategoryPieChart'
import { LoadingAvatar } from '@/components/LoadingAvatar'
import { InfoTooltip } from '@/components/InfoTooltip'
import { findParticipant, PersonName } from '@/components/PersonName'
import { VacationsOverallCard } from '@/components/VacationsOverallCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { todayIso } from '@/lib/date'
import { isCommon, isOverheadExpense } from '@/lib/expenses'
import { filtersToSearch } from '@/lib/filters'
import { formatAmount } from '@/lib/format'
import { vacationsSummary } from '@/lib/vacations'

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
function FilterLink({
  search,
  className,
  children,
}: {
  search: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link to={`/${search}`} className={`rounded-sm transition-opacity hover:opacity-60 ${className ?? ''}`}>
      {children}
    </Link>
  )
}

/** One month/year's pie chart + total — shared by the mobile-grouped and desktop-paired layouts. */
function TimeBucketEntry({
  bucket,
  categories,
  range,
}: {
  bucket: [string, Expense[]]
  categories: Category[]
  range: { from: string; to: string }
}) {
  const { t } = useTranslation()
  const [key, expenses] = bucket
  const total = sum(expenses)
  const fourWalls = sum(expenses.filter((e) => isOverheadExpense(e, categories)))
  const discretionary = total - fourWalls
  return (
    // flex-1 so this fills its grid cell's full stretched height (the cell
    // itself is just a plain div — nothing stretches this root to match
    // otherwise), which the inner flex-1 wrapper below then needs to have
    // any extra space to center the chart within.
    <div className="flex flex-1 flex-col">
      <span className="text-muted-foreground text-sm mb-1 block">{key}</span>
      {/* Fills the gap between label and total (e.g. when the paired month/
          year has a taller legend), centering the chart in it rather than
          leaving it pinned to the top. min-h-0 overrides the flex item's
          default min-height:auto, which otherwise keeps it from shrinking
          below its own content size and stops it from correctly filling
          (and centering within) the available space. */}
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <CategoryPieChart expenses={expenses} categories={categories} linkFilters={{ ...range, split: 'all' }} />
      </div>
      <FilterLink search={filtersToSearch({ ...range, split: 'all' })}>
        <span className="font-medium block pt-1">{formatAmount(total)}</span>
      </FilterLink>
      <span className="text-muted-foreground block text-xs">
        {t('overview.fourWalls')} {formatAmount(fourWalls)} · {t('overview.discretionary')} {formatAmount(discretionary)}
      </span>
    </div>
  )
}

/** Each single-user participant's total — first one left-aligned, last one right-aligned (mirrors the "by user" card). */
function SingleUserBreakdown({
  items,
  participants,
}: {
  items: [string, number][]
  participants: Participant[]
}) {
  return (
    <div className="flex items-center justify-between pt-6">
      {items.map(([name, total], i) => (
        <div key={name} className={i === items.length - 1 ? 'text-right' : undefined}>
          <p className="text-muted-foreground text-sm">
            <PersonName person={findParticipant(participants, name)} />
          </p>
          <p className="font-medium">{formatAmount(total)}</p>
        </div>
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

  const thisMonthKey = todayIso().slice(0, 7)
  const thisMonthExpenses = household.filter((e) => e.date.slice(0, 7) === thisMonthKey)
  const fourWallsTotal = sum(thisMonthExpenses.filter((e) => isOverheadExpense(e, categories)))
  const discretionaryTotal = sum(thisMonthExpenses) - fourWallsTotal

  const byMonth = groupBy(household, (e) => e.date.slice(0, 7))
  const byYear = groupBy(household, (e) => e.date.slice(0, 4))
  const householdTotal = sum(household)
  const avgByMonth = byMonth.length > 0 ? householdTotal / byMonth.length : 0
  const avgByYear = byYear.length > 0 ? householdTotal / byYear.length : 0
  const fourWallsAllTime = sum(household.filter((e) => isOverheadExpense(e, categories)))
  const fourWallsAvgByMonth = byMonth.length > 0 ? fourWallsAllTime / byMonth.length : 0
  const vacationsStats = vacationsSummary(trips, vacations, participants.length)
  const byUser = totalsByParticipant(household, participants)
  const common = household.filter(isCommon)
  const singleUser = household.filter((e) => !isCommon(e))
  const commonTotal = sum(common)
  const singleUserTotal = sum(singleUser)
  const singleUserByParticipant = totalsByParticipant(singleUser, participants).filter(
    ([, total]) => total > 0,
  )

  if (loading) {
    return <LoadingAvatar />
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">{t('overview.title')}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.fourWalls')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">{t('home.thisMonth')}</p>
          <p className="flex items-center gap-1.5 text-xl font-medium">
            {formatAmount(fourWallsTotal)}
            <InfoTooltip>{t('overview.fourWallsInfo')}</InfoTooltip>
          </p>
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            {t('overview.discretionary')} {formatAmount(discretionaryTotal)}
            <InfoTooltip>{t('overview.discretionaryInfo')}</InfoTooltip>
          </p>
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            {t('overview.avgByMonth', { amount: formatAmount(fourWallsAvgByMonth) })}
            <InfoTooltip>{t('overview.fourWallsAvgByMonthInfo')}</InfoTooltip>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.byTimeframe')}</CardTitle>
        </CardHeader>
        {/* Mobile: grouped sections (all months, then all years) — a row-major
            layout (below) would interleave "by month"/"by year" titles and
            entries on a single column, since there's no second column to pair
            against. */}
        <CardContent className="flex flex-col gap-6 sm:hidden">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <h3 className="text-muted-foreground text-sm">{t('overview.byMonth')}</h3>
              {byMonth.length > 0 && (
                <p className="flex items-center gap-1.5 text-xl font-medium">
                  {t('overview.avgByMonth', { amount: formatAmount(avgByMonth) })}
                  <InfoTooltip>{t('overview.avgByMonthInfo')}</InfoTooltip>
                </p>
              )}
            </div>
            {byMonth.length === 0 && <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>}
            {byMonth.map(([month, expenses]) => (
              <TimeBucketEntry
                key={month}
                bucket={[month, expenses]}
                categories={categories}
                range={monthRange(month)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <h3 className="text-muted-foreground text-sm">{t('overview.byYear')}</h3>
              {byYear.length > 0 && (
                <p className="flex items-center gap-1.5 text-xl font-medium">
                  {t('overview.avgByYear', { amount: formatAmount(avgByYear) })}
                  <InfoTooltip>{t('overview.avgByYearInfo')}</InfoTooltip>
                </p>
              )}
            </div>
            {byYear.length === 0 && <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>}
            {byYear.map(([year, expenses]) => (
              <TimeBucketEntry key={year} bucket={[year, expenses]} categories={categories} range={yearRange(year)} />
            ))}
          </div>
        </CardContent>

        {/* sm+: row-paired grid so each month/year lines up with its counterpart. */}
        <CardContent className="hidden sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4">
          <div className="flex flex-col">
            <h3 className="text-muted-foreground text-sm">{t('overview.byMonth')}</h3>
            {byMonth.length > 0 && (
              <p className="flex items-center gap-1.5 text-xl font-medium">
                {t('overview.avgByMonth', { amount: formatAmount(avgByMonth) })}
                <InfoTooltip>{t('overview.avgByMonthInfo')}</InfoTooltip>
              </p>
            )}
          </div>
          <div className="flex flex-col">
            <h3 className="text-muted-foreground text-sm">{t('overview.byYear')}</h3>
            {byYear.length > 0 && (
              <p className="flex items-center gap-1.5 text-xl font-medium">
                {t('overview.avgByYear', { amount: formatAmount(avgByYear) })}
                <InfoTooltip>{t('overview.avgByYearInfo')}</InfoTooltip>
              </p>
            )}
          </div>
          {Array.from({ length: Math.max(byMonth.length, byYear.length, 1) }).map((_, i) => {
            const month = byMonth[i]
            const year = byYear[i]
            return (
              <Fragment key={i}>
                <div className="flex flex-col">
                  {i === 0 && byMonth.length === 0 && (
                    <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>
                  )}
                  {month && <TimeBucketEntry bucket={month} categories={categories} range={monthRange(month[0])} />}
                </div>
                <div className="flex flex-col">
                  {i === 0 && byYear.length === 0 && (
                    <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>
                  )}
                  {year && <TimeBucketEntry bucket={year} categories={categories} range={yearRange(year[0])} />}
                </div>
              </Fragment>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.commonVsSingle')}</CardTitle>
        </CardHeader>
        {/* Mobile: each side is a self-contained, fully-stacked column — a
            row-paired grid (below) would interleave the two sides' labels/
            charts/totals on the sm:grid-cols-1 mobile layout, since there's
            no second column to pair against. */}
        <CardContent className="flex flex-col gap-6 sm:hidden">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-muted-foreground text-sm">
              {t('overview.common')}
              <InfoTooltip>{t('overview.commonInfo')}</InfoTooltip>
            </span>
            <CategoryPieChart expenses={common} categories={categories} linkFilters={{ split: 'common' }} />
            <span className="font-medium block pt-1">{formatAmount(commonTotal)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-muted-foreground text-sm">
              {t('overview.singleUser')}
              <InfoTooltip>{t('overview.singleUserInfo')}</InfoTooltip>
            </span>
            <CategoryPieChart expenses={singleUser} categories={categories} linkFilters={{ split: 'single' }} />
            <span className="font-medium block pt-1">{formatAmount(singleUserTotal)}</span>
            {singleUserByParticipant.length > 0 && <SingleUserBreakdown items={singleUserByParticipant} participants={participants} />}
          </div>
        </CardContent>

        {/* sm+: row-paired grid (label row, chart row, total row) so the two
            charts and totals line up regardless of how many categories each
            side's legend has — items-center vertically centers each cell
            within its row, so a shorter legend's chart sits centered between
            the label above and the total below rather than pinned to either. */}
        <CardContent className="hidden sm:grid sm:grid-cols-2 sm:items-center sm:gap-x-6 sm:gap-y-1">
          <span className="flex items-center gap-1 text-muted-foreground text-sm">
            {t('overview.common')}
            <InfoTooltip>{t('overview.commonInfo')}</InfoTooltip>
          </span>
          <span className="flex items-center gap-1 text-muted-foreground text-sm">
            {t('overview.singleUser')}
            <InfoTooltip>{t('overview.singleUserInfo')}</InfoTooltip>
          </span>
          <CategoryPieChart expenses={common} categories={categories} linkFilters={{ split: 'common' }} />
          <CategoryPieChart expenses={singleUser} categories={categories} linkFilters={{ split: 'single' }} />
          <span className="font-medium block pt-1">{formatAmount(commonTotal)}</span>
          <span className="font-medium block pt-1">{formatAmount(singleUserTotal)}</span>
          <span />
          {singleUserByParticipant.length > 0 && <SingleUserBreakdown items={singleUserByParticipant} participants={participants} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            {t('overview.byUser')}
            <InfoTooltip>{t('overview.byUserInfo')}</InfoTooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          {byUser.map(([name, total], i) => {
            const person = participants.find((p) => p.name === name) ?? { name, icon: '' }
            return (
              <FilterLink key={name} search={filtersToSearch({ payer: name, split: 'all' })}>
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

      <VacationsOverallCard summary={vacationsStats} />
    </div>
  )
}
