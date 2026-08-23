import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { STORAGE_KEYS, readLocal, writeLocal } from '@/lib/storage'

/**
 * The cart is the only substantial thing this app keeps on the device, and it
 * has to survive a reload mid-order. It is validated on every read, because a
 * shape written by an older deploy must degrade to an empty cart rather than
 * crashing the menu on first paint.
 *
 * It stores ids and quantities only — never prices. The server recomputes every
 * baht at placement, so a stale cart produces a stale *display*, which the
 * checkout total corrects, rather than a stale charge.
 */
const cartFillingSchema = z.object({
  filling_id: z.uuid(),
  qty: z.number().int().positive(),
})

const cartAddonSchema = z.object({
  addon_id: z.uuid(),
  qty: z.number().int().positive(),
})

const cartLineSchema = z.object({
  /** Local id, so two boxes of the same set stay distinguishable. */
  line_id: z.string().min(1),
  set_id: z.uuid(),
  quantity: z.number().int().positive(),
  fillings: z.array(cartFillingSchema).min(1),
  addons: z.array(cartAddonSchema),
  note: z.string().max(500).nullable(),
})

const cartSchema = z.array(cartLineSchema)

export type CartLine = z.infer<typeof cartLineSchema>
export type CartFilling = z.infer<typeof cartFillingSchema>
export type CartAddon = z.infer<typeof cartAddonSchema>

interface CartContextValue {
  lines: CartLine[]
  /** Total boxes, which is what the header badge counts. */
  boxCount: number
  add: (line: Omit<CartLine, 'line_id'>) => void
  replace: (lineId: string, line: Omit<CartLine, 'line_id'>) => void
  setQuantity: (lineId: string, quantity: number) => void
  remove: (lineId: string) => void
  clear: () => void
  find: (lineId: string) => CartLine | undefined
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() =>
    readLocal(STORAGE_KEYS.cart, cartSchema, []),
  )

  useEffect(() => {
    writeLocal(STORAGE_KEYS.cart, lines)
  }, [lines])

  const add = useCallback((line: Omit<CartLine, 'line_id'>) => {
    setLines((prev) => [...prev, { ...line, line_id: crypto.randomUUID() }])
  }, [])

  const replace = useCallback((lineId: string, line: Omit<CartLine, 'line_id'>) => {
    setLines((prev) =>
      prev.map((l) => (l.line_id === lineId ? { ...line, line_id: lineId } : l)),
    )
  }, [])

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    setLines((prev) =>
      quantity < 1
        ? prev.filter((l) => l.line_id !== lineId)
        : prev.map((l) => (l.line_id === lineId ? { ...l, quantity } : l)),
    )
  }, [])

  const remove = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.line_id !== lineId))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      boxCount: lines.reduce((n, l) => n + l.quantity, 0),
      add,
      replace,
      setQuantity,
      remove,
      clear,
      find: (lineId) => lines.find((l) => l.line_id === lineId),
    }),
    [lines, add, replace, setQuantity, remove, clear],
  )

  return <CartContext value={value}>{children}</CartContext>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
