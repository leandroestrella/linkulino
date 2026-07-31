import { useBusy } from './BusyProvider'
import { LoadingAvatar } from './LoadingAvatar'

/**
 * App-wide overlay shown while any write is in flight (see `BusyProvider`) —
 * adding/editing/deleting an expense, a trip, or a category. Sits above
 * dialogs and popovers (`z-[100]`) so a save triggered from inside one still
 * gets the same visible feedback, covering the whole viewport rather than a
 * small inline spinner.
 */
export function LoadingOverlay() {
  const { busy } = useBusy()
  if (!busy) return null
  return (
    <div className="bg-background/70 fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-xs">
      <LoadingAvatar />
    </div>
  )
}
