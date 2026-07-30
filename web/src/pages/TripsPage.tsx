import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PencilIcon } from 'lucide-react'
import { createTrip, getExpenses, getParticipants, getTrips } from '@/api/client'
import type { Expense, Participant } from '@/api/types'
import { tripStatus, type Trip, type TripStatus } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { LoadingAvatar } from '@/components/LoadingAvatar'
import { useAdminSlotContainer, useSubHeaderContainer } from '@/components/subheader'
import { VacationsOverallCard } from '@/components/VacationsOverallCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { todayIso } from '@/lib/date'
import { vacationsSummary } from '@/lib/vacations'

export function TripsPage() {
  const { t } = useTranslation()
  const { canWrite } = useAuth()
  const subHeader = useSubHeaderContainer()
  const adminSlot = useAdminSlotContainer()

  const [trips, setTrips] = useState<Trip[]>([])
  const [vacations, setVacations] = useState<Expense[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🧳')
  const [startDate, setStartDate] = useState(todayIso())
  const [endDate, setEndDate] = useState(todayIso())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const [tripList, participantList] = await Promise.all([getTrips(), getParticipants()])
    const perTrip = await Promise.all(tripList.map((trip) => getExpenses(trip.id)))
    setTrips(tripList)
    setParticipants(participantList)
    setVacations(perTrip.flat())
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError(t('trips.errorNameRequired'))
    if (endDate < startDate) return setError(t('trips.errorDateRange'))

    setSubmitting(true)
    try {
      await createTrip({ name: name.trim(), emoji: emoji.trim() || '🧳', startDate, endDate })
      setName('')
      setShowForm(false)
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const groups: { key: TripStatus; label: string }[] = [
    { key: 'active', label: t('trips.active') },
    { key: 'upcoming', label: t('trips.upcoming') },
    { key: 'past', label: t('trips.past') },
  ]

  return (
    <div className="flex flex-col gap-6">
      {adminSlot &&
        canWrite &&
        createPortal(
          <Button size="sm" onClick={() => setShowForm((s) => !s)}>
            {t('trips.new')}
          </Button>,
          adminSlot,
        )}

      {subHeader &&
        !loading &&
        createPortal(
          <div className="mx-auto w-full max-w-2xl px-4 pb-3">
            <VacationsOverallCard summary={vacationsSummary(trips, vacations, participants.length)} />
          </div>,
          subHeader,
        )}

      <h2 className="text-xl font-semibold">{t('trips.title')}</h2>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
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
                {/* min-w-0 overrides the flex item's default min-width:auto, which
                    otherwise keeps it from shrinking below the native date
                    input's intrinsic width — without it, two side-by-side date
                    fields push the row wider than a mobile screen. */}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label htmlFor="start">{t('trips.startDate')}</Label>
                  <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label htmlFor="end">{t('trips.endDate')}</Label>
                  <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? t('form.saving') : t('trips.create')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {loading && <LoadingAvatar />}

      {!loading &&
        groups.map(({ key, label }) => {
          const inGroup = trips.filter((trip) => tripStatus(trip) === key)
          if (inGroup.length === 0) return null
          return (
            <section key={key} className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-sm font-medium">{label}</h3>
              {inGroup.map((trip) => (
                <Card key={trip.id} className="hover:bg-accent transition-colors">
                  <CardContent className="flex items-center gap-3 py-3">
                    <Link to={`/trips/${trip.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="text-2xl">{trip.emoji}</span>
                      <div className="min-w-0">
                        <p className="font-medium">{trip.name}</p>
                        <p className="text-muted-foreground text-sm">
                          {trip.startDate} → {trip.endDate}
                        </p>
                      </div>
                    </Link>
                    {canWrite && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button asChild variant="ghost" size="icon" aria-label={t('trips.edit')}>
                            <Link to={`/trips/${trip.id}/edit`}>
                              <PencilIcon className="size-4" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('trips.edit')}</TooltipContent>
                      </Tooltip>
                    )}
                  </CardContent>
                </Card>
              ))}
            </section>
          )
        })}

      {!loading && trips.length === 0 && <p className="text-muted-foreground">{t('trips.empty')}</p>}
    </div>
  )
}
