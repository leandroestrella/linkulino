import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { addExpense, getCategories, getExpenses, getParticipants, updateExpense } from '@/api/client'
import type { Participant } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Splits 100% evenly across participants, rounding the remainder onto the first one. */
function evenSplit(participants: Participant[]): Record<string, number> {
  if (participants.length === 0) return {}
  const share = Math.floor(100 / participants.length)
  const remainder = 100 - share * participants.length
  return Object.fromEntries(
    participants.map((p, i) => [p.name, i === 0 ? share + remainder : share]),
  )
}

export function ExpenseFormPage({ mode }: { mode: 'add' | 'edit' }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { configured, status, authorized } = useAuth()
  const { id, tripId } = useParams<{ id?: string; tripId?: string }>()

  const [participants, setParticipants] = useState<Participant[]>([])
  const [categories, setCategories] = useState<string[]>([])

  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [payer, setPayer] = useState('')
  const [amount, setAmount] = useState('')
  const [splits, setSplits] = useState<Record<string, number>>({})
  const [recurring, setRecurring] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void Promise.all([
      getParticipants(),
      getCategories(),
      mode === 'edit' && id ? getExpenses(tripId) : Promise.resolve(null),
    ]).then(([p, c, expenses]) => {
      setParticipants(p)
      setCategories(c)
      const existing = expenses?.find((e) => e.id === id)
      if (existing) {
        setDate(existing.date)
        setDescription(existing.description)
        setCategory(existing.category)
        setPayer(existing.payer)
        setAmount(String(existing.amount))
        setSplits(existing.splits)
        setRecurring(existing.recurring)
      } else {
        setSplits(evenSplit(p))
        setPayer(p[0]?.name ?? '')
        setCategory(c[0] ?? '')
      }
      setLoaded(true)
    })
  }, [mode, id, tripId])

  const splitTotal = Object.values(splits).reduce((sum, v) => sum + v, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const parsedAmount = Number(amount)
    if (!description.trim()) return setError(t('form.errorDescriptionRequired'))
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setError(t('form.errorAmountInvalid'))
    if (Math.round(splitTotal) !== 100) return setError(t('form.errorSplitTotal'))

    setSubmitting(true)
    try {
      const payload = { date, description, category, payer, amount: parsedAmount, splits, recurring }
      if (mode === 'edit' && id) await updateExpense(id, payload, tripId)
      else await addExpense(payload, tripId)
      navigate(tripId ? `/trips/${tripId}` : '/')
    } finally {
      setSubmitting(false)
    }
  }

  const ready = !configured || (status === 'signed-in' && authorized)

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'edit' ? t('form.editTitle') : t('form.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {configured && status !== 'signed-in' && (
            <p className="text-muted-foreground">{t('form.signInPrompt')}</p>
          )}
          {configured && status === 'signed-in' && !authorized && (
            <p className="text-destructive">{t('form.notAllowlisted')}</p>
          )}
          {ready && !loaded && <p className="text-muted-foreground">{t('form.loading')}</p>}
          {ready && loaded && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date">{t('form.date')}</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">{t('form.description')}</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('form.descriptionPlaceholder')}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('form.category')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('form.paidBy')}</Label>
              <Select value={payer} onValueChange={setPayer}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">{t('form.amount')}</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('form.splitPercent')}</Label>
              <div className="flex gap-3">
                {participants.map((p) => (
                  <div key={p.name} className="flex flex-1 items-center gap-2">
                    <span className="text-muted-foreground w-16 shrink-0 text-sm">{p.name}</span>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={splits[p.name] ?? 0}
                      onChange={(e) =>
                        setSplits((s) => ({ ...s, [p.name]: Number(e.target.value) }))
                      }
                    />
                  </div>
                ))}
              </div>
              {Math.round(splitTotal) !== 100 && (
                <p className="text-destructive text-sm">
                  {t('form.splitTotalWarning', { total: splitTotal })}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="recurring"
                checked={recurring}
                onCheckedChange={(checked) => setRecurring(checked === true)}
              />
              <Label htmlFor="recurring" className="font-normal">
                {t('form.recurring')}
              </Label>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" disabled={submitting}>
              {submitting ? t('form.saving') : t('form.save')}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
