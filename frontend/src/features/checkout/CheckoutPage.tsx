import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/i18n'
import { queryClient, qk } from '@/lib/queryClient'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { useCart } from '@/features/cart/cartContext'
import { rememberOrder } from '@/features/tracking/myOrders'
import {
  useAddons,
  useDeliveryZones,
  usePickupPoints,
  usePickupSlots,
  useSets,
  useShopSettings,
} from '@/features/menu/queries'

type Fulfillment = 'pickup' | 'delivery'
type PaymentMethod = 'cash' | 'transfer'

interface PlaceOrderResult {
  id: string
  code: string
  total: number
  status: string
  client_token: string
  replayed: boolean
}

export function CheckoutPage() {
  const { t } = useTranslation(['checkout', 'common'])
  const navigate = useNavigate()
  const cart = useCart()

  const { data: settings } = useShopSettings()
  const { data: sets } = useSets()
  const { data: addons } = useAddons()
  const { data: points } = usePickupPoints()
  const { data: slots } = usePickupSlots()
  const { data: zones } = useDeliveryZones()

  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup')
  // Picked values, empty until someone chooses. The first option is the
  // default, derived below rather than written back in an effect — an effect
  // would render one frame with nothing selected and a disabled submit.
  const [pickedPoint, setPickedPoint] = useState('')
  const [pickedSlot, setPickedSlot] = useState('')
  const [pickedZone, setPickedZone] = useState('')
  const [location, setLocation] = useState('')
  const [name, setName] = useState('')
  const [room, setRoom] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')

  // Generated once per checkout attempt, not per click: that is the whole point
  // of an idempotency key. A double-tap or a retry after a dropped connection
  // must return the first order rather than create a second one.
  const [requestId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    if (cart.lines.length === 0) void navigate('/cart', { replace: true })
  }, [cart.lines.length, navigate])

  const subtotal = useMemo(() => {
    if (!sets || !addons) return 0
    const setById = new Map(sets.map((s) => [s.id, s]))
    const addonById = new Map(addons.map((a) => [a.id, a]))
    return cart.lines.reduce((sum, line) => {
      const extras = line.addons.reduce(
        (n, a) => n + Number(addonById.get(a.addon_id)?.price ?? 0) * a.qty,
        0,
      )
      return sum + (Number(setById.get(line.set_id)?.price ?? 0) + extras) * line.quantity
    }, 0)
  }, [cart.lines, sets, addons])

  const pointId = pickedPoint || points?.[0]?.id || ''
  const slotId = pickedSlot || slots?.[0]?.id || ''
  const zoneId = pickedZone || zones?.[0]?.id || ''

  const zone = zones?.find((z) => z.id === zoneId)
  const deliveryFee = fulfillment === 'delivery' ? Number(zone?.fee ?? 0) : 0
  const total = subtotal + deliveryFee

  // One active zone means the customer is not choosing anything, so the
  // selector would be a control with a single option — noise. It appears on its
  // own the day a second zone is added in the back office.
  const showZonePicker = (zones?.length ?? 0) > 1

  const place = useMutation({
    mutationFn: async (): Promise<PlaceOrderResult> => {
      const payload = {
        client_request_id: requestId,
        fulfillment,
        payment_method: method,
        client_total: total,
        note: note.trim() || null,
        ...(fulfillment === 'pickup'
          ? { pickup_point_id: pointId, pickup_slot_id: slotId }
          : {
              delivery_zone_id: zoneId,
              delivery_location: location.trim(),
              customer_name: name.trim(),
              customer_room: room.trim() || null,
              customer_phone: phone.trim(),
            }),
        items: cart.lines.map((l) => ({
          set_id: l.set_id,
          quantity: l.quantity,
          fillings: l.fillings,
          addons: l.addons,
          note: l.note,
        })),
      }

      const { data, error } = await supabase.rpc('place_order', { p_payload: payload })
      if (error) throw error
      return data as unknown as PlaceOrderResult
    },
    onSuccess: (result) => {
      rememberOrder({
        code: result.code,
        client_token: result.client_token,
        created_at: new Date().toISOString(),
      })
      cart.clear()
      // Stock moved for everyone, not just this device.
      void queryClient.invalidateQueries({ queryKey: qk.stockToday })
      void navigate(`/o/${result.code}`, { replace: true })
    },
  })

  if (!sets || !addons || !points || !slots || !zones) return <PageSpinner />

  const deliveryAllowed = settings?.delivery_enabled ?? true
  const canSubmit =
    fulfillment === 'pickup'
      ? Boolean(pointId && slotId)
      : Boolean(zoneId && location.trim() && name.trim() && phone.trim())

  return (
    <form
      className="flex flex-col gap-4 pb-40 lg:pb-0"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit && !place.isPending) place.mutate()
      }}
    >
      <h1 className="text-xl font-semibold sm:text-2xl">{t('checkout:title')}</h1>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{t('checkout:howToGet')}</h2>

        <div className="grid grid-cols-2 gap-2">
          <Choice
            selected={fulfillment === 'pickup'}
            onSelect={() => setFulfillment('pickup')}
            label={t('checkout:pickup')}
          />
          <Choice
            selected={fulfillment === 'delivery'}
            onSelect={() => setFulfillment('delivery')}
            label={t('checkout:delivery')}
            disabled={!deliveryAllowed}
          />
        </div>

        {!deliveryAllowed && (
          <p className="text-[0.85rem] text-ink-muted">{t('checkout:deliveryOff')}</p>
        )}

        {fulfillment === 'pickup' ? (
          <>
            <Select
              label={t('checkout:pickupPoint')}
              value={pointId}
              onChange={setPickedPoint}
              options={points.map((p) => ({
                value: p.id,
                label: p.detail ? `${p.name} · ${p.detail}` : p.name,
              }))}
            />
            <Select
              label={t('checkout:pickupSlot')}
              value={slotId}
              onChange={setPickedSlot}
              options={slots.map((s) => ({ value: s.id, label: s.label }))}
            />
          </>
        ) : (
          <>
            {showZonePicker && (
              <Select
                label={t('checkout:zone')}
                value={zoneId}
                onChange={setPickedZone}
                options={zones.map((z) => ({
                  value: z.id,
                  label: `${z.name} · ${money.format(Number(z.fee))}`,
                }))}
              />
            )}
            <Input
              label={t('checkout:deliveryLocation')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('checkout:deliveryLocationPlaceholder')}
              required
            />
          </>
        )}
      </Card>

      {fulfillment === 'delivery' && (
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-semibold">{t('checkout:contact')}</h2>
            <p className="text-[0.85rem] text-ink-muted">{t('checkout:contactWhy')}</p>
          </div>
          <Input
            label={t('checkout:name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
          <Input
            label={t('checkout:room')}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            hint={t('common:optional')}
          />
          <Input
            label={t('checkout:phone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
          />
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{t('checkout:payment')}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Choice
            selected={method === 'cash'}
            onSelect={() => setMethod('cash')}
            label={t('checkout:cash')}
          />
          <Choice
            selected={method === 'transfer'}
            onSelect={() => setMethod('transfer')}
            label={t('checkout:transfer')}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{t('checkout:orderNote')}</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          className="w-full rounded-btn border border-border-strong bg-surface p-3 text-ink"
        />
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <Row label={t('checkout:subtotal')} value={money.format(subtotal)} />
        {fulfillment === 'delivery' && (
          <Row label={t('checkout:deliveryFee')} value={money.format(deliveryFee)} />
        )}
        <div className="mt-1 border-t border-border pt-2">
          <Row label={t('checkout:total')} value={money.format(total)} strong />
        </div>
      </Card>

      {place.error && (
        <Card className="border-st-cancel-fg p-4" role="alert">
          <p className="break-words text-st-cancel-fg">{errorMessage(place.error, t)}</p>
        </Card>
      )}

      <div
        className={[
          'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface',
          'px-4 pt-3 pb-safe lg:static lg:border-0 lg:bg-transparent lg:px-0',
        ].join(' ')}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3 pb-3 lg:pb-0">
          <div>
            <p className="text-[0.75rem] text-ink-muted">{t('checkout:total')}</p>
            <p className="tnum text-lg font-semibold">{money.format(total)}</p>
          </div>
          <Button
            type="submit"
            size="lg"
            className="ms-auto flex-1 sm:flex-none sm:px-8"
            disabled={!canSubmit || place.isPending}
          >
            {place.isPending ? t('checkout:submitting') : t('checkout:submit')}
          </Button>
        </div>
      </div>
    </form>
  )
}

/**
 * place_order raises machine-readable codes precisely so the customer can be
 * told which chip to change. Falling back to the raw Postgres message would
 * show them something unactionable in English.
 */
function errorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const err = error as { message?: string; details?: string } | null
  const code = err?.message ?? ''
  const known = t(`checkout:errors.${code}`, { detail: err?.details ?? '' })
  // i18next echoes the key back when it has no translation for it.
  return known.startsWith('checkout:errors.') ? t('checkout:errors.unknown') : known
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={strong ? 'font-semibold' : 'text-ink-muted'}>{label}</span>
      <span className={`tnum ${strong ? 'text-lg font-semibold' : ''}`}>{value}</span>
    </div>
  )
}

function Choice({
  selected,
  onSelect,
  label,
  disabled = false,
}: {
  selected: boolean
  onSelect: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        'min-h-12 rounded-btn border px-3 text-[0.95rem]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        selected
          ? 'border-ink bg-surface-2 font-medium text-ink'
          : 'border-border bg-surface text-ink-muted',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.9rem] font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-btn border border-border-strong bg-surface px-3 text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
