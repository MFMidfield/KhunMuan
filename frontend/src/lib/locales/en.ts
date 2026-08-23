import type { th } from './th'

/**
 * Stub. The English pass is Phase 5 — this exists so the plumbing is exercised
 * from day one rather than retrofitted, and so a missing key is a type error
 * instead of a surprise at runtime.
 *
 * DeepPartial: every namespace may be filled in independently, and anything
 * absent falls back to Thai.
 */
type Translations<T> = {
  // Leaves widen to string: `th` is `as const`, so without this every English
  // value would have to equal the Thai literal it replaces.
  [K in keyof T]?: T[K] extends string ? string : Translations<T[K]>
}

export const en: Translations<typeof th> = {
  common: {
    appName: 'Khun Muan',
    loading: 'Loading…',
    retry: 'Try again',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    back: 'Back',
    close: 'Close',
    baht: '฿',
  },
}
