import { z } from 'zod'
import { STORAGE_KEYS, readLocal, writeLocal } from '@/lib/storage'

/**
 * "My orders" without an account: the codes this device has placed, plus the
 * client_token each one came back with. The token is what lets the ordering
 * device see its own name and phone and cancel while the window is open; a
 * different device typing the same code gets the reduced view.
 *
 * It lives only here. Clearing site data loses the list, which is why the code
 * is also shown large on the confirmation screen with a copy button.
 */
const entrySchema = z.object({
  code: z.string().min(3).max(12),
  client_token: z.uuid(),
  created_at: z.string(),
})

const listSchema = z.array(entrySchema)

export type MyOrderEntry = z.infer<typeof entrySchema>

const MAX_KEPT = 30

export function readMyOrders(): MyOrderEntry[] {
  return readLocal(STORAGE_KEYS.myOrders, listSchema, [])
}

export function rememberOrder(entry: MyOrderEntry): void {
  const existing = readMyOrders().filter((e) => e.code !== entry.code)
  writeLocal(STORAGE_KEYS.myOrders, [entry, ...existing].slice(0, MAX_KEPT))
}

export function tokenForCode(code: string): string | null {
  return readMyOrders().find((e) => e.code === code.toUpperCase())?.client_token ?? null
}
