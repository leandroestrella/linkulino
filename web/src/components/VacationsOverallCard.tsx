import { useTranslation } from 'react-i18next'
import { InfoTooltip } from '@/components/InfoTooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { VacationsSummary } from '@/lib/vacations'
import { formatAmount } from '@/lib/format'

/** Total/per-vacation/per-day spend across every trip — shared by the Overview and Trips pages. */
export function VacationsOverallCard({ summary }: { summary: VacationsSummary }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('overview.vacationsOverall')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm">{t('home.total')}</p>
            <p className="text-xl font-medium">
              {formatAmount(summary.total)}
              {summary.tripCount > 0 && (
                <span className="text-muted-foreground text-sm font-normal"> · {t('overview.tripCount', { count: summary.tripCount })}</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-muted-foreground text-sm">
              {t('overview.perVacation')}
              <InfoTooltip>{t('overview.perVacationInfo')}</InfoTooltip>
            </p>
            <p className="text-xl font-medium">
              {summary.perVacation !== null ? formatAmount(summary.perVacation) : '—'}
              {summary.avgTripDays !== null && (
                <span className="text-muted-foreground text-sm font-normal"> · {t('overview.avgTripDays', { count: summary.avgTripDays })}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="flex items-center gap-1 text-muted-foreground text-sm">
              {t('overview.perDay')}
              <InfoTooltip>{t('overview.perDayInfo')}</InfoTooltip>
            </p>
            <p className="text-xl font-medium">
              {summary.perDay !== null ? formatAmount(summary.perDay) : '—'}
              {summary.totalDays > 0 && (
                <span className="text-muted-foreground text-sm font-normal"> · {t('overview.dayCount', { count: summary.totalDays })}</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-muted-foreground text-sm">
              {t('overview.perPersonPerDay')}
              <InfoTooltip>{t('overview.perPersonPerDayInfo')}</InfoTooltip>
            </p>
            <p className="text-xl font-medium">
              {summary.perPersonPerDay !== null ? formatAmount(summary.perPersonPerDay) : '—'}
              {summary.participantCount > 0 && (
                <span className="text-muted-foreground text-sm font-normal"> · {t('overview.personCount', { count: summary.participantCount })}</span>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
