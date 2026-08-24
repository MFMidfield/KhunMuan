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
    exclusiveClaims: settings?.exclusive_claims ?? true,
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
  exclusiveClaims: boolean
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
      exclusiveClaims={p.exclusiveClaims}
      isNew={p.unseen.has(order.id)}
      onSeen={() => p.markSeen(order.id)}
      showStatus={showStatus}
    />
  )
}

/**
 * Everything on a card that someone might type into the box.
 *
 * The code first, because it is what a customer reads out on the phone — but
 * not only the code: staff searching the board are as often working from
 * "the one with the shrimp for the girl in building 3" as from four characters.
 */
function haystack(o: BoardOrder): string {
  return [
    o.code,
    o.customer_name,
    o.customer_phone,
    o.delivery_location,
    o.point_name,
    o.slot_label,
    o.zone_name,
    o.claimed_by_name,
    o.note,
    ...o.items.flatMap((i) => [
      i.set_name,
      i.note,
      ...i.fillings.map((f) => f.filling_name),
      ...i.addons.map((a) => a.addon_name),
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Digits only, so 080-000-0000 and 0800000000 are the same search. */
const digits = (s: string) => s.replace(/\D/g, '')

function matches(o: BoardOrder, query: string): boolean {
  if (haystack(o).includes(query)) return true
  const wanted = digits(query)
  return wanted.length >= 3 && digits(o.customer_phone ?? '').includes(wanted)
}

function FilteredBoard({ board, ...p }: { board: BoardData } & CardProps) {
  const { t } = useTranslation('admin')
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const searching = query.length > 0

  // Search spans the whole board and ignores the chip. Someone typing a code
  // does not know which status the order is sitting in — that is usually the
  // question they are asking.
  const shown = searching
    ? board.orders.filter((o) => matches(o, query))
    : filter === 'all'
      ? board.orders
      : board.orders.filter((o) => o.status === filter)

  // One narrowing mechanism at a time. Tapping a chip while a search is open is
  // the gesture for "put the board back", so it clears the box rather than
  // quietly doing nothing.
  const pick = (next: OrderStatus | 'all') => {
    setSearch('')
    setFilter(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Sticky, and bleeding to the edges of the layout's own padding so the
          scroll strip runs full-width. The filter has to stay reachable however
          far the list has been scrolled — it is now the only way to narrow the
          board. */}
      <div
        className={[
          'sticky top-14 z-20 flex flex-col gap-2 bg-ground py-2',
          '-mx-3 px-3 sm:-mx-4 sm:px-4',
        ].join(' ')}
      >
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            // 16px minimum: iOS zooms the whole page for anything smaller and
            // never zooms back.
            className="min-h-11 w-full rounded-btn border border-border-strong bg-surface px-3 pe-10 text-base text-ink"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t('searchClear')}
              className="absolute inset-y-0 end-0 flex min-h-11 w-10 items-center justify-center text-ink-muted hover:text-ink"
            >
              ×
            </button>
          )}
        </div>

        {/* The chips bleed back out past the header's padding so the strip
            still scrolls edge to edge; the search box above stays inside it. */}
        <div className="scroll-strip -mx-3 flex gap-2 px-3 sm:-mx-4 sm:px-4">
          <Chip
            label={t('filterAll')}
            count={board.orders.length}
            active={!searching && filter === 'all'}
            onClick={() => pick('all')}
          />
          {ACTIVE_STATUSES.map((status) => (
            <Chip
              key={status}
              status={status}
              count={board.orders.filter((o) => o.status === status).length}
              active={!searching && filter === status}
              onClick={() => pick(status)}
            />
          ))}
        </div>
      </div>

      {searching && (
        <p className="text-[0.85rem] text-ink-muted">
          {t('searchScope', { count: shown.length })}
        </p>
      )}

      {shown.length === 0 ? (
        searching ? (
          <Card className="p-4 text-[0.9rem] text-ink-muted">{t('searchEmpty')}</Card>
        ) : (
          <EmptyCard />
        )
      ) : (
        // The status badge stays on every card even when one status is
        // selected: the filter is at the top of a page that scrolls, and a card
        // has to say what it is without scrolling back up to check.
        // Keyed on what is being shown, so changing the filter or typing in the
        // search replays the entrance for the new set. Individual cards are
        // keyed by id inside, so a realtime update to one of them does not
        // restart the animation on the rest.
        <div
          key={searching ? `q:${query}` : `f:${filter}`}
          className="anim-rise grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
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
        'snap-item tap-target inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4',
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
