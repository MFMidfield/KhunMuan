import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Database } from '@/types/database'

type OrderStatus = Database['public']['Enums']['order_status']
type BoardOrder = {
  id: string
  code: string
  status: OrderStatus
  total: number
  created_at: string
  claimed_by: string | null
}

const COLUMNS: OrderStatus[] = ['pending_confirmation', 'accepted', 'cooking', 'ready']

/** Tablet shows two columns at a time; these are the pairs it swaps between. */
const PAIRS: [OrderStatus, OrderStatus][] = [
  ['pending_confirmation', 'accepted'],
  ['cooking', 'ready'],
]

/**
 * One query, three presentations — the split doc 04 §3 asks for, extended to
 * the tablet the original text never covered.
 *
 *   phone   one list, sticky status filter chips. Six staff on phones need one
 *           column and big tap targets, not four squeezed ones.
 *   tablet  two Kanban columns, chips swap which pair is on screen.
 *   desktop all four columns.
 */
export function BoardPage() {
  const { t } = useTranslation('admin')
  const breakpoint = useBreakpoint()

  const { data, isPending, error } = useQuery({
    queryKey: qk.orders('active'),
    queryFn: async (): Promise<BoardOrder[]> => {
      const { data: rows, error: queryError } = await supabase
        .from('orders')
        .select('id, code, status, total, created_at, claimed_by')
        .in('status', COLUMNS)
        .order('created_at', { ascending: true })

      if (queryError) throw queryError
      return rows
    },
  })

  if (isPending) return <PageSpinner />
  if (error) {
    return (
      <Card className="p-4 text-st-cancel-fg">
        <p className="break-words">{error.message}</p>
      </Card>
    )
  }

  if (breakpoint === 'phone') return <PhoneList orders={data} emptyLabel={t('boardEmpty')} />
  if (breakpoint === 'tablet') return <TabletBoard orders={data} emptyLabel={t('boardEmpty')} />
  return <DesktopBoard orders={data} emptyLabel={t('boardEmpty')} />
}

/* ---------------------------------------------------------------- phone -- */

function PhoneList({ orders, emptyLabel }: { orders: BoardOrder[]; emptyLabel: string }) {
  const { t } = useTranslation('admin')
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  return (
    <div className="flex flex-col gap-3">
      {/* Sticky under the header, so the filter is reachable however far the
          list has been scrolled. */}
      <div className="scroll-strip sticky top-14 z-20 -mx-3 flex gap-2 bg-ground px-3 py-2">
        <FilterChip
          label={t('filterAll')}
          count={orders.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {COLUMNS.map((status) => (
          <FilterChip
            key={status}
            status={status}
            count={orders.filter((o) => o.status === status).length}
            active={filter === status}
            onClick={() => setFilter(status)}
          />
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyCard label={emptyLabel} />
      ) : (
        shown.map((order) => <OrderCard key={order.id} order={order} showStatus />)
      )}
    </div>
  )
}

/* --------------------------------------------------------------- tablet -- */

function TabletBoard({ orders, emptyLabel }: { orders: BoardOrder[]; emptyLabel: string }) {
  const { t } = useTranslation('admin')
  const { t: tStatus } = useTranslation('tracking')
  const [pair, setPair] = useState(0)
  const columns = PAIRS[pair] ?? PAIRS[0]!

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label={t('columnPair')}
        className="sticky top-14 z-20 -mx-4 flex gap-2 bg-ground px-4 py-2"
      >
        {PAIRS.map((p, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={pair === i}
            onClick={() => setPair(i)}
            className={[
              'min-h-11 flex-1 rounded-btn border px-3 text-[0.9rem]',
              pair === i
                ? 'border-ink bg-surface-2 font-medium text-ink'
                : 'border-border bg-surface text-ink-muted',
            ].join(' ')}
          >
            {p.map((s) => tStatus(`status.${s}`)).join(' · ')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {columns.map((status) => (
          <Column
            key={status}
            status={status}
            orders={orders.filter((o) => o.status === status)}
            emptyLabel={emptyLabel}
          />
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- desktop -- */

function DesktopBoard({ orders, emptyLabel }: { orders: BoardOrder[]; emptyLabel: string }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {COLUMNS.map((status) => (
        <Column
          key={status}
          status={status}
          orders={orders.filter((o) => o.status === status)}
          emptyLabel={emptyLabel}
        />
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- parts -- */

function Column({
  status,
  orders,
  emptyLabel,
}: {
  status: OrderStatus
  orders: BoardOrder[]
  emptyLabel: string
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        <span className="tnum text-[0.85rem] text-ink-muted">{orders.length}</span>
      </div>

      {orders.length === 0 ? (
        <EmptyCard label={emptyLabel} />
      ) : (
        orders.map((order) => <OrderCard key={order.id} order={order} />)
      )}
    </section>
  )
}

function OrderCard({ order, showStatus = false }: { order: BoardOrder; showStatus?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="tnum text-xl font-semibold tracking-wide">{order.code}</span>
        {showStatus && <StatusBadge status={order.status} />}
      </div>
    </Card>
  )
}

function EmptyCard({ label }: { label: string }) {
  return <Card className="p-4 text-[0.9rem] text-ink-muted">{label}</Card>
}

function FilterChip({
  status,
  label,
  count,
  active,
  onClick,
}: {
  status?: OrderStatus
  label?: string
  count: number
  active: boolean
  onClick: () => void
}) {
  const { t } = useTranslation('tracking')
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'snap-item inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4',
        'text-[0.9rem] whitespace-nowrap',
        active
          ? 'border-ink bg-surface-2 font-medium text-ink'
          : 'border-border bg-surface text-ink-muted',
      ].join(' ')}
    >
      {status ? t(`status.${status}`) : label}
      <span className="tnum text-[0.8rem]">{count}</span>
    </button>
  )
}
