import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getHistory, getParticipants } from '@/api/client'
import type { HistoryEntry, Participant } from '@/api/types'
import { LoadingAvatar } from '@/components/LoadingAvatar'
import { findParticipant, PersonName } from '@/components/PersonName'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'

/** `t('history.addExpense')`, `t('history.deleteTrip')`, etc. — one combined phrase per action+entity pair. */
function actionKey(entry: HistoryEntry): string {
  return `history.${entry.action}${entry.entity[0].toUpperCase()}${entry.entity.slice(1)}`
}

export function HistoryPage() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([getHistory(), getParticipants()]).then(([history, people]) => {
      setEntries(history)
      setParticipants(people)
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingAvatar />

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t('history.title')}</h2>

      {entries.length === 0 && <p className="text-muted-foreground">{t('history.empty')}</p>}

      <div className="flex flex-col gap-2">
        {entries.map((entry, i) => (
          // Timestamp isn't guaranteed unique (two writes in the same
          // millisecond), so pair it with the row index for a stable key.
          <Card key={`${entry.timestamp}-${i}`}>
            <CardContent className="flex flex-col gap-1 py-3">
              <p className="text-sm">
                <span className="font-medium">
                  <PersonName person={findParticipant(participants, entry.actor)} />
                </span>{' '}
                {t(actionKey(entry))}: <span className="lowercase">{entry.summary}</span>
              </p>
              {entry.changes && <p className="text-muted-foreground text-xs">{entry.changes}</p>}
              <p className="text-muted-foreground text-xs">{formatDateTime(entry.timestamp)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
