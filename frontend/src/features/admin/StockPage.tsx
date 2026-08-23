import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { qk, queryClient } from '@/lib/queryClient'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { MenuImage } from '@/components/ui/MenuImage'
import { actionError } from './useOrderActions'

interface StockRow {
  id: string
  name: string
  image_path: string
  is_active: boolean
  default_daily_qty: number | null
  qty_total: number | null
  qty_remaining: number | null
}

/**
 * Today's tray sizes. One filling per row on a phone, two on a tablet, a table
 * on a desktop — but the same control everywhere, because the person setting
 * these is usually standing up with one hand free.
 *
 * set_stock takes the *total*, not the remainder: what has already been sold
 * stays sold. Typing 40 into a filling that has sold 12 leaves 28 available,
 * not 40, which is the difference between restocking and silently re-selling
 * food that is already in boxes.
 */
export function StockPage() {
  const { t } = useTranslation(['admin', 'common'])

  const { data, isPending, error } = useQuery({
    queryKey: ['stock-admin'],
    queryFn: async (): Promise<StockRow[]> => {
      const [fillings, stock] = await Promise.all([
        supabase.from('fillings').select('*').order('sort_order'),
        supabase.from('filling_stock_daily').select('filling_id, qty_total, qty_remaining'),
      ])
      if (fillings.error) throw fillings.error
      if (stock.error) throw stock.error

      const byId = new Map(stock.data.map((s) => [s.filling_id, s]))
      return fillings.data.map((f) => ({
        id: f.id,
        name: f.name,
        image_path: f.image_path,
        is_active: f.is_active,
        default_daily_qty: f.default_daily_qty,
        qty_total: byId.get(f.id)?.qty_total ?? null,
        qty_remaining: byId.get(f.id)?.qty_remaining ?? null,
      }))
    },
  })

  if (isPending) return <PageSpinner />
  if (error) {
    return (
      <Card className="p-4">
        <p className="break-words text-st-cancel-fg">{error.message}</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t('admin:stockTitle')}</h1>

      <ul className="flex flex-col gap-3 md:grid md:grid-cols-2 lg:grid-cols-3">
        {data.map((row) => (
          <li key={row.id}>
            <StockCard row={row} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function StockCard({ row }: { row: StockRow }) {
  const { t } = useTranslation(['admin', 'common'])
  const [value, setValue] = useState(String(row.qty_total ?? ''))
  const [saved, setSaved] = useState(false)

  // A realtime stock change from someone else's sale must not fight what this
  // person is currently typing, so the field only re-syncs when it is untouched.
  useEffect(() => {
    setValue(String(row.qty_total ?? ''))
  }, [row.qty_total])

  const save = useMutation({
    mutationFn: async (qty: number) => {
      const { error } = await supabase.rpc('set_stock', {
        p_filling_id: row.id,
        p_qty_total: qty,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      void queryClient.invalidateQueries({ queryKey: ['stock-admin'] })
      void queryClient.invalidateQueries({ queryKey: qk.stockToday })
    },
  })

  const sold =
    row.qty_total !== null && row.qty_remaining !== null
      ? row.qty_total - row.qty_remaining
      : null
  const parsed = Number.parseInt(value, 10)
  const dirty = Number.isFinite(parsed) && parsed >= 0 && parsed !== row.qty_total

  return (
    <Card className={['flex gap-3 p-3', row.is_active ? '' : 'opacity-55'].join(' ')}>
      <div className="w-20 shrink-0">
        <MenuImage path={row.image_path} alt={row.name} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-medium break-words">{row.name}</p>

        <div className="flex flex-wrap gap-x-3 text-[0.85rem] text-ink-muted">
          <span>
            {t('admin:stockLeft')}{' '}
            <span className="tnum font-medium text-ink">
              {row.qty_remaining ?? t('admin:stockUnlimited')}
            </span>
          </span>
          {sold !== null && (
            <span>
              {t('admin:stockSold')} <span className="tnum">{sold}</span>
            </span>
          )}
        </div>

        <div className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[0.8rem] text-ink-muted">{t('admin:stockTotal')}</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="tnum min-h-11 w-full rounded-btn border border-border-strong bg-surface px-3"
            />
          </label>

          <Button
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate(parsed)}
          >
            {saved ? t('admin:stockSaved') : t('admin:stockSet')}
          </Button>
        </div>

        {save.error && (
          <p role="alert" className="text-[0.8rem] text-st-cancel-fg">
            {actionError(save.error, t)}
          </p>
        )}
      </div>
    </Card>
  )
}
