import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { deleteTrip, getTrips, updateTrip } from '@/api/client'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function TripEditPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { configured, status, authorized } = useAuth()
  const { tripId } = useParams<{ tripId: string }>()

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void getTrips().then((trips) => {
      const existing = trips.find((trip) => trip.id === tripId)
      if (existing) {
        setName(existing.name)
        setEmoji(existing.emoji)
        setStartDate(existing.startDate)
        setEndDate(existing.endDate)
      }
      setLoaded(true)
    })
  }, [tripId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError(t('trips.errorNameRequired'))
    if (endDate < startDate) return setError(t('trips.errorDateRange'))
    if (!tripId) return

    setSubmitting(true)
    try {
      const updated = await updateTrip(tripId, {
        name: name.trim(),
        emoji: emoji.trim() || '🧳',
        startDate,
        endDate,
      })
      navigate(`/trips/${updated.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!tripId || !window.confirm(t('trips.deleteConfirm'))) return
    setDeleting(true)
    try {
      await deleteTrip(tripId)
      navigate('/')
    } finally {
      setDeleting(false)
    }
  }

  const ready = !configured || (status === 'signed-in' && authorized)

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{t('trips.edit')}</CardTitle>
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
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="emoji">{t('trips.emoji')}</Label>
                  <Input
                    id="emoji"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    className="w-16 text-center"
                    maxLength={2}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="name">{t('trips.name')}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('trips.namePlaceholder')}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="start">{t('trips.startDate')}</Label>
                  <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="end">{t('trips.endDate')}</Label>
                  <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? t('form.saving') : t('trips.save')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? t('form.deleting') : t('trips.delete')}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
