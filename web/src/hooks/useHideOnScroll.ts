import { useEffect, useState } from 'react'

/**
 * True while the user is scrolling *down* past `threshold` — used to slide the
 * sticky header/footer out of the way. Scrolling up (or returning near the top)
 * brings them back.
 */
export function useHideOnScroll(threshold = 90): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let last = window.scrollY
    let frame = 0

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        // Always reveal near the top of the page.
        if (y < threshold) {
          setHidden(false)
          last = y
          return
        }
        const delta = y - last
        // Ignore jitter and iOS rubber-banding.
        if (Math.abs(delta) < 8) return
        setHidden(delta > 0)
        last = y
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [threshold])

  return hidden
}
