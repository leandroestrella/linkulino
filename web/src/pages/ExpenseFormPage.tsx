import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PlusIcon } from 'lucide-react'
import {
  addCategory,
  addExpense,
  deleteExpense,
  getCategories,
  getExpenses,
  getParticipants,
  updateExpense,
} from '@/api/client'
import type { Category, Participant } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { LoadingAvatar } from '@/components/LoadingAvatar'
import { PersonIcon } from '@/components/PersonName'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { todayIso as today } from '@/lib/date'

/** Splits 100% evenly across participants, rounding the remainder onto the first one. */
function evenSplit(participants: Participant[]): Record<string, number> {
  if (participants.length === 0) return {}
  const share = Math.floor(100 / participants.length)
  const remainder = 100 - share * participants.length
  return Object.fromEntries(
    participants.map((p, i) => [p.name, i === 0 ? share + remainder : share]),
  )
}

/** 100% for one participant, 0 for everyone else. */
function soloSplit(participants: Participant[], name: string): Record<string, number> {
  return Object.fromEntries(participants.map((p) => [p.name, p.name === name ? 100 : 0]))
}

/**
 * Which preset chip (if any) the current split matches — 'even', a
 * participant's name (for their solo 100%), or 'custom' when it's neither,
 * so editing an existing expense opens straight into the right mode.
 */
function matchSplitMode(splits: Record<string, number>, participants: Participant[]): string {
  const isMatch = (preset: Record<string, number>) =>
    participants.every((p) => Math.round(splits[p.name] ?? 0) === Math.round(preset[p.name] ?? 0))
  if (isMatch(evenSplit(participants))) return 'even'
  for (const p of participants) {
    if (isMatch(soloSplit(participants, p.name))) return p.name
  }
  return 'custom'
}

export function ExpenseFormPage({ mode }: { mode: 'add' | 'edit' }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { status, authorized, canWrite } = useAuth()
  const { id, tripId } = useParams<{ id?: string; tripId?: string }>()

  const [participants, setParticipants] = useState<Participant[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [payer, setPayer] = useState('')
  const [amount, setAmount] = useState('')
  const [splits, setSplits] = useState<Record<string, number>>({})
  const [splitMode, setSplitMode] = useState('even')
  const [recurring, setRecurring] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryIcon, setNewCategoryIcon] = useState('')

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
        setSplitMode(matchSplitMode(existing.splits, p))
        setRecurring(existing.recurring)
      } else {
        setSplits(evenSplit(p))
        setSplitMode('even')
        setPayer(p[0]?.name ?? '')
        setCategory(c[0]?.name ?? '')
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

  /** With exactly two participants, editing one's share auto-balances the other to the complement. */
  function handleSplitChange(name: string, rawValue: string) {
    const value = Number(rawValue)
    setSplits((s) => {
      const other = participants.length === 2 ? participants.find((p) => p.name !== name) : undefined
      return other ? { ...s, [name]: value, [other.name]: 100 - value } : { ...s, [name]: value }
    })
  }

  async function handleDelete() {
    if (!id || !window.confirm(t('form.deleteConfirm'))) return
    setDeleting(true)
    try {
      await deleteExpense(id, tripId)
      navigate(tripId ? `/trips/${tripId}` : '/')
    } finally {
      setDeleting(false)
    }
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    const created = await addCategory({ name: newCategoryName.trim(), icon: newCategoryIcon.trim() })
    setCategories((c) => [...c, created])
    setCategory(created.name)
    setNewCategoryName('')
    setNewCategoryIcon('')
    setAddingCategory(false)
  }

  const ready = canWrite

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'edit' ? t('form.editTitle') : t('form.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!ready && status !== 'signed-in' && (
            <p className="text-muted-foreground">{t('form.signInPrompt')}</p>
          )}
          {!ready && status === 'signed-in' && !authorized && (
            <p className="text-destructive">{t('form.notAllowlisted')}</p>
          )}
          {ready && !loaded && <LoadingAvatar />}
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
              <div className="flex items-center justify-between">
                <Label>{t('form.category')}</Label>
                {canWrite && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label={t('form.newCategory')}
                        onClick={() => setAddingCategory((v) => !v)}
                      >
                        <PlusIcon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('form.newCategory')}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <Select key={categories.length} value={category} onValueChange={setCategory}>
                <SelectTrigger className="lowercase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.name} value={c.name} className="lowercase">
                      {c.icon} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addingCategory && (
                <div className="bg-muted flex items-center gap-2 rounded-md p-2">
                  <Input
                    value={newCategoryIcon}
                    onChange={(e) => setNewCategoryIcon(e.target.value)}
                    placeholder="🏷️"
                    className="w-14 text-center"
                    maxLength={2}
                  />
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder={t('form.newCategoryPlaceholder')}
                    className="flex-1"
                  />
                  <Button type="button" size="sm" onClick={() => void handleAddCategory()}>
                    {t('form.newCategoryAdd')}
                  </Button>
                </div>
              )}
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
                      <PersonIcon icon={p.icon} /> {p.name}
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
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={splitMode === 'even' ? 'default' : 'outline'}
                  onClick={() => {
                    setSplits(evenSplit(participants))
                    setSplitMode('even')
                  }}
                >
                  {t('form.splitEven')}
                </Button>
                {participants.map((p) => (
                  <Button
                    key={p.name}
                    type="button"
                    size="sm"
                    variant={splitMode === p.name ? 'default' : 'outline'}
                    onClick={() => {
                      setSplits(soloSplit(participants, p.name))
                      setSplitMode(p.name)
                    }}
                  >
                    {p.name} 100%
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant={splitMode === 'custom' ? 'default' : 'outline'}
                  onClick={() => setSplitMode('custom')}
                >
                  {t('form.splitCustom')}
                </Button>
              </div>
              {splitMode === 'custom' && (
                <div className="flex gap-3 pt-1">
                  {participants.map((p) => (
                    <div key={p.name} className="flex flex-1 items-center gap-2">
                      <span className="text-muted-foreground w-16 shrink-0 text-sm">{p.name}</span>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={splits[p.name] ?? 0}
                        onChange={(e) => handleSplitChange(p.name, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
              {Math.round(splitTotal) !== 100 && (
                <p className="text-destructive text-sm">
                  {t('form.splitTotalWarning', { total: splitTotal })}
                </p>
              )}
            </div>

            {/* Recurring only applies to the household budget — trips are time-boxed. */}
            {!tripId && (
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
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? t('form.saving') : t('form.save')}
              </Button>
              {mode === 'edit' && id && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? t('form.deleting') : t('form.delete')}
                </Button>
              )}
            </div>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
