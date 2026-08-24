import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk, queryClient } from '@/lib/queryClient'
import type { Database } from '@/types/database'

type OrderStatus = Database['public']['Enums']['order_status']

export interface AdvanceArgs {
  orderId: string
  to: OrderStatus
  expectedVersion: number
  reasonId?: string
  note?: string
  code?: string
  overridePayment?: boolean
}

/**
 * Every mutation invalidates the board rather than patching it optimistically.
 *
 * Optimistic updates are the wrong trade here: six people are looking at the
 * same row, and showing one of them a state the server rejected — because
 * someone else moved it half a second earlier — is exactly the confusion
 * expected_version exists to prevent. A refetch of a handful of rows costs less
 * than one wrongly-cooked order.
 */
function refreshBoard() {
  void queryClient.invalidateQueries({ queryKey: qk.orders('active') })
}

/**
 * No `useClaim`. Claiming is not a thing the board asks for on its own any
 * more: `advance_order` claims on the way into `accepted`, and again on the way
 * into `cooking` for an order that was released. `claim_order` still exists in
 * the database — see migration 0027.
 */
export function useRelease() {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('release_order', { p_order_id: orderId })
      if (error) throw error
    },
    onSettled: refreshBoard,
  })
}

export function useAdvance() {
  return useMutation({
    mutationFn: async (args: AdvanceArgs) => {
      const { data, error } = await supabase.rpc('advance_order', {
        p_order_id: args.orderId,
        p_to_status: args.to,
        p_expected_version: args.expectedVersion,
        ...(args.reasonId ? { p_reason_id: args.reasonId } : {}),
        ...(args.note ? { p_note: args.note } : {}),
        ...(args.code ? { p_code: args.code } : {}),
        ...(args.overridePayment ? { p_override_payment: true } : {}),
      })
      if (error) throw error
      return data
    },
    onSettled: refreshBoard,
  })
}

/**
 * Marks the transfer paid and accepts the order, in one call.
 *
 * One RPC rather than set_payment followed by advance_order: the half-done
 * state — paid, still pending_confirmation — is the one that looks like a
 * customer who paid and was ignored. Migration 0029 keeps both inside a single
 * transaction.
 */
export function useConfirmPaymentAndAccept() {
  return useMutation({
    mutationFn: async (args: { orderId: string; expectedVersion: number }) => {
      const { error } = await supabase.rpc('confirm_payment_and_accept', {
        p_order_id: args.orderId,
        p_expected_version: args.expectedVersion,
      })
      if (error) throw error
    },
    onSettled: refreshBoard,
  })
}

export function useSetPayment() {
  return useMutation({
    mutationFn: async (args: {
      orderId: string
      state: Database['public']['Enums']['payment_state']
      note?: string
    }) => {
      const { error } = await supabase.rpc('set_payment', {
        p_order_id: args.orderId,
        p_state: args.state,
        ...(args.note ? { p_note: args.note } : {}),
      })
      if (error) throw error
    },
    onSettled: refreshBoard,
  })
}

/** Maps a machine code from the RPC onto a Thai sentence staff can act on. */
export function actionError(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const err = error as { message?: string; details?: string } | null
  const code = err?.message ?? ''
  const message = t(`admin:errors.${code}`, { detail: err?.details ?? '' })
  return message.startsWith('admin:errors.') ? t('admin:errors.unknown') : message
}
