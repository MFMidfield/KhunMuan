import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { STORAGE_KEYS, removeLocal } from './storage'

/**
 * Three states, not two. `system` is the default and stamps nothing on the root
 * element, which leaves prefers-color-scheme in charge — that is what "first
 * load follows the device" means. An explicit choice stamps data-theme and wins
 * in both directions.
 */
export type ThemeChoice = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  choice: ThemeChoice
  /** What is actually on screen right now, device preference resolved. */
  resolved: 'light' | 'dark'
  setChoice: (next: ThemeChoice) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.theme)
    return raw === 'light' || raw === 'dark' ? raw : 'system'
  } catch {
    return 'system'
  }
}

function devicePrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredChoice)
  const [systemDark, setSystemDark] = useState(devicePrefersDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (choice === 'system') {
      root.removeAttribute('data-theme')
      removeLocal(STORAGE_KEYS.theme)
    } else {
      root.setAttribute('data-theme', choice)
      try {
        // Stored raw, not JSON-encoded: the pre-paint script in index.html
        // compares this value directly and must not have to parse anything.
        localStorage.setItem(STORAGE_KEYS.theme, choice)
      } catch {
        /* blocked storage: the choice simply does not survive a reload */
      }
    }
  }, [choice])

  const resolved: 'light' | 'dark' =
    choice === 'system' ? (systemDark ? 'dark' : 'light') : choice

  const setChoice = useCallback((next: ThemeChoice) => setChoiceState(next), [])
  const toggle = useCallback(
    () => setChoiceState(resolved === 'dark' ? 'light' : 'dark'),
    [resolved],
  )

  return (
    <ThemeContext value={{ choice, resolved, setChoice, toggle }}>
      {children}
    </ThemeContext>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
