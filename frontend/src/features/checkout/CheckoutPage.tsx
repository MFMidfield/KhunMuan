import { useEffect, useMemo, useRef, useState } from 'react'
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
import { MenuImage } from '@/components/ui/MenuImage'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SLIP_TYPES, stageSlip } from '@/lib/slip'
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
  // The staged slip's storage path, set once the upload lands. It is what makes
  // the submit button live for a transfer — see migration 0028.
  const [slipPath, setSlipPath] = useState<string | null>(null)
  const [slipName, setSlipName] = useState('')
  const [confirming, setConfirming] = useState(false)

  // Generated once per checkout attempt, not per click: that is the whole point
  // of an idempotency key. A double-tap or a retry after a dropped connection
  // must return the first order rather than create a second one.
  const [requestId] = useState(() => crypto.randomUUID())

  // Set the moment an order comes back, and read by the guard below.
  //
  // Without it the two fight: a successful placement clears the cart, the empty
  // cart trips the guard, and the redirect to /cart wins the race against the
  // redirect to the tracking page — so the customer's code, the one thing they
  // are about to be asked for at the counter, never appears.
  const placed = useRef(false)

  useEffect(() => {
    if (cart.lines.length === 0 && !placed.current) {
      void navigate('/cart', { replace: true })
    }
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

  const upload = useMutation({
    mutationFn: stageSlip,
    onSuccess: (path) => setSlipPath(path),
  })

  const place = useMutation({
    mutationFn: async (): Promise<PlaceOrderResult> => {
      const payload = {
        client_request_id: requestId,
        fulfillment,
        payment_method: method,
        client_total: total,
        note: note.trim() || null,
        ...(method === 'transfer' && slipPath ? { slip_path: slipPath } : {}),
        ...(fulfillment === 'pickup'
          ? {
              pickup_point_id: pointId,
              pickup_slot_id: slotId,
              customer_name: name.trim(),
              customer_room: room.trim() || null,
              customer_phone: phone.trim() || null,
            }
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
      placed.current = true
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
  const whereIsFilled =
    fulfillment === 'pickup'
      ? Boolean(pointId && slotId && name.trim())
      : Boolean(zoneId && location.trim() && name.trim() && phone.trim())

  // Paying by transfer without attaching the slip is the failure this screen
  // exists to stop: an order arrives on the board saying "โอนแล้ว" and nobody
  // can tell whether money moved. place_order refuses it too — the button is
  // disabled so the customer finds out here rather than after a round trip.
  const slipReady = method !== 'transfer' || Boolean(slipPath)
  const canSubmit = whereIsFilled && slipReady

  return (
    <form
      className="flex flex-col gap-4 pb-40 lg:pb-0"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit && !place.isPending) setConfirming(true)
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

      {/* Asked for on both routes now. A pickup order used to carry no name at
          all, which left the counter calling out a four-character code to a
          crowd — the name is what staff actually say when the food is ready.
          The phone and the room stay optional there: the customer is standing
          in front of the shop, so there is nobody to ring and nowhere to go. */}
      <Card className="flex flex-col gap-3 p-4">
        <div>
          <h2 className="font-semibold">{t('checkout:contact')}</h2>
          <p className="text-[0.85rem] text-ink-muted">
            {fulfillment === 'pickup'
              ? t('checkout:contactWhyPickup')
              : t('checkout:contactWhy')}
          </p>
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
          hint={fulfillment === 'pickup' ? t('common:optional') : undefined}
          required={fulfillment === 'delivery'}
        />
      </Card>

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

        {method === 'transfer' && (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {settings?.promptpay_qr_path ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-[0.85rem] text-ink-muted">{t('checkout:scanToPay')}</p>
                <div className="w-52 max-w-full">
                  <MenuImage
                    path={settings.promptpay_qr_path}
                    alt={t('checkout:scanToPay')}
                  />
                </div>
                <p className="tnum text-lg font-semibold">{money.format(total)}</p>
              </div>
            ) : (
              // The QR is a back-office upload and may simply not be there yet.
              // Saying so beats rendering a blank square the customer will read
              // as a broken page.
              <p className="text-[0.85rem] text-gold-ink">{t('checkout:noQr')}</p>
            )}

            <div className="flex flex-col gap-2">
              <p className="text-[0.9rem] font-medium">{t('checkout:slipRequired')}</p>
              <input
                type="file"
                accept={SLIP_TYPES.join(',')}
                id="checkout-slip"
                className="hidden"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setSlipName(file.name)
                    upload.mutate(file)
                  }
                  e.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="ghost"
                disabled={upload.isPending}
                onClick={() => document.getElementById('checkout-slip')?.click()}
              >
                {upload.isPending
                  ? t('checkout:slipUploading')
                  : slipPath
                    ? t('checkout:slipReplace')
                    : t('checkout:slipPick')}
              </Button>

              {slipPath && (
                <p className="text-[0.85rem] break-all text-st-ready-fg">
                  {t('checkout:slipAttached', { name: slipName })}
                </p>
              )}

              {upload.error && (
                <p role="alert" className="text-[0.85rem] text-st-cancel-fg">
                  {t(`checkout:${(upload.error as Error).message}`)}
                </p>
              )}
            </div>
          </div>
        )}
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

        {whereIsFilled && !slipReady && (
          <p className="mx-auto max-w-5xl pb-3 text-[0.8rem] text-ink-muted lg:pb-0">
            {t('checkout:slipBlocks')}
          </p>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title={t('checkout:confirmTitle')}
          body={t('checkout:confirmBody', { total: money.format(total) })}
          confirmLabel={t('checkout:confirmPlace')}
          cancelLabel={t('checkout:confirmBack')}
          busy={place.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            place.mutate()
          }}
        />
      )}
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
