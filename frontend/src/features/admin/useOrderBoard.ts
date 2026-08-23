import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk, queryClient } from '@/lib/queryClient'
import type { Database } from '@/types/database'

type OrderStatus = Database['public']['Enums']['order_status']

export const ACTIVE_STATUSES: OrderStatus[] = [
  'pending_confirmation',
  'accepted',
  'cooking',
  'ready',
]

export interface BoardOrder {
  id: string
  code: string
  status: OrderStatus
  total: number
  created_at: string
  version: number
  source: Database['public']['Enums']['order_source']
  note: string | null
  fulfillment: Database['public']['Enums']['fulfillment_type']
  delivery_location: string | null
  customer_name: string | null
  customer_phone: string | null
  claimed_by: string | null
  claimed_at: string | null
  claimed_by_name: string | null
  point_name: string | null
  slot_label: string | null
  zone_name: string | null
  payment_method: Database['public']['Enums']['payment_method'] | null
  payment_state: Database['public']['Enums']['payment_state'] | null
  slip_path: string | null
  items: {
    id: string
    set_name: string
    quantity: number
    note: string | null
    fillings: { filling_name: string; qty: number }[]
    addons: { addon_name: string; qty: number }[]
  }[]
}

const SELECT = `
  id, code, status, total, created_at, version, source, note, fulfillment,
  delivery_location, customer_name, customer_phone, claimed_by, claimed_at,
  claimed:admin_users!orders_claimed_by_fkey ( display_name ),
  point:pickup_points ( name ),
  slot:pickup_slots ( label ),
  zone:delivery_zones ( name ),
  payments ( method, state, slip_path ),
  order_items (
    id, set_name, quantity, note, sort_order,
    order_item_fillings ( filling_name, qty ),
    order_item_addons ( addon_name, qty )
  )
`

/**
 * One hook, three presentations (doc 04 §3).
 *
 * Realtime patches the cache rather than triggering a refetch: the board is
 * open for a whole shift, and refetching the world on every insert would make
 * it flicker exactly when the kitchen is busiest. A reconnect *does* refetch,
 * because that is the moment the cache might be wrong.
 */
export function useOrderBoard() {
  const [connected, setConnected] = useState(false)
  /** Orders that have arrived but nobody has looked at or claimed yet. */
  const [unseen, setUnseen] = useState<Set<string>>(new Set())
  const firstLoad = useRef(true)

  const query = useQuery({
    queryKey: qk.orders('active'),
    queryFn: async (): Promise<BoardOrder[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(SELECT)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data as unknown as RawOrder[]).map(normalise)
    },
  })

  useEffect(() => {
    const channel = supabase
      .channel('board')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            const row = payload.new as { id: string }
            setUnseen((prev) => new Set(prev).add(row.id))
          }
          // The payload carries the flat row, not the joined shape the board
          // renders, so an invalidate is the honest move here. It is cheap: the
          // active-status query is a handful of rows behind a partial index.
          void queryClient.invalidateQueries({ queryKey: qk.orders('active') })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => void queryClient.invalidateQueries({ queryKey: qk.orders('active') }),
      )
      .subscribe((status) => {
        const live = status === 'SUBSCRIBED'
        setConnected(live)
        // Campus wifi drops mid-shift. Reconciling on reconnect is the only
        // thing standing between a stale board and someone cooking a cancelled
        // order.
        if (live && !firstLoad.current) {
          void queryClient.invalidateQueries({ queryKey: qk.orders('active') })
        }
        firstLoad.current = false
      })

    return () => void supabase.removeChannel(channel)
  }, [])

  return {
    orders: query.data ?? [],
    isPending: query.isPending,
    error: query.error,
    connected,
    unseen,
    markSeen: (id: string) =>
      setUnseen((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      }),
  }
}

interface RawOrder {
  id: string
  code: string
  status: OrderStatus
  total: number
  created_at: string
  version: number
  source: Database['public']['Enums']['order_source']
  note: string | null
  fulfillment: Database['public']['Enums']['fulfillment_type']
  delivery_location: string | null
  customer_name: string | null
  customer_phone: string | null
  claimed_by: string | null
  claimed_at: string | null
  claimed: { display_name: string } | null
  point: { name: string } | null
  slot: { label: string } | null
  zone: { name: string } | null
  payments: {
    method: Database['public']['Enums']['payment_method']
    state: Database['public']['Enums']['payment_state']
    slip_path: string | null
  } | null
  order_items: {
    id: string
    set_name: string
    quantity: number
    note: string | null
    sort_order: number
    order_item_fillings: { filling_name: string; qty: number }[]
    order_item_addons: { addon_name: string; qty: number }[]
  }[]
}

function normalise(row: RawOrder): BoardOrder {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    total: row.total,
    created_at: row.created_at,
    version: row.version,
    source: row.source,
    note: row.note,
    fulfillment: row.fulfillment,
    delivery_location: row.delivery_location,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    claimed_by: row.claimed_by,
    claimed_at: row.claimed_at,
    claimed_by_name: row.claimed?.display_name ?? null,
    point_name: row.point?.name ?? null,
    slot_label: row.slot?.label ?? null,
    zone_name: row.zone?.name ?? null,
    payment_method: row.payments?.method ?? null,
    payment_state: row.payments?.state ?? null,
    slip_path: row.payments?.slip_path ?? null,
    items: [...row.order_items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        id: i.id,
        set_name: i.set_name,
        quantity: i.quantity,
        note: i.note,
        fillings: i.order_item_fillings,
        addons: i.order_item_addons,
      })),
  }
}
