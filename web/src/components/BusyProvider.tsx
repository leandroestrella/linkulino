import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface BusyContextValue {
  /** True while at least one write is in flight. */
  busy: boolean
  /** Call before starting a write; pair with a matching `end()`. */
  begin: () => void
  /** Call once the write settles (success or failure). */
  end: () => void
}

const BusyContext = createContext<BusyContextValue | null>(null)

/**
 * Tracks how many writes are in flight app-wide, driving a single loading
 * overlay (see `LoadingOverlay`) instead of each write control managing its
 * own visual feedback. A ref-counted counter rather than a plain boolean,
 * since a page can trigger more than one sequential write.
 */
export function BusyProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false)
  const count = useRef(0)

  const begin = useCallback(() => {
    count.current += 1
    setBusy(true)
  }, [])

  const end = useCallback(() => {
    count.current = Math.max(0, count.current - 1)
    if (count.current === 0) setBusy(false)
  }, [])

  return <BusyContext value={{ busy, begin, end }}>{children}</BusyContext>
}

/** The app-wide write-in-flight signal; see `BusyProvider`. */
export function useBusy(): BusyContextValue {
  const ctx = useContext(BusyContext)
  if (!ctx) throw new Error('useBusy must be used within a BusyProvider')
  return ctx
}
