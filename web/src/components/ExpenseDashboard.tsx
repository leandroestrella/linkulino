import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RepeatIcon, PencilIcon } from 'lucide-react'
import { getCategories, getExpenses, getParticipants } from '@/api/client'
import type { Category, Expense, Participant } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingDots } from '@/components/LoadingDots'
import { PersonName } from '@/components/PersonName'
import { useSubHeaderContainer } from '@/components/subheader'
import { formatAmount } from '@/lib/format'

/** Each participant's balance: total paid minus their share of every expense. Positive = owed money. */
function balances(expenses: Expense[], participants: Participant[]): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(participants.map((p) => [p.name, 0]))
  for (const expense of expenses) {
    for (const [name, percent] of Object.entries(expense.splits)) {
      const owed = (expense.amount * percent) / 100
      const paid = expense.payer === name ? expense.amount : 0
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
}: {
  /** Trip id, or undefined for the household budget. */
  sheetId?: string
  title: string
  addHref: string
  /** Base path for an expense's edit link; the expense id is appended. */
  editBase: string
  /** When true, only shows expenses dated in the current calendar month (household budget only — a trip's own date range already scopes it). */
  monthFilter?: boolean
}) {
  const { t } = useTranslation()
  const { configured, status, authorized } = useAuth()
  const subHeader = useSubHeaderContainer()
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
  const thisMonth = new Date().toISOString().slice(0, 7)
  const scoped = monthFilter ? expenses.filter((e) => e.date.slice(0, 7) === thisMonth) : expenses
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
              {canWrite && (
                <div className="flex justify-end">
                  <Button asChild size="sm">
                    <Link to={addHref}>{t('home.addExpense')}</Link>
                  </Button>
                </div>
              )}
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
              <span className="text-2xl" aria-hidden>
                {categoryIcon(expense.category)}
              </span>
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
                      {t('home.paidByPrefix')}{' '}
                      <PersonName
                        person={participants.find((p) => p.name === expense.payer) ?? { name: expense.payer, icon: '' }}
                      />
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
