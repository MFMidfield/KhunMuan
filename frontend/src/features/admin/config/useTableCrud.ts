import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import type { Database } from '@/types/database'

type Tables = Database['public']['Tables']

/** The tables the back office edits directly, rather than through an RPC. */
export type ConfigTable =
  | 'sets'
  | 'fillings'
  | 'addons'
  | 'pickup_points'
  | 'pickup_slots'
  | 'delivery_zones'
  | 'admin_users'

/**
 * List / insert / update / delete for one configuration table.
 *
 * These go straight through PostgREST rather than through an RPC, and that is
 * safe for a specific reason: the write policies from migration 0009 are
 * superadmin-only, so the database refuses anything the screen should not have
 * offered. Nothing here carries an order's money or state — those still live
 * behind SECURITY DEFINER functions.
 *
 * The casts are contained here on purpose. supabase-js resolves `.from()`
 * against a literal table name; handing it a union widens every builder into an
 * unusable intersection, so the boundary is typed and the middle is not.
 */
export function useTableCrud<T extends ConfigTable>(
  table: T,
  orderBy: keyof Tables[T]['Row'] & string,
) {
  const key = ['config', table]

  const list = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Tables[T]['Row'][]> => {
      const { data, error } = await supabase
        .from(table as never)
        .select('*')
        .order(orderBy as never)
      if (error) throw error
      return data as unknown as Tables[T]['Row'][]
    },
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: key })
    // The customer app reads these same rows under its own keys.
    void queryClient.invalidateQueries({ queryKey: ['sets'] })
    void queryClient.invalidateQueries({ queryKey: ['fillings'] })
    void queryClient.invalidateQueries({ queryKey: ['addons'] })
    void queryClient.invalidateQueries({ queryKey: ['pickup-points'] })
    void queryClient.invalidateQueries({ queryKey: ['pickup-slots'] })
    void queryClient.invalidateQueries({ queryKey: ['delivery-zones'] })
  }

  const insert = useMutation({
    mutationFn: async (row: Tables[T]['Insert']) => {
      const { error } = await supabase.from(table as never).insert(row as never)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Tables[T]['Update'] }) => {
      const { error } = await supabase
        .from(table as never)
        .update(patch as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table as never).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { list, insert, update, remove }
}

/**
 * A foreign key from a historical order is the usual reason a delete fails, and
 * "23503" is not something to show a shop owner. Deactivating is what they
 * actually want in that case: the row has to keep existing for the order that
 * references it.
 */
export function crudError(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const err = error as { code?: string; message?: string } | null
  if (err?.code === '23503') return t('admin:cfg.inUse')
  return err?.message ?? t('admin:errors.unknown')
}
