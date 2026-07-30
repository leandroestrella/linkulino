import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BackLink } from '@/components/BackLink'
import { ExpenseDashboard } from '@/components/ExpenseDashboard'

export function TripDetailPage() {
  const { t } = useTranslation()
  const { tripId } = useParams<{ tripId: string }>()
  if (!tripId) return null

  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/trips">{t('nav.backToTrips')}</BackLink>
      <ExpenseDashboard
        sheetId={tripId}
        title={tripId}
        addHref={`/trips/${tripId}/add`}
        editBase={`/trips/${tripId}/expense`}
      />
    </div>
  )
}
