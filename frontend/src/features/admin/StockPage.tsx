import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  /** Today this filling is not counted at all (0031). */
  unlimited: boolean
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
  const navigate = useNavigate()

  const { data, isPending, error } = useQuery({
    queryKey: ['stock-admin'],
    queryFn: async (): Promise<StockRow[]> => {
      const [fillings, stock] = await Promise.all([
        supabase.from('fillings').select('*').order('sort_order'),
        supabase
          .from('filling_stock_daily')
          .select('filling_id, qty_total, qty_remaining, unlimited'),
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
        // No row and no daily default is the original way of saying unlimited,
        // and it still means it. The column is the way to say it while a row
        // exists.
        unlimited:
          byId.get(f.id)?.unlimited ??
          (f.default_daily_qty === null),
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

      {data.length === 0 && (
        <Card className="flex flex-col items-start gap-3 p-5">
          <p className="text-ink-muted">{t('admin:stockEmpty')}</p>
          <Button onClick={() => void navigate('/admin/menu')}>
            {t('admin:goToMenu')}
          </Button>
        </Card>
      )}

      <ul className="flex flex-col gap-3 md:grid md:grid-cols-2 lg:grid-cols-3">
        {data.map((row) => (
          <li key={row.id}>
            {/* Keyed on the stored total, so another admin calling set_stock
                resets this field — their value is the newer one — while an
                ordinary sale, which only moves qty_remaining, does not disturb
                what someone is typing. */}
            <StockCard key={`${row.id}:${row.qty_total}:${row.unlimited}`} row={row} />
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

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['stock-admin'] })
    void queryClient.invalidateQueries({ queryKey: qk.stockToday })
  }

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
      refresh()
    },
  })

  const unlimit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_stock_unlimited', { p_filling_id: row.id })
      if (error) throw error
    },
    onSuccess: refresh,
  })

  const sold =
    row.qty_total !== null && row.qty_remaining !== null
      ? row.qty_total - row.qty_remaining
      : null
  const parsed = Number.parseInt(value, 10)
  // While unlimited, any valid number is a change even if it matches the stored
  // total — the stored total is not in force, and pressing this is what turns
  // counting back on.
  const dirty =
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    (row.unlimited || parsed !== row.qty_total)

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
              {row.unlimited
                ? t('admin:stockUnlimited')
                : (row.qty_remaining ?? t('admin:stockUnlimited'))}
            </span>
          </span>
          {/* Shown even while unlimited: what the morning sold is still what
              the morning sold, and it is what a number typed this afternoon
              gets subtracted from. */}
          {sold !== null && sold > 0 && (
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

        {/* Two changes in one tap, so the label says so underneath: today stops
            being counted, and the daily default is cleared so tomorrow's
            rollover does not put a ceiling back. Putting one back is a menu
            decision and lives on the menu screen. */}
        {row.unlimited ? (
          <p className="text-[0.8rem] text-ink-muted">{t('admin:stockIsUnlimited')}</p>
        ) : (
          <button
            type="button"
            disabled={unlimit.isPending}
            onClick={() => unlimit.mutate()}
            className="min-h-9 self-start px-1 text-[0.85rem] text-gold-ink hover:underline"
          >
            {t('admin:stockMakeUnlimited')}
          </button>
        )}

        {(save.error || unlimit.error) && (
          <p role="alert" className="text-[0.8rem] text-st-cancel-fg">
            {actionError(save.error ?? unlimit.error, t)}
          </p>
        )}
      </div>
    </Card>
  )
}
