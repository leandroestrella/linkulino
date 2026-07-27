import { useParams } from 'react-router-dom'
import { ExpenseDashboard } from '@/components/ExpenseDashboard'

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>()
  if (!tripId) return null

  return (
    <ExpenseDashboard
      sheetId={tripId}
      title={tripId}
      addHref={`/trips/${tripId}/add`}
      editBase={`/trips/${tripId}/expense`}
    />
  )
}
