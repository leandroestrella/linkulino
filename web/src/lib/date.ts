/**
 * Formats a Date as local-timezone ISO `YYYY-MM-DD`. `Date#toISOString`
 * converts to UTC first, which silently rolls back to the previous day for
 * any timezone ahead of UTC during that offset window (e.g. right after
 * midnight in CEST) — always use this instead for "today"/calendar-date math.
 */
export function localIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's date as local-timezone ISO `YYYY-MM-DD`. */
export function todayIso(): string {
  return localIsoDate(new Date())
}
