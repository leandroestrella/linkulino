import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getExpenses, getParticipants, getTrips, updateRunwaySettings } from '@/api/client'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { InfoTooltip } from '@/components/InfoTooltip'
import { Label } from '@/components/ui/label'
import { useAdminAction } from '@/hooks/useAdminAction'
import { todayIso } from '@/lib/date'
import { expensesToCsv, type ExportableExpense } from '@/lib/csv'

/** Triggers a browser download of `content` as a file — the one DOM-touching step, kept out of the pure csv.ts builder. */
function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Self-service settings for the signed-in participant only — currently just
 * their private runway estimate (enable flag + savings amount). Never shows
 * or edits a partner's row; the backend enforces that server-side too (see
 * updateRunway_ in Code.js), this is just the matching UI.
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { status, authorized, canWrite, runwayEnabled, savings, refreshRunway } = useAuth()
  const [enabled, setEnabled] = useState(runwayEnabled)
  const [amount, setAmount] = useState(String(savings))
  const { run, busy, error, setError } = useAdminAction()
  const exportAction = useAdminAction()

  // Sync local form state once the provider's real values land — they start
  // at defaults before the initial `me` fetch resolves.
  useEffect(() => {
    setEnabled(runwayEnabled)
    setAmount(String(savings))
  }, [runwayEnabled, savings])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = Number(amount)
    if (!Number.isFinite(parsed)) return setError(t('settings.errorInvalidAmount'))
    await run(
      () => updateRunwaySettings({ enableRunway: enabled, savings: parsed }),
      async () => {
        await refreshRunway()
        navigate('/')
      },
    )
  }

  async function handleExport() {
    exportAction.setError(null)
    await exportAction.run(async () => {
      const [household, trips, participants] = await Promise.all([getExpenses(), getTrips(), getParticipants()])
      const tripExpenseLists = await Promise.all(trips.map((trip) => getExpenses(trip.id)))
      const all: ExportableExpense[] = [
        ...household.map((e) => ({ ...e, sheet: 'household' })),
        ...trips.flatMap((trip, i) => tripExpenseLists[i].map((e) => ({ ...e, sheet: trip.name }))),
      ]
      downloadFile(`linkulino-${todayIso()}.csv`, expensesToCsv(all, participants), 'text/csv;charset=utf-8;')
    })
  }

  const ready = canWrite

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!ready && status !== 'signed-in' && (
            <p className="text-muted-foreground">{t('form.signInPrompt')}</p>
          )}
          {!ready && status === 'signed-in' && !authorized && (
            <p className="text-destructive">{t('form.notAllowlisted')}</p>
          )}
          {ready && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="enableRunway"
                  checked={enabled}
                  onCheckedChange={(checked) => setEnabled(checked === true)}
                />
                <Label htmlFor="enableRunway">{t('settings.enableRunway')}</Label>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="savings" className="flex items-center gap-1">
                  {t('settings.savings')}
                  <InfoTooltip>{t('settings.savingsInfo')}</InfoTooltip>
                </Label>
                <Input
                  id="savings"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!enabled}
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? t('form.saving') : t('settings.save')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      {ready && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.exportTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">{t('settings.exportInfo')}</p>
            {exportAction.error && <p className="text-destructive text-sm">{exportAction.error}</p>}
            <Button type="button" variant="outline" disabled={exportAction.busy} onClick={() => void handleExport()}>
              {exportAction.busy ? t('form.saving') : t('settings.exportCsv')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
