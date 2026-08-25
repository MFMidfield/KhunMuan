import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Database } from '@/types/database'

export type AdminUser = Database['public']['Tables']['admin_users']['Row']

/**
 * The signed-in staff member, or null.
 *
 * Google OAuth succeeds for any Google account, so a session proves identity
 * and nothing else. Authorisation is this row — and the query cannot lie about
 * it, because RLS returns nothing at all to a caller who is not on the
 * allow-list. The guard built on top of this is convenience; the database is
 * the boundary (doc 05).
 */
export function useCurrentAdmin(email: string | undefined) {
  return useQuery({
    queryKey: [...qk.currentAdmin, email ?? 'anon'],
    enabled: Boolean(email),
    staleTime: 60_000,
    queryFn: async (): Promise<AdminUser | null> => {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email!)
        .maybeSingle()

      if (error) throw error
      return data
    },
  })
}
