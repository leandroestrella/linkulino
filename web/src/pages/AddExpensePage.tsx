import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addExpense, getCategories, getParticipants } from '@/api/client'
import type { Participant } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export function AddExpensePage() {
  const navigate = useNavigate()
  const { configured, status, authorized } = useAuth()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [categories, setCategories] = useState<string[]>([])

  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [payer, setPayer] = useState('')
  const [amount, setAmount] = useState('')
  const [splits, setSplits] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void Promise.all([getParticipants(), getCategories()]).then(([p, c]) => {
      setParticipants(p)
      setCategories(c)
      setSplits(evenSplit(p))
      setPayer(p[0]?.name ?? '')
      setCategory(c[0] ?? '')
      setLoaded(true)
    })
  }, [])

  const splitTotal = Object.values(splits).reduce((sum, v) => sum + v, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const parsedAmount = Number(amount)
    if (!description.trim()) return setError('description is required.')
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setError('enter a valid amount.')
    if (Math.round(splitTotal) !== 100) return setError('splits must add up to 100%.')

    setSubmitting(true)
    try {
      await addExpense({ date, description, category, payer, amount: parsedAmount, splits })
      navigate('/')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>add expense</CardTitle>
        </CardHeader>
        <CardContent>
          {configured && status !== 'signed-in' && (
            <p className="text-muted-foreground">sign in from the home page to add an expense.</p>
          )}
          {configured && status === 'signed-in' && !authorized && (
            <p className="text-destructive">your account isn't on the allowlist for this sheet.</p>
          )}
          {(!configured || (status === 'signed-in' && authorized)) && !loaded && (
            <p className="text-muted-foreground">loading…</p>
          )}
          {(!configured || (status === 'signed-in' && authorized)) && loaded && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date">date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="weekly groceries"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>category</Label>
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
              <Label>paid by</Label>
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
              <Label htmlFor="amount">amount</Label>
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
              <Label>split %</Label>
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
                <p className="text-destructive text-sm">splits currently add up to {splitTotal}%.</p>
              )}
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" disabled={submitting}>
              {submitting ? 'saving…' : 'save expense'}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
