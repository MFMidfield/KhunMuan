import { useEffect, useState } from 'react'

/**
 * A clock that ticks, so components can render time-dependent things without
 * reading `Date.now()` during render.
 *
 * That distinction is not pedantry here: an order card decides whether a claim
 * has gone stale, and a card that reads the wall clock mid-render produces a
 * different tree on every render with no state change to explain it. React is
 * allowed to render twice and keep either result.
 *
 * 30 seconds is the coarsest tick that still moves a minute counter on time.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
