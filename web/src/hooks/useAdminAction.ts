import { useState } from 'react'
import { useBusy } from '@/components/BusyProvider'

/**
 * The shared "run a write" pattern duplicated across every admin control
 * (save/delete an expense or trip, add a category): local busy/error state
 * for the triggering control (e.g. to disable its own buttons), and the
 * app-wide busy signal that drives `LoadingOverlay`.
 */
export function useAdminAction() {
  const globalBusy = useBusy()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run<T>(fn: () => Promise<T>, after?: (result: T) => void | Promise<void>): Promise<boolean> {
    setBusy(true)
    setError(null)
    globalBusy.begin()
    try {
      const result = await fn()
      await after?.(result)
      return true
    } catch (e) {
      setError(String(e))
      return false
    } finally {
      setBusy(false)
      globalBusy.end()
    }
  }

  return { run, busy, error, setError }
}
