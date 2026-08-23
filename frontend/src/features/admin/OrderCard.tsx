import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { money } from '@/lib/i18n'
import { AgeTimer } from './AgeTimer'
import { ReasonDialog } from './ReasonDialog'
import { actionError, useAdvance, useClaim, useRelease, useSetPayment } from './useOrderActions'
import type { BoardOrder } from './useOrderBoard'

/** A claim left sitting this long on an accepted order gets a stale marker. */
const STALE_CLAIM_MINUTES = 45

export function OrderCard({
  order,
  currentAdminId,
  requireCodeOnHandover,
  isNew,
  onSeen,
  showStatus = false,
}: {
  order: BoardOrder
  currentAdminId: string | null
  requireCodeOnHandover: boolean
  isNew: boolean
  onSeen: () => void
  showStatus?: boolean
}) {
  const { t } = useTranslation(['admin', 'tracking', 'common'])
  const claim = useClaim()
  const release = useRelease()
  const advance = useAdvance()
  const payment = useSetPayment()

  const [reasonFor, setReasonFor] = useState<'rejected' | 'cancelled' | null>(null)
  const [code, setCode] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [showOverride, setShowOverride] = useState(false)

  const mine = order.claimed_by !== null && order.claimed_by === currentAdminId
  const theirs = order.claimed_by !== null && !mine
  const staleClaim =
    order.claimed_at !== null &&
    order.status === 'accepted' &&
    Date.now() - new Date(order.claimed_at).getTime() > STALE_CLAIM_MINUTES * 60_000

  const busy = claim.isPending || release.isPending || advance.isPending || payment.isPending
  const error =
    claim.error ?? release.error ?? advance.error ?? payment.error ?? null

  const run = (to: BoardOrder['status'], extra: Record<string, unknown> = {}) =>
    advance.mutate({
      orderId: order.id,
      to,
      expectedVersion: order.version,
      ...extra,
    })

  return (
    <Card
      onPointerDown={isNew ? onSeen : undefined}
      className={[
        'flex flex-col gap-3 p-4',
        // Cards someone else owns get a muted edge so your eye skips them.
        theirs ? 'border-border opacity-80' : '',
        isNew ? 'ring-2 ring-gold-fill' : '',
      ].join(' ')}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="tnum text-xl font-semibold tracking-wide">{order.code}</span>
        {showStatus && <StatusBadge status={order.status} />}
        {isNew && (
          <span className="rounded-full border-[1.5px] border-gold-edge bg-gold-fill px-2 py-0.5 text-[0.7rem] font-semibold text-ink">
            {t('admin:newBadge')}
          </span>
        )}
        {order.source === 'admin' && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] text-ink-muted">
            {t('admin:keyedIn')}
          </span>
        )}
        <span className="ms-auto">
          <AgeTimer createdAt={order.created_at} />
        </span>
      </header>

      {/* Fillings are never collapsed. Opening a detail view to see what to
          cook is one tap too many during a rush. */}
      <div className="flex flex-col gap-2 border-y border-border py-3">
        {order.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-0.5">
            <p className="text-[0.9rem] font-medium break-words">
              {item.set_name} ×{item.quantity}
            </p>
            <p className="text-[0.9rem] break-words text-ink-muted">
              {item.fillings.map((f) => `${f.filling_name} ×${f.qty}`).join(' · ')}
            </p>
            {item.addons.length > 0 && (
              <p className="text-[0.85rem] break-words text-ink-muted">
                {item.addons.map((a) => `${a.addon_name} ×${a.qty}`).join(' · ')}
              </p>
            )}
            {item.note && (
              <p className="text-[0.85rem] break-words text-gold-ink">{item.note}</p>
            )}
          </div>
        ))}
        {order.note && (
          <p className="text-[0.85rem] break-words text-gold-ink">
            {t('admin:orderNote')}: {order.note}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.85rem] text-ink-muted">
        <span className="break-words">
          {order.fulfillment === 'pickup'
            ? [order.point_name, order.slot_label].filter(Boolean).join(' · ')
            : [order.zone_name, order.delivery_location].filter(Boolean).join(' · ')}
        </span>
        {order.customer_phone && (
          <span className="tnum">{order.customer_phone}</span>
        )}
      </div>

      {/* Payment state is on the card, not one tap away. It is a top-four
          failure mode, so it gets top-level pixels. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.85rem]">
          {order.payment_method && t(`tracking:paymentMethod.${order.payment_method}`)}
          {' · '}
          <span
            className={
              order.payment_state === 'paid' ? 'text-st-ready-fg' : 'text-ink-muted'
            }
          >
            {order.payment_state && t(`tracking:paymentState.${order.payment_state}`)}
          </span>
        </span>
        <span className="tnum font-semibold">{money.format(Number(order.total))}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="text-[0.85rem] text-ink-muted">
          {order.claimed_by_name
            ? mine
              ? t('admin:claimedBy', { name: order.claimed_by_name })
              : t('admin:takenBy', { name: order.claimed_by_name })
            : t('admin:unclaimed')}
        </span>
        {staleClaim && (
          <span className="rounded-full bg-st-cancel-bg px-2 py-0.5 text-[0.7rem] text-st-cancel-fg">
            {t('admin:staleClaim')}
          </span>
        )}
        {mine && (
          <button
            type="button"
            onClick={() => release.mutate(order.id)}
            className="min-h-9 px-1 text-[0.85rem] text-ink-muted hover:text-ink"
          >
            {t('admin:release')}
          </button>
        )}
      </div>

      {order.status === 'ready' && requireCodeOnHandover && (
        <label className="flex flex-col gap-1">
          <span className="text-[0.85rem] font-medium">{t('admin:handoverCode')}</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={6}
            className="tnum min-h-11 rounded-btn border border-border-strong bg-surface px-3 text-center text-lg tracking-[0.25em] uppercase"
          />
          <span className="text-[0.75rem] text-ink-muted">
            {t('admin:handoverCodeHelp')}
          </span>
        </label>
      )}

      {showOverride && (
        <label className="flex flex-col gap-1">
          <span className="text-[0.85rem] font-medium">{t('admin:overrideNote')}</span>
          <input
            value={overrideNote}
            onChange={(e) => setOverrideNote(e.target.value)}
            className="min-h-11 rounded-btn border border-border-strong bg-surface px-3"
          />
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        {order.status === 'pending_confirmation' && (
          <>
            <Button className="flex-1" disabled={busy} onClick={() => run('accepted')}>
              {t('admin:accept')}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setReasonFor('rejected')}
            >
              {t('admin:reject')}
            </Button>
          </>
        )}

        {order.status === 'accepted' && (
          <>
            {!order.claimed_by && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => claim.mutate(order.id)}
              >
                {t('admin:claim')}
              </Button>
            )}
            <Button
              className="flex-1"
              disabled={busy || theirs}
              onClick={() => run('cooking')}
            >
              {t('admin:start')}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setReasonFor('cancelled')}>
              {t('common:cancel')}
            </Button>
          </>
        )}

        {order.status === 'cooking' && (
          <>
            <Button className="flex-1" disabled={busy || theirs} onClick={() => run('ready')}>
              {t('admin:done')}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setReasonFor('cancelled')}>
              {t('common:cancel')}
            </Button>
          </>
        )}

        {order.status === 'ready' && (
          <>
            {order.payment_state !== 'paid' && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => payment.mutate({ orderId: order.id, state: 'paid' })}
              >
                {t('admin:markPaid')}
              </Button>
            )}
            <Button
              className="flex-1"
              disabled={busy || (requireCodeOnHandover && code.length < 4)}
              onClick={() =>
                run('handed_over', {
                  ...(requireCodeOnHandover ? { code } : {}),
                  ...(showOverride ? { overridePayment: true, note: overrideNote } : {}),
                })
              }
            >
              {t('admin:handOver')}
            </Button>
            {order.payment_state !== 'paid' && !showOverride && (
              <button
                type="button"
                onClick={() => setShowOverride(true)}
                className="min-h-9 px-1 text-[0.85rem] text-ink-muted hover:text-ink"
              >
                {t('admin:override')}
              </button>
            )}
          </>
        )}
      </div>

      {claim.data?.claimed === false && (
        <p className="text-[0.85rem] text-ink-muted">
          {t('admin:takenBy', { name: claim.data.claimed_by_name ?? '' })}
        </p>
      )}

      {error && (
        <p role="alert" className="text-[0.85rem] break-words text-st-cancel-fg">
          {actionError(error, t)}
        </p>
      )}

      {reasonFor && (
        <ReasonDialog
          title={reasonFor === 'rejected' ? t('admin:reject') : t('admin:cancelOrder')}
          confirmLabel={reasonFor === 'rejected' ? t('admin:reject') : t('admin:cancelOrder')}
          busy={busy}
          onClose={() => setReasonFor(null)}
          onConfirm={(reasonId, note) => {
            run(reasonFor, { reasonId, note })
            setReasonFor(null)
          }}
        />
      )}
    </Card>
  )
}
