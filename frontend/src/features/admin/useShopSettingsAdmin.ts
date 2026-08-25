import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * The full settings row, staff-side.
 *
 * Separate from the customer's `useShopSettings` on purpose: anon holds a
 * column-level grant covering four columns, so the customer query names them
 * and cannot select more. Staff have the whole row.
 */
export function useShopSettingsAdmin() {
  return useQuery({
    queryKey: ['shop-settings', 'admin'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('id', 1)
        .single()
      if (error) throw error
      return data
    },
  })
}
