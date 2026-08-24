import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { STORAGE_KEYS, readLocal, writeLocal } from '@/lib/storage'
import { z } from 'zod'
import { useSession } from '@/features/auth/useSession'
import { useCurrentAdmin } from '@/features/auth/useCurrentAdmin'
import { useShopSettingsAdmin } from './useShopSettingsAdmin'
import { ACTIVE_STATUSES, useOrderBoard } from './useOrderBoard'
import { OrderCard } from './OrderCard'
import type { BoardOrder } from './useOrderBoard'
import type { Database } from '@/types/database'

type OrderStatus = Database['public']['Enums']['order_status']

/**
 * One filtered list, at every width.
 *
 * This replaced the Kanban columns. Four columns fit on a desktop and nowhere
 * else, so the board used to be three different DOM trees behind a JS
 * breakpoint — and on the two smaller ones the "column" a card sat in was
 * already not the thing you looked at; the chip row was. Filtering is what
 * staff were doing anyway, so it is now the only mechanism, and the layout
 * differs by width only in how many cards fit on a row.
 */
export function BoardPage() {
  const { t } = useTranslation('admin')
  const { session } = useSession()
  const { data: admin } = useCurrentAdmin(session?.user.email)
  const { data: settings } = useShopSettingsAdmin()
  const board = useOrderBoard()
  const chime = useChime(board.orders.length, board.unseen.size)

  if (board.isPending) return <PageSpinner />
  if (board.error) {
    return (
      <Card className="p-4">
        <p className="break-words text-st-cancel-fg">{board.error.message}</p>
      </Card>
    )
  }

  const cardProps = {
    currentAdminId: admin?.id ?? null,
    // The switch is enforced inside advance_order; this only decides whether
    // the card shows the field, so a stale read here cannot let anything past.
    requireCodeOnHandover: settings?.require_code_on_handover ?? true,
    unseen: board.unseen,
    markSeen: board.markSeen,
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ConnectionDot connected={board.connected} />
        {!chime.enabled && (
          <button
            type="button"
            onClick={chime.enable}
            className="min-h-9 rounded-full border border-border bg-surface px-3 text-[0.85rem] text-ink-muted"
          >
            {t('soundEnable')}
          </button>
        )}
      </div>

      <FilteredBoard board={board} {...cardProps} />
    </div>
  )
}

type BoardData = ReturnType<typeof useOrderBoard>
interface CardProps {
  currentAdminId: string | null
  requireCodeOnHandover: boolean
  unseen: Set<string>
  markSeen: (id: string) => void
}

function renderCard(order: BoardOrder, p: CardProps, showStatus = false) {
  return (
    <OrderCard
      key={order.id}
      order={order}
      currentAdminId={p.currentAdminId}
      requireCodeOnHandover={p.requireCodeOnHandover}
      isNew={p.unseen.has(order.id)}
      onSeen={() => p.markSeen(order.id)}
      showStatus={showStatus}
    />
  )
}

function FilteredBoard({ board, ...p }: { board: BoardData } & CardProps) {
  const { t } = useTranslation('admin')
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const shown = filter === 'all' ? board.orders : board.orders.filter((o) => o.status === filter)

  return (
    <div className="flex flex-col gap-3">
      {/* Sticky, and bleeding to the edges of the layout's own padding so the
          scroll strip runs full-width. The filter has to stay reachable however
          far the list has been scrolled — it is now the only way to narrow the
          board. */}
      <div
        className={[
          'scroll-strip sticky top-14 z-20 flex gap-2 bg-ground py-2',
          '-mx-3 px-3 sm:-mx-4 sm:px-4',
        ].join(' ')}
      >
        <Chip
          label={t('filterAll')}
          count={board.orders.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {ACTIVE_STATUSES.map((status) => (
          <Chip
            key={status}
            status={status}
            count={board.orders.filter((o) => o.status === status).length}
            active={filter === status}
            onClick={() => setFilter(status)}
          />
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyCard />
      ) : (
        // The status badge stays on every card even when one status is
        // selected: the filter is at the top of a page that scrolls, and a card
        // has to say what it is without scrolling back up to check.
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((o) => renderCard(o, p, true))}
        </div>
      )}
    </div>
  )
}

function EmptyCard() {
  const { t } = useTranslation('admin')
  return <Card className="p-4 text-[0.9rem] text-ink-muted">{t('boardEmpty')}</Card>
}

function Chip({
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

function ConnectionDot({ connected }: { connected: boolean }) {
  const { t } = useTranslation('admin')
  return (
    <span
      className={[
        'inline-flex items-center gap-2 text-[0.85rem]',
        connected ? 'text-ink-muted' : 'text-st-cancel-fg',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'size-2 rounded-full',
          connected ? 'bg-st-ready-fg' : 'bg-st-cancel-fg',
        ].join(' ')}
      />
      {connected ? t('liveOn') : t('liveOff')}
    </span>
  )
}

/**
 * A short chime on a new order, plus an unread count in the tab title.
 *
 * Browsers block autoplay until the user has interacted with the page, so
 * consent is asked for once and remembered. The tab title is free and works
 * when the board is in a background tab, which during prep it usually is.
 */
function useChime(orderCount: number, unseenCount: number) {
  const { t } = useTranslation('common')
  const [enabled, setEnabled] = useState(() =>
    readLocal(STORAGE_KEYS.soundConsent, z.boolean(), false),
  )
  const previous = useRef(orderCount)

  useEffect(() => {
    const name = t('appName')
    document.title = unseenCount > 0 ? `(${unseenCount}) ${name}` : name
  }, [unseenCount, t])

  useEffect(() => {
    const grew = orderCount > previous.current
    previous.current = orderCount
    if (!grew || !enabled) return

    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.36)
      osc.onended = () => void ctx.close()
    } catch {
      // No audio device, or a policy still blocking it. The ring and the tab
      // count carry the alert on their own.
    }
  }, [orderCount, enabled])

  return {
    enabled,
    enable: () => {
      setEnabled(true)
      writeLocal(STORAGE_KEYS.soundConsent, true)
    },
  }
}
