import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RepeatIcon, PencilIcon } from 'lucide-react'
import { getCategories, getExpenses, getParticipants } from '@/api/client'
import type { Category, Expense, Participant } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { AuthBar } from '@/auth/AuthBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpenseFilters } from '@/components/ExpenseFilters'
import { LoadingDots } from '@/components/LoadingDots'
import { findParticipant, PersonName } from '@/components/PersonName'
import { useSubHeaderContainer } from '@/components/subheader'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EMPTY_FILTERS, filterExpenses, filtersFromSearchParams, filtersToSearch } from '@/lib/filters'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

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
  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthScoped =
    monthFilter && !filters.from && !filters.to ? expenses.filter((e) => e.date.slice(0, 7) === thisMonth) : expenses
  const scoped = filterExpenses(monthScoped, filters)
  const total = scoped.reduce((sum, e) => sum + e.amount, 0)
  const balance = singleBalance(scoped, participants)
  const sorted = [...scoped].sort((a, b) => b.date.localeCompare(a.date))
  const categoryIcon = (name: string) => categories.find((c) => c.name === name)?.icon ?? '💸'

  return (
    <div className="flex flex-col gap-6">
      {subHeader &&
        createPortal(
          <div className="mx-auto w-full max-w-2xl px-4 pb-3">
            <div className="flex flex-col gap-3">
              <Card>
                <CardHeader>
                  <CardTitle>{title}</CardTitle>
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
              <div className="flex items-center justify-between">
                {canWrite ? (
                  <Button asChild size="sm">
                    <Link to={addHref}>{t('home.addExpense')}</Link>
                  </Button>
                ) : (
                  <span />
                )}
                <AuthBar />
              </div>
              {showFilters && (
                <ExpenseFilters
                  categories={categories}
                  participants={participants}
                  filters={filters}
                  onChange={(next) => setSearchParams(new URLSearchParams(filtersToSearch(next)))}
                />
              )}
            </div>
          </div>,
          subHeader,
        )}

      <section className="flex flex-col gap-2">
        {loading && (
          <p className="text-muted-foreground">
            {t('home.loading')}
            <LoadingDots />
          </p>
        )}
        {!loading && sorted.length === 0 && <p className="text-muted-foreground">{t('home.empty')}</p>}
        {sorted.map((expense) => (
          <Card key={expense.id}>
            <CardContent className="flex items-center gap-3 py-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-2xl">{categoryIcon(expense.category)}</span>
                </TooltipTrigger>
                <TooltipContent>{expense.category}</TooltipContent>
              </Tooltip>
              <div className="flex flex-1 items-center justify-between gap-4">
                <div>
                  <p className="flex items-center gap-1.5 font-medium">
                    {expense.description}
                    {expense.recurring && (
                      <RepeatIcon className="text-muted-foreground size-3.5" aria-label={t('form.recurring')} />
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {expense.date} · {expense.category}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="font-medium">{formatAmount(expense.amount)}</p>
                    <p className="text-muted-foreground text-sm">
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
