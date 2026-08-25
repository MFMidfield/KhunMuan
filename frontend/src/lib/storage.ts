import type { z } from 'zod'

/**
 * Every localStorage read is wrapped and validated. A private window, a cleared
 * cache, or a shape written by an older deploy must degrade to the fallback —
 * never to a crash on first paint.
 */
export function readLocal<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    const result = schema.safeParse(parsed)
    return result.success ? result.data : fallback
  } catch {
    return fallback
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked. The feature degrades; the app does not break.
  }
}

export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing to do */
  }
}

export const STORAGE_KEYS = {
  theme: 'khunmuan.theme',
  cart: 'khunmuan.cart',
  myOrders: 'khunmuan.myOrders',
  soundConsent: 'khunmuan.soundConsent',
  boardLayout: 'khunmuan.boardLayout',
} as const
