import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RepeatIcon, PencilIcon } from 'lucide-react'
import { getCategories, getExpenses, getParticipants } from '@/api/client'
import type { Category, Expense, Participant } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpenseFilters } from '@/components/ExpenseFilters'
import { LoadingAvatar } from '@/components/LoadingAvatar'
import { findParticipant, PersonName } from '@/components/PersonName'
import { useAdminSlotContainer, useSubHeaderContainer } from '@/components/subheader'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { todayIso } from '@/lib/date'
import {
  EMPTY_FILTERS,
  filterExpenses,
  filtersFromSearchParams,
  filtersToSearch,
  matchingTimeframeKey,
} from '@/lib/filters'
import { formatAmount } from '@/lib/format'

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
  monthFilter = false,
  showFilters = false,
}: {
  /** Trip id, or undefined for the household budget. */
  sheetId?: string
  title: string
  addHref: string
  /** Base path for an expense's edit link; the expense id is appended. */
  editBase: string
  /** When true, only shows expenses dated in the current calendar month (household budget only — a trip's own date range already scopes it). Superseded by an explicit date-range filter. */
  monthFilter?: boolean
  /** When true, shows the category/payer/date-range filter bar, synced to the URL. */
  showFilters?: boolean
}) {
  const { t } = useTranslation()
  const { configured, status, authorized } = useAuth()
  const subHeader = useSubHeaderContainer()
  const adminSlot = useAdminSlotContainer()
  const [searchParams, setSearchParams] = useSearchParams()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
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
    void Promise.all([getExpenses(sheetId), getParticipants(), getCategories()]).then(([e, p, c]) => {
      setExpenses(e)
      setParticipants(p)
      setCategories(c)
      setLoading(false)
    })
  }, [sheetId])

  const canWrite = !configured || (status === 'signed-in' && authorized)
  const filters = showFilters ? filtersFromSearchParams(searchParams) : EMPTY_FILTERS
  const thisMonth = todayIso().slice(0, 7)
  const monthScoped =
    monthFilter && !filters.from && !filters.to ? expenses.filter((e) => e.date.slice(0, 7) === thisMonth) : expenses
  const scoped = filterExpenses(monthScoped, filters)
  const total = scoped.reduce((sum, e) => sum + e.amount, 0)
  // Debt is a whole-picture concept — always computed unfiltered (this month, or
  // every expense for a trip), never scoped to the category/payer/date-range
  // filters, since "who owes whom" only makes sense across the full picture.
  const unfiltered = monthFilter ? expenses.filter((e) => e.date.slice(0, 7) === thisMonth) : expenses
  const balance = singleBalance(unfiltered, participants)
  const sorted = [...scoped].sort((a, b) => b.date.localeCompare(a.date))
  const categoryIcon = (name: string) => categories.find((c) => c.name === name)?.icon ?? '💸'

  // For the filterable (household budget) dashboard, the card title tracks the
  // active timeframe filter instead of always saying "this month" — falls back
  // to the given `title` when there's no filter bar (e.g. a trip's dashboard).
  let cardTitle = title
  if (showFilters) {
    if (!filters.from && !filters.to) {
      cardTitle = t('home.thisMonth')
    } else {
      const timeframeKey = matchingTimeframeKey(filters)
      if (timeframeKey) cardTitle = t(`filters.${timeframeKey}`)
      else if (filters.from && filters.to) cardTitle = `${filters.from} → ${filters.to}`
      else if (filters.from) cardTitle = `${t('filters.from')} ${filters.from}`
      else cardTitle = `${t('filters.to')} ${filters.to}`
    }
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
          <div className="mx-auto w-full max-w-2xl px-4 pb-3">
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
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-muted-foreground text-sm">{t('home.total')}</p>
                    <p className="text-xl font-medium">{formatAmount(total)}</p>
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
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>,
          subHeader,
        )}

      <section className="flex flex-col gap-2">
        {loading && <LoadingAvatar />}
        {!loading && sorted.length === 0 && <p className="text-muted-foreground">{t('home.empty')}</p>}
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
                      <RepeatIcon
                        className="text-muted-foreground size-3.5 shrink-0"
                        aria-label={t('form.recurring')}
                      />
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
                    <Button asChild variant="ghost" size="icon" aria-label={t('form.editTitle')}>
                      <Link to={`${editBase}/${expense.id}/edit`}>
                        <PencilIcon className="size-4" />
                      </Link>
                    </Button>
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
