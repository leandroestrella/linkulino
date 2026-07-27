import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getTrips } from '@/api/client'
import { tripStatus, type Trip } from '@/api/types'
import { ExpenseDashboard } from '@/components/ExpenseDashboard'
import { Card, CardContent } from '@/components/ui/card'

export function HomePage() {
  const { t } = useTranslation()
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)

  useEffect(() => {
    void getTrips().then((trips) => {
      setActiveTrip(trips.find((trip) => tripStatus(trip) === 'active') ?? null)
    })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      {activeTrip && (
        <Link to={`/trips/${activeTrip.id}`}>
          <Card className="border-primary/40 hover:bg-accent transition-colors">
            <CardContent className="flex items-center gap-3 py-3">
              <span className="text-2xl">{activeTrip.emoji}</span>
              <div>
                <p className="font-medium">{t('trips.currentTrip')}</p>
                <p className="text-muted-foreground text-sm">{activeTrip.name}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}
      <ExpenseDashboard title={t('home.thisMonth')} addHref="/add" editBase="/expense" />
    </div>
  )
}
