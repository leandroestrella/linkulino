const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' })

export function formatAmount(amount: number): string {
  return currency.format(amount)
}

// `timeZoneName` can't be combined with dateStyle/timeStyle (they're mutually
// exclusive per the Intl.DateTimeFormat spec) — so the medium/short look is
// rebuilt from individual components instead.
const dateTime = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

/** Formats an ISO timestamp (e.g. a history entry's UTC `timestamp`) in the viewer's own locale/timezone. */
export function formatDateTime(isoTimestamp: string): string {
  return dateTime.format(new Date(isoTimestamp))
}
