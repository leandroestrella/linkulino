import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getHistory, getParticipants } from '@/api/client'
import type { HistoryEntry, Participant } from '@/api/types'
import { LoadingAvatar } from '@/components/LoadingAvatar'
import { findParticipant, PersonName } from '@/components/PersonName'
import { Card, CardContent } from '@/components/ui/card'
import { formatAmount, formatDateTime } from '@/lib/format'

/** `t('history.addExpense')`, `t('history.deleteTrip')`, etc. — one combined phrase per action+entity pair. */
function actionKey(entry: HistoryEntry): string {
  return `history.${entry.action}${entry.entity[0].toUpperCase()}${entry.entity.slice(1)}`
}

/**
 * Where this entry links back to, or `null` when there's nothing to link to
 * (deletes, and categories, which have no page of their own — see entityId's
 * doc comment in api/types.ts).
 */
function entryHref(entry: HistoryEntry): string | null {
  if (!entry.entityId) return null
  if (entry.entity === 'expense') {
    return entry.sheetId ? `/trips/${entry.sheetId}/expense/${entry.entityId}/edit` : `/expense/${entry.entityId}/edit`
  }
  if (entry.entity === 'trip') return `/trips/${entry.entityId}`
  return null
}

/** Category/amount/date, shown after an expense's label — expenses only. */
function entryDetail(entry: HistoryEntry): string | null {
  if (entry.entity !== 'expense') return null
  return `${entry.category} · ${formatAmount(entry.amount)} · ${entry.date}`
}

export function HistoryPage() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    void Promise.all([getHistory(), getParticipants()])
      .then(([history, people]) => {
        setEntries(history)
        setParticipants(people)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingAvatar />

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t('history.title')}</h2>

      {error && <p className="text-destructive">{t('history.loadError')}</p>}
      {!error && entries.length === 0 && <p className="text-muted-foreground">{t('history.empty')}</p>}

      <div className="flex flex-col gap-2">
        {entries.map((entry, i) => {
          const href = entryHref(entry)
          const detail = entryDetail(entry)
          const body = (
            <CardContent className="flex flex-col gap-1 py-3">
              <p className="text-sm">
                <span className="font-medium">
                  <PersonName person={findParticipant(participants, entry.actor)} />
                </span>{' '}
                {t(actionKey(entry))}: <span className="lowercase">{entry.label}</span>
                {detail && <span className="text-muted-foreground lowercase"> · {detail}</span>}
              </p>
              {entry.changes && <p className="text-muted-foreground text-xs">{entry.changes}</p>}
              <p className="text-muted-foreground text-xs">{formatDateTime(entry.timestamp)}</p>
            </CardContent>
          )
          return (
            // Timestamp isn't guaranteed unique (two writes in the same
            // millisecond), so pair it with the row index for a stable key.
            <Card key={`${entry.timestamp}-${i}`} className={href ? 'hover:bg-accent transition-colors' : undefined}>
              {href ? <Link to={href}>{body}</Link> : body}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
