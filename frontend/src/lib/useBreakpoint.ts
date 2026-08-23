import { useEffect, useState } from 'react'

/**
 * Breakpoints are authored mobile-first everywhere in CSS. This hook exists for
 * the one case CSS cannot cover: when the two layouts are different *DOM*, not
 * different styling — the order board is a list on a phone and a Kanban on a
 * tablet, and rendering both and hiding one would double the realtime
 * subscribers and the card count.
 *
 * Anything that is merely a different arrangement of the same elements must use
 * Tailwind's `md:` / `lg:` prefixes instead of this.
 */
export type Breakpoint = 'phone' | 'tablet' | 'desktop'

const TABLET = '(min-width: 768px)'
const DESKTOP = '(min-width: 1024px)'

function current(): Breakpoint {
  if (typeof window === 'undefined') return 'phone'
  if (window.matchMedia(DESKTOP).matches) return 'desktop'
  if (window.matchMedia(TABLET).matches) return 'tablet'
  return 'phone'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(current)

  useEffect(() => {
    const queries = [window.matchMedia(TABLET), window.matchMedia(DESKTOP)]
    const onChange = () => setBp(current())
    queries.forEach((q) => q.addEventListener('change', onChange))
    // A rotation can land between the two listeners firing; re-read once.
    onChange()
    return () => queries.forEach((q) => q.removeEventListener('change', onChange))
  }, [])

  return bp
}
