import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getTrips } from '@/api/client'
import { tripStatus, type Trip } from '@/api/types'
import { ExpenseDashboard } from '@/components/ExpenseDashboard'
import { Card, CardContent } from '@/components/ui/card'

export function HomePage() {
  const { t } = useTranslation()
  const [trips, setTrips] = useState<Trip[]>([])

  useEffect(() => {
    void getTrips().then((allTrips) => {
      const relevant = allTrips
        .filter((trip) => tripStatus(trip) !== 'past')
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
      setTrips(relevant)
    })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      {trips.map((trip) => {
        const active = tripStatus(trip) === 'active'
        return (
          <Link key={trip.id} to={`/trips/${trip.id}`}>
            <Card className={active ? 'border-primary/40 hover:bg-accent transition-colors' : 'hover:bg-accent transition-colors'}>
              <CardContent className="flex items-center gap-3 py-3">
                <span className="text-2xl">{trip.emoji}</span>
                <div>
                  <p className="font-medium">{active ? t('trips.currentTrip') : t('trips.upcomingTrip')}</p>
                  <p className="text-muted-foreground text-sm">
                    {trip.name}
                    {!active && ` · ${trip.startDate} → ${trip.endDate}`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
      <ExpenseDashboard title={t('home.thisMonth')} addHref="/add" editBase="/expense" />
    </div>
  )
}
