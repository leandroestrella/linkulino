import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DownloadIcon, RepeatIcon, PencilIcon, StickyNoteIcon } from 'lucide-react'
import { getCategories, getExpenses, getParticipants } from '@/api/client'
import type { Category, Expense, Participant } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpenseFilters } from '@/components/ExpenseFilters'
import { InfoTooltip } from '@/components/InfoTooltip'
import { LoadingAvatar } from '@/components/LoadingAvatar'
import { findParticipant, PersonName } from '@/components/PersonName'
import { useAdminSlotContainer, useSubHeaderContainer } from '@/components/subheader'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { downloadFile, expensesToCsv, type ExportableExpense } from '@/lib/csv'
import { todayIso } from '@/lib/date'
import { isCommon } from '@/lib/expenses'
import {
  EMPTY_FILTERS,
  filterExpenses,
  filtersFromSearchParams,
  filtersToSearch,
  matchingTimeframeKey,
} from '@/lib/filters'
import { formatAmount, formatDate } from '@/lib/format'
import { runwayDepletionDate, type RunwayResult } from '@/lib/runway'

/** Each participant's balance: total paid minus their share of every expense. Positive = owed money. */
function balances(expenses: Expense[], participants: Participant[]): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(participants.map((p) => [p.name, 0]))
  for (const expense of expenses) {
    for (const [name, percent] of Object.entries(expense.splits)) {
      const owed = (expense.amount * percent) / 100
      // Sheet free text may not match the Users tab's casing exactly (e.g. historical
      // rows entered "Leandro" before the participant was named "leandro") — compare
      // case-insensitively so those rows still count.
      const paid = expense.payer.toLowerCase() === name.toLowerCase() ? expense.amount : 0
      result[name] = (result[name] ?? 0) + paid - owed
    }
  }
  return result
}

/** True when every participant's share is the plain even split (e.g. 50/50 for two people). */
function isEvenSplit(expense: Expense, participants: Participant[]): boolean {
  if (participants.length < 2) return true
  const even = 100 / participants.length
  return participants.every((p) => Math.abs((expense.splits[p.name] ?? 0) - even) < 0.5)
}

/** Renders a RunwayResult as the text following the "runway:" label. */
function runwayText(runway: RunwayResult, t: (key: string) => string): string {
  if (runway.kind === 'date') return formatDate(runway.date)
  if (runway.kind === 'depleted') return t('home.runwayDepleted')
  return t('home.runwayIndefinite')
}

/** Who owes whom, as a single amount — avoids showing the same number twice for two people. */
function singleBalance(
  expenses: Expense[],
  participants: Participant[],
): { debtor: Participant; creditor: Participant; amount: number } | null {
  if (participants.length < 2) return null
  const [a, b] = participants
  const balanceA = balances(expenses, participants)[a.name] ?? 0
  const amount = Math.round(Math.abs(balanceA) * 100) / 100
  if (amount < 0.01) return null
  return balanceA > 0 ? { debtor: b, creditor: a, amount } : { debtor: a, creditor: b, amount }
}

/** Totals card + expense list for either the household budget or a single trip. */
export function ExpenseDashboard({
  sheetId,
  title,
  addHref,
  editBase,
  showFilters = false,
}: {
  /** Trip id, or undefined for the household budget. */
  sheetId?: string
  title: string
  addHref: string
  /** Base path for an expense's edit link; the expense id is appended. */
  editBase: string
  /** When true, shows the category/payer/date-range filter bar, synced to the URL. */
  showFilters?: boolean
}) {
  const { t } = useTranslation()
  const { canWrite, participantName, runwayEnabled, savings } = useAuth()
  const subHeader = useSubHeaderContainer()
  const adminSlot = useAdminSlotContainer()
  const [searchParams, setSearchParams] = useSearchParams()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // Which expense's split tooltip is open — tapping the ⚖️ icon toggles this on
  // touch devices, which have no hover state to reveal a plain Tooltip.
  const [openSplitId, setOpenSplitId] = useState<string | null>(null)

  useEffect(() => {
    if (!openSplitId) return
    function closeUnlessOnTrigger(e: PointerEvent) {
      const target = e.target as HTMLElement
      if (target.closest('[aria-label="uneven split"]')) return
      setOpenSplitId(null)
    }
    document.addEventListener('pointerdown', closeUnlessOnTrigger)
    return () => document.removeEventListener('pointerdown', closeUnlessOnTrigger)
  }, [openSplitId])

  useEffect(() => {
    setLoading(true)
    setError(false)
    void Promise.all([getExpenses(sheetId), getParticipants(), getCategories()])
      .then(([e, p, c]) => {
        setExpenses(e)
        setParticipants(p)
        setCategories(c)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [sheetId])

  const filters = showFilters ? filtersFromSearchParams(searchParams) : EMPTY_FILTERS
  const scoped = filterExpenses(expenses, filters, categories)
  const total = scoped.reduce((sum, e) => sum + e.amount, 0)
  const commonTotal = scoped.filter(isCommon).reduce((sum, e) => sum + e.amount, 0)
  const singleUserTotal = total - commonTotal
  const balance = singleBalance(scoped, participants)
  // Only meaningful where there's a filter bar to diverge from — on a trip
  // page (no filters, no monthFilter) `scoped` already equals `expenses`.
  const allTimeBalance = showFilters ? singleBalance(expenses, participants) : null
  // Household only, and only the signed-in viewer's own runway — never a
  // partner's, even though this card is shared (see lib/runway.ts). Uses the
  // full unfiltered `expenses` (all-time), not `scoped`, since runway is an
  // all-time average independent of the active month/filter view.
  const runway =
    !sheetId && runwayEnabled ? runwayDepletionDate(expenses, participantName, savings, todayIso()) : null
  const sorted = [...scoped].sort((a, b) => b.date.localeCompare(a.date))
  const categoryIcon = (name: string) => categories.find((c) => c.name === name)?.icon ?? '💸'

  function handleExport() {
    const sheet = sheetId ?? 'household'
    const exportable: ExportableExpense[] = scoped.map((e) => ({ ...e, sheet }))
    downloadFile(`linkulino-${sheet}-${todayIso()}.csv`, expensesToCsv(exportable, participants), 'text/csv;charset=utf-8;')
  }

  // For the filterable (household budget) dashboard, the card title tracks the
  // active timeframe filter — falls back to the given `title` when there's no
  // filter bar (e.g. a trip's dashboard).
  let cardTitle = title
  if (showFilters) {
    const timeframeKey = matchingTimeframeKey(filters)
    if (timeframeKey) cardTitle = t(`filters.${timeframeKey}`)
    else if (filters.from && filters.to) cardTitle = `${filters.from} → ${filters.to}`
    else if (filters.from) cardTitle = `${t('filters.from')} ${filters.from}`
    else if (filters.to) cardTitle = `${t('filters.to')} ${filters.to}`
  }

  return (
    <div className="flex flex-col gap-6">
      {adminSlot &&
        canWrite &&
        createPortal(
          <Button asChild size="sm">
            <Link to={addHref}>{t('home.addExpense')}</Link>
          </Button>,
          adminSlot,
        )}

      {subHeader &&
        createPortal(
          <div className="mx-auto w-full max-w-6xl px-4 pb-3 sm:px-6">
            <div className="flex flex-col gap-3">
              {showFilters && (
                <ExpenseFilters
                  categories={categories}
                  participants={participants}
                  filters={filters}
                  onChange={(next) => setSearchParams(new URLSearchParams(filtersToSearch(next)))}
                />
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{cardTitle}</CardTitle>
                  <CardAction>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('home.exportCsv')}
                          onClick={handleExport}
                        >
                          <DownloadIcon className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('home.exportCsv')}</TooltipContent>
                    </Tooltip>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-muted-foreground text-sm">{t('home.total')}</p>
                    <p className="text-xl font-medium">{formatAmount(total)}</p>
                    {total > 0 && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        <p className="text-muted-foreground flex items-center gap-1 text-xs">
                          {t('home.common')} {formatAmount(commonTotal)}
                          <InfoTooltip>{t('home.commonInfo')}</InfoTooltip>
                        </p>
                        <p className="text-muted-foreground flex items-center gap-1 text-xs">
                          {t('home.singleUser')} {formatAmount(singleUserTotal)}
                          <InfoTooltip>{t('home.singleUserInfo')}</InfoTooltip>
                        </p>
                      </div>
                    )}
                    {runway && (
                      <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                        {t('home.runway')} {runwayText(runway, t)}
                        <InfoTooltip>{t('home.runwayInfo')}</InfoTooltip>
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {balance ? (
                      <>
                        <p className="text-muted-foreground text-sm">
                          <PersonName person={balance.debtor} /> {t('home.owesConnector')}{' '}
                          <PersonName person={balance.creditor} />
                        </p>
                        <p className="text-xl font-medium">{formatAmount(balance.amount)}</p>
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm">{t('home.settledUp')}</p>
                    )}
                    {showFilters && (
                      <div className="mt-1 flex flex-col items-end gap-0.5">
                        <p className="text-muted-foreground flex items-center justify-end gap-1 text-xs">
                          {t('home.allTime')}:
                          <InfoTooltip>{t('home.allTimeBalanceInfo')}</InfoTooltip>
                        </p>
                        {allTimeBalance ? (
                          <p className="text-muted-foreground text-xs">
                            <PersonName person={allTimeBalance.debtor} /> {t('home.owesConnector')}{' '}
                            <PersonName person={allTimeBalance.creditor} />{' '}
                            <span className="font-semibold">{formatAmount(allTimeBalance.amount)}</span>
                          </p>
                        ) : (
                          <p className="text-muted-foreground text-xs">{t('home.settledUp')}</p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>,
          subHeader,
        )}

      <section className="flex flex-col gap-2">
        {loading && <LoadingAvatar />}
        {!loading && error && <p className="text-destructive">{t('app.loadError')}</p>}
        {!loading && !error && sorted.length === 0 && <p className="text-muted-foreground">{t('home.empty')}</p>}
        {sorted.map((expense) => (
          <Card key={expense.id}>
            <CardContent className="flex items-center gap-3 py-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-2xl">{categoryIcon(expense.category)}</span>
                </TooltipTrigger>
                <TooltipContent className="lowercase">{expense.category}</TooltipContent>
              </Tooltip>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium">
                    <span className="min-w-0 truncate">
                      {expense.description} ·{' '}
                      <span className="text-muted-foreground lowercase font-normal">{expense.category}</span>
                    </span>
                    {expense.recurring && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <RepeatIcon
                            className="text-muted-foreground size-3.5 shrink-0"
                            aria-label={t('form.recurring')}
                          />
                        </TooltipTrigger>
                        <TooltipContent>{t('form.recurring')}</TooltipContent>
                      </Tooltip>
                    )}
                    {expense.notes && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <StickyNoteIcon
                            className="text-muted-foreground size-3.5 shrink-0"
                            aria-label={t('form.notes')}
                          />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-56">{expense.notes}</TooltipContent>
                      </Tooltip>
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm whitespace-nowrap">{expense.date}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1 font-medium whitespace-nowrap">
                      {formatAmount(expense.amount)}
                      {!isEvenSplit(expense, participants) && (
                        <Tooltip
                          open={openSplitId === expense.id}
                          onOpenChange={(open) => setOpenSplitId(open ? expense.id : null)}
                        >
                          <TooltipTrigger asChild>
                            {/* A real button (not just hover) so tapping opens it on touch
                                devices, which have no hover state to reveal a plain tooltip.
                                Always force it open (rather than toggling) — on touch, the
                                trigger's own onFocus already opens it before our onClick runs,
                                so comparing against the current state here would read as
                                "already open" and immediately close it again. Tapping the icon
                                a second time to close, and TooltipTrigger's built-in
                                pointerdown-closes-if-open behavior, together already close it;
                                preventDefault only stops its onClick-always-closes behavior. */}
                            <button
                              type="button"
                              className="text-muted-foreground text-xs"
                              aria-label="uneven split"
                              onClick={(e) => {
                                e.preventDefault()
                                setOpenSplitId(expense.id)
                              }}
                            >
                              ⚖️
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {participants
                              .map((p) => `${Math.round(expense.splits[p.name] ?? 0)}% ${p.name}`)
                              .join(' · ')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </p>
                    <p className="text-muted-foreground text-sm whitespace-nowrap">
                      {t('home.paidByPrefix')} <PersonName person={findParticipant(participants, expense.payer)} />
                    </p>
                  </div>
                  {canWrite && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button asChild variant="ghost" size="icon" aria-label={t('form.editTitle')}>
                          <Link to={`${editBase}/${expense.id}/edit`}>
                            <PencilIcon className="size-4" />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('form.editTitle')}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
