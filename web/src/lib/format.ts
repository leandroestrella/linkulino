const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' })

export function formatAmount(amount: number): string {
  return currency.format(amount)
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Formats an ISO timestamp (e.g. a history entry's UTC `timestamp`) in the viewer's own locale/timezone. */
export function formatDateTime(isoTimestamp: string): string {
  return dateTime.format(new Date(isoTimestamp))
}
