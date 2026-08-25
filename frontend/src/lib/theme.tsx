/* eslint-disable react-refresh/only-export-components --
   The provider and its hook belong together: the theme context object is a
   private implementation detail and exporting it would invite reading the
   context directly, skipping the null check the hook exists to make. The cost
   is a full reload instead of hot-reload when editing this one file. */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { STORAGE_KEYS } from './storage'

/**
 * Two states, and **light is the default** — the device preference does not get
 * a vote any more.
 *
 * It used to: `system` was a third state that stamped nothing and left
 * prefers-color-scheme in charge. That made the shop's first impression depend
 * on a setting the shop cannot see, and half the phones on a campus sit in dark
 * mode from a system-wide schedule rather than a deliberate choice. The theme
 * is always stamped on the root element now, so nothing is left to the media
 * query, and someone who wants dark still has one tap to it — remembered.
 */
export type ThemeChoice = 'light' | 'dark'

interface ThemeContextValue {
  /** What is on screen. With no third state, this is the choice itself. */
  resolved: ThemeChoice
  setChoice: (next: ThemeChoice) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredChoice(): ThemeChoice {
  try {
    // Anything other than a stored 'dark' is light, including a blocked read
    // and a value written by an older deploy — 'system' used to be storable.
    return localStorage.getItem(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredChoice)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', choice)
    try {
      // Stored raw, not JSON-encoded: the pre-paint script in index.html
      // compares this value directly and must not have to parse anything.
      localStorage.setItem(STORAGE_KEYS.theme, choice)
    } catch {
      /* blocked storage: the choice simply does not survive a reload */
    }
  }, [choice])

  const setChoice = useCallback((next: ThemeChoice) => setChoiceState(next), [])
  const toggle = useCallback(
    () => setChoiceState((c) => (c === 'dark' ? 'light' : 'dark')),
    [],
  )

  return (
    <ThemeContext value={{ resolved: choice, setChoice, toggle }}>
      {children}
    </ThemeContext>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
