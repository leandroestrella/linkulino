import { useEffect, useState } from 'react'

/** Cycles "." → ".." → "..." → "." to signal work in progress. */
export function LoadingDots() {
  const [count, setCount] = useState(1)

  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), 400)
    return () => clearInterval(id)
  }, [])

  return <span aria-hidden>{'.'.repeat(count)}</span>
}
