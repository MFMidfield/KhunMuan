import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Database } from '@/types/database'

type Tables = Database['public']['Tables']
export type SetRow = Tables['sets']['Row']
export type FillingRow = Tables['fillings']['Row']
export type AddonRow = Tables['addons']['Row']
export type PickupPointRow = Tables['pickup_points']['Row']
export type PickupSlotRow = Tables['pickup_slots']['Row']
export type DeliveryZoneRow = Tables['delivery_zones']['Row']

/**
 * The customer-facing reads. RLS already limits every one of these to
 * `is_active`, so the filters here are about ordering and payload size, not
 * about security.
 *
 * shop_settings is column-scoped for anon, which is why it names its columns
 * instead of selecting *.
 */
export function useShopSettings() {
  return useQuery({
    queryKey: qk.shopSettings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shop_settings')
        .select('is_open, closed_message, delivery_enabled')
        .eq('id', 1)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useSets() {
  return useQuery({
    queryKey: qk.sets,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sets')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export function useFillings() {
  return useQuery({
    queryKey: qk.fillings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fillings')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export function useAddons() {
  return useQuery({
    queryKey: qk.addons,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('addons')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

/**
 * Today's remaining quantities, as a map.
 *
 * A filling with no row is unlimited for today — that is the same rule
 * place_order applies, and the two must agree or the builder will happily let a
 * customer configure a box the server then rejects.
 */
export function useStockToday() {
  return useQuery({
    queryKey: qk.stockToday,
    // Stock moves whenever anyone orders. Short and refetched on focus, so a
    // customer who leaves the builder open through a rush sees reality.
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filling_stock_daily')
        .select('filling_id, qty_remaining')
      if (error) throw error
      return new Map(data.map((r) => [r.filling_id, r.qty_remaining]))
    },
  })
}

export function usePickupPoints() {
  return useQuery({
    queryKey: qk.pickupPoints,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickup_points')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export function usePickupSlots() {
  return useQuery({
    queryKey: qk.pickupSlots,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickup_slots')
        .select('*')
        .order('starts_at_local')
      if (error) throw error
      return data
    },
  })
}

export function useDeliveryZones() {
  return useQuery({
    queryKey: qk.deliveryZones,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_zones')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}
