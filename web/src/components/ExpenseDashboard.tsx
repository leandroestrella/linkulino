import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RepeatIcon, PencilIcon } from 'lucide-react'
import { getExpenses, getParticipants } from '@/api/client'
import type { Expense, Participant } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingDots } from '@/components/LoadingDots'
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

/** Totals card + expense list for either the household budget or a single trip. */
export function ExpenseDashboard({
  sheetId,
  title,
  addHref,
  editBase,
}: {
  /** Trip id, or undefined for the household budget. */
  sheetId?: string
  title: string
  addHref: string
  /** Base path for an expense's edit link; the expense id is appended. */
  editBase: string
}) {
  const { t } = useTranslation()
  const { configured, status, authorized } = useAuth()
  const subHeader = useSubHeaderContainer()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void Promise.all([getExpenses(sheetId), getParticipants()]).then(([e, p]) => {
      setExpenses(e)
      setParticipants(p)
      setLoading(false)
    })
  }, [sheetId])

  const canWrite = !configured || (status === 'signed-in' && authorized)
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const saldo = balances(expenses, participants)
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date))

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
                  <div className="flex flex-wrap justify-end gap-x-6 gap-y-2 text-right">
                    {Object.entries(saldo).map(([name, amount]) => (
                      <div key={name}>
                        <p className="text-muted-foreground text-sm">{name}</p>
                        <p
                          className={`text-xl font-medium ${amount < 0 ? 'text-destructive' : amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                        >
                          {amount >= 0 ? '+' : ''}
                          {formatAmount(amount)}
                        </p>
                      </div>
                    ))}
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
            <CardContent className="flex items-center justify-between py-3">
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
                  <p className="text-muted-foreground text-sm">{t('home.paidBy', { name: expense.payer })}</p>
                </div>
                {canWrite && (
                  <Button asChild variant="ghost" size="icon" aria-label={t('form.editTitle')}>
                    <Link to={`${editBase}/${expense.id}/edit`}>
                      <PencilIcon className="size-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
