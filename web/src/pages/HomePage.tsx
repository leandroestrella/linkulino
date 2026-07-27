import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getExpenses, getParticipants } from '@/api/client'
import type { Expense, Participant } from '@/api/types'
import { AuthBar } from '@/auth/AuthBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
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

export function HomePage() {
  const { t } = useTranslation()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([getExpenses(), getParticipants()]).then(([e, p]) => {
      setExpenses(e)
      setParticipants(p)
      setLoading(false)
    })
  }, [])

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const saldo = balances(expenses, participants)
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="https://github.com/leandroestrella/linkulino" target="_blank" rel="noreferrer">
            <img src="/linkulino.png" alt="" className="w-12 sm:w-14" />
          </a>
          <div>
            <h1 className="text-2xl font-semibold">linkulino</h1>
            <p className="text-muted-foreground">{t('app.tagline')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <AuthBar />
          <Button asChild>
            <Link to="/add">{t('home.addExpense')}</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('home.thisMonth')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <p className="text-muted-foreground text-sm">{t('home.total')}</p>
            <p className="text-xl font-medium">{formatAmount(total)}</p>
          </div>
          {Object.entries(saldo).map(([name, amount]) => (
            <div key={name}>
              <p className="text-muted-foreground text-sm">{name}</p>
              <p className={`text-xl font-medium ${amount < 0 ? 'text-destructive' : ''}`}>
                {amount >= 0 ? '+' : ''}
                {formatAmount(amount)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        {loading && <p className="text-muted-foreground">{t('home.loading')}</p>}
        {!loading && sorted.length === 0 && <p className="text-muted-foreground">{t('home.empty')}</p>}
        {sorted.map((expense) => (
          <Card key={expense.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{expense.description}</p>
                <p className="text-muted-foreground text-sm">
                  {expense.date} · {expense.category} · {t('home.paidBy', { name: expense.payer })}
                </p>
              </div>
              <p className="font-medium">{formatAmount(expense.amount)}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  )
}
