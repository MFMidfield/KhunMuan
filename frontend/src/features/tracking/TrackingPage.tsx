import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { money, timeOfDay } from '@/lib/i18n'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { tokenForCode } from './myOrders'
import type { Database } from '@/types/database'

type OrderStatus = Database['public']['Enums']['order_status']
type PaymentMethod = Database['public']['Enums']['payment_method']
type PaymentState = Database['public']['Enums']['payment_state']

interface LookupItem {
  set_name: string
  piece_quota: number
  quantity: number
  line_total: number
  note: string | null
  fillings: { name: string; qty: number }[]
  addons: { name: string; qty: number; unit_price: number }[]
}

interface LookupResult {
  id: string
  code: string
  status: OrderStatus
  created_at: string
  fulfillment: 'pickup' | 'delivery'
  note: string | null
  subtotal: number
  delivery_fee: number
  total: number
  can_cancel: boolean
  full_view: boolean
  pickup_point: { name: string; detail: string | null } | null
  pickup_slot: { label: string } | null
  delivery_zone: { name: string } | null
  delivery_location: string | null
  customer_name: string | null
  customer_phone: string | null
  payment: { method: PaymentMethod; state: PaymentState } | null
  /** The label the shop picked from its own list. Null unless the order ended. */
  reject_reason: string | null
  /** Free text staff typed. Full view only — it can be about the customer. */
  reject_note: string | null
  items: LookupItem[]
}

/**
 * The nodes a live order moves through. Terminal states render separately.
 *
 * A delivery has one more: it leaves the shop before it reaches anyone, and the
 * customer watching this page is precisely the person who wants to know which
 * side of that line their food is on (0033).
 */
const PICKUP_FLOW: OrderStatus[] = [
  'pending_confirmation', 'accepted', 'cooking', 'ready', 'handed_over',
]
const DELIVERY_FLOW: OrderStatus[] = [
  'pending_confirmation', 'accepted', 'cooking', 'ready', 'out_for_delivery', 'handed_over',
]

export function TrackingPage() {
  const { code = '' } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation(['tracking', 'common'])
  const [copied, setCopied] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const token = tokenForCode(code)

  const query = useQuery({
    queryKey: ['order-lookup', code.toUpperCase()],
    // Realtime carries the fast path; this is the safety net. A slow poll costs
    // two requests a minute and covers the one gap measured in testing: for
    // somewhat under two seconds after the channel reports SUBSCRIBED, a
    // broadcast can still be dropped. A customer who opens this page at the
    // exact moment staff tap "รับออเดอร์" would otherwise sit on a stale status
    // until they reloaded.
    refetchInterval: 30_000,
    retry: false,
    queryFn: async (): Promise<LookupResult> => {
      // Through the Edge Function, not the RPC. `lookup_order` is no longer
      // callable by anon at all: a plain RPC is never told the caller's IP, and
      // the rate limit that makes a public code lookup survivable is per-IP.
      const { data, error } = await supabase.functions.invoke<LookupResult>('track', {
        body: { code, client_token: token },
      })

      if (error) {
        // The function answers 4xx with a machine code in the body; the SDK
        // hands back a FunctionsHttpError whose response still has to be read.
        const response = (error as { context?: Response }).context
        const detail = response ? await response.json().catch(() => null) : null
        throw new Error(detail?.message ?? 'ORDER_NOT_FOUND')
      }

      return data as LookupResult
    },
  })

  // The channel is named after the order's id, not its code. The id is a random
  // uuid that is never displayed, so a channel name cannot be guessed the way a
  // four-character code can — and a code used as a subscription filter would be
  // brute-forceable over a websocket with no HTTP request to rate-limit.
  const orderId = query.data?.id
  useEffect(() => {
    if (!orderId) return

    const channel = supabase
      .channel(`order:${orderId}`)
      .on('broadcast', { event: 'status' }, () => void query.refetch())
      .subscribe((status) => {
        // Refetch on join, not just on message: anything broadcast while the
        // channel was still coming up never arrives.
        if (status === 'SUBSCRIBED') void query.refetch()
      })

    return () => void supabase.removeChannel(channel)
    // query.refetch is stable for a given key; re-subscribing on every render
    // would tear the channel down mid-shift.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_order', {
        p_code: code,
        p_client_token: token!,
      })
      if (error) throw error
    },
    onSuccess: () => void query.refetch(),
  })

  if (query.isPending) return <PageSpinner />

  if (query.error) {
    const message = (query.error as { message?: string }).message
    return (
      <Card className="p-5">
        <p className="text-ink-muted">
          {message === 'ORDER_EXPIRED'
            ? t('tracking:expired')
            : message === 'RATE_LIMITED' || message === 'IP_BLOCKED'
              ? t('tracking:rateLimited')
              : t('tracking:notFound')}
        </p>
      </Card>
    )
  }

  const order = query.data
  const terminal = order.status === 'cancelled' || order.status === 'rejected'
  const FLOW = order.fulfillment === 'delivery' ? DELIVERY_FLOW : PICKUP_FLOW
  const currentIndex = FLOW.indexOf(order.status)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(order.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is blocked in some in-app browsers. The code is on screen in
      // 3rem type; copying is a convenience, not the mechanism.
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      {/* The code, big. It is what the customer will be asked for at the
          counter, so it outranks everything else on the page. */}
      <Card className="flex flex-col items-center gap-2 p-6 text-center">
        <p className="text-[0.85rem] text-ink-muted">{t('tracking:codeLabel')}</p>
        <p className="tnum text-5xl font-semibold tracking-[0.15em] sm:text-6xl">
          {order.code}
        </p>
        <p className="text-[0.85rem] text-ink-muted">{t('tracking:codeHelp')}</p>
        <Button variant="ghost" className="mt-1" onClick={() => void copyCode()}>
          {copied ? t('tracking:copied') : t('tracking:copy')}
        </Button>
      </Card>

      <Card className="p-5">
        {terminal ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={order.status} />
            </div>

            {/* Why, not just that. A rejected order rendering as one word is
                the version of this screen that generates a phone call. */}
            {(order.reject_reason || order.reject_note) && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <p className="text-[0.85rem] text-ink-muted">{t('tracking:whyEnded')}</p>
                {order.reject_reason && (
                  <p className="text-[0.95rem] break-words">{order.reject_reason}</p>
                )}
                {order.reject_note && (
                  <p className="text-[0.9rem] break-words text-ink-muted">{order.reject_note}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <ol className="flex flex-col">
            {FLOW.map((step, i) => {
              const done = i < currentIndex
              const active = i === currentIndex
              return (
                <li key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      aria-hidden="true"
                      className={[
                        'mt-1.5 size-3 shrink-0 rounded-full',
                        active
                          ? 'bg-st-cook-fg ring-4 ring-st-cook-bg'
                          : done
                            ? 'bg-st-ready-fg'
                            : 'border-[1.5px] border-border-strong bg-surface',
                      ].join(' ')}
                    />
                    {i < FLOW.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={[
                          'w-px flex-1',
                          done ? 'bg-st-ready-fg' : 'bg-border',
                        ].join(' ')}
                      />
                    )}
                  </div>

                  <p
                    className={[
                      'pb-5 text-[0.95rem]',
                      active ? 'font-semibold text-ink' : 'text-ink-muted',
                    ].join(' ')}
                    aria-current={active ? 'step' : undefined}
                  >
                    {t(`tracking:status.${step}`)}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold">{t('tracking:contents')}</h2>
        <ul className="flex flex-col gap-3">
          {order.items.map((item, i) => (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="break-words">
                  {item.set_name} ×{item.quantity}
                </span>
                <span className="tnum shrink-0">{money.format(Number(item.line_total))}</span>
              </div>
              <p className="text-[0.9rem] break-words text-ink-muted">
                {item.fillings.map((f) => `${f.name} ×${f.qty}`).join(' · ')}
              </p>
              {item.addons.length > 0 && (
                <p className="text-[0.85rem] break-words text-ink-muted">
                  {item.addons.map((a) => `${a.name} ×${a.qty}`).join(' · ')}
                </p>
              )}
              {item.note && (
                <p className="text-[0.85rem] break-words text-ink-muted">{item.note}</p>
              )}
            </li>
          ))}
        </ul>

        <div className="border-t border-border pt-3">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">{t('tracking:total')}</span>
            <span className="tnum text-lg font-semibold">
              {money.format(Number(order.total))}
            </span>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-2 p-5">
        <Fact
          label={order.fulfillment === 'pickup' ? t('tracking:pickupAt') : t('tracking:deliverTo')}
          value={
            order.fulfillment === 'pickup'
              ? [order.pickup_point?.name, order.pickup_slot?.label]
                  .filter(Boolean)
                  .join(' · ')
              : [order.delivery_zone?.name, order.delivery_location].filter(Boolean).join(' · ')
          }
        />
        <Fact
          label={t('tracking:payment')}
          value={
            order.payment
              ? `${t(`tracking:paymentMethod.${order.payment.method}`)} · ${t(
                  `tracking:paymentState.${order.payment.state}`,
                )}`
              : '—'
          }
        />
        <Fact label={t('tracking:placedAt')} value={timeOfDay.format(new Date(order.created_at))} />
      </Card>

      {/* A transfer nobody has confirmed yet outranks everything below it: the
          order does not move until the shop can see the money. */}
      {order.full_view &&
        order.payment?.method === 'transfer' &&
        order.payment.state !== 'paid' && (
          <Card className="flex flex-col gap-3 p-5">
            <p className="text-[0.95rem]">
              {order.payment.state === 'slip_uploaded'
                ? t('tracking:slipDone')
                : t('tracking:slipNeeded')}
            </p>
            <Button size="lg" onClick={() => void navigate(`/checkout/slip/${order.code}`)}>
              {order.payment.state === 'slip_uploaded'
                ? t('tracking:slipAgain')
                : t('tracking:slipTitle')}
            </Button>
          </Card>
        )}

      {!order.full_view && (
        <p className="px-1 text-[0.85rem] text-ink-muted">{t('tracking:limitedView')}</p>
      )}

      {order.can_cancel && (
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-[0.9rem] text-ink-muted">{t('tracking:cancelConfirm')}</p>
          <Button
            variant="danger"
            size="lg"
            disabled={cancel.isPending}
            onClick={() => setCancelling(true)}
          >
            {cancel.isPending ? t('tracking:cancelling') : t('tracking:cancelOrder')}
          </Button>
          {cancel.error && (
            <p role="alert" className="text-[0.85rem] text-st-cancel-fg">
              {t('tracking:cancelClosed')}
            </p>
          )}
        </Card>
      )}

      {/* Cancelling is the one thing on this page the customer cannot undo: the
          window closes the moment the shop accepts, and stock has already moved
          back by then. */}
      {cancelling && (
        <ConfirmDialog
          title={t('tracking:cancelOrder')}
          body={t('tracking:cancelModalBody', { code: order.code })}
          confirmLabel={t('tracking:cancelConfirmYes')}
          cancelLabel={t('tracking:cancelConfirmNo')}
          danger
          busy={cancel.isPending}
          onClose={() => setCancelling(false)}
          onConfirm={() => {
            setCancelling(false)
            cancel.mutate()
          }}
        />
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-[0.9rem] text-ink-muted">{label}</span>
      <span className="text-[0.95rem] break-words">{value}</span>
    </div>
  )
}
