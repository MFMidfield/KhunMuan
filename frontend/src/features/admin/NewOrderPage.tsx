import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/i18n'
import { qk, queryClient } from '@/lib/queryClient'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Stepper } from '@/components/ui/Stepper'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  useAddons,
  useDeliveryZones,
  useFillings,
  usePickupPoints,
  usePickupSlots,
  useSets,
  useStockToday,
} from '@/features/menu/queries'
import { actionError } from './useOrderActions'

interface DraftBox {
  key: string
  set_id: string
  set_name: string
  price: number
  quantity: number
  fillings: { filling_id: string; qty: number }[]
  addons: { addon_id: string; qty: number }[]
  note: string | null
}

/**
 * Phone orders, keyed in by staff.
 *
 * It goes through the same place_order as the customer app — there is exactly
 * one code path for creating an order, and a second one would drift on
 * something that matters, like stock locking or price recomputation. The server
 * notices the caller is staff and records source = 'admin' plus who keyed it in;
 * nothing here has to claim that for itself.
 *
 * This is one screen rather than the customer's menu → builder → cart → checkout
 * walk, because the person using it is holding a phone to their ear and cannot
 * navigate away and back mid-sentence.
 */
export function NewOrderPage() {
  const { t } = useTranslation(['admin', 'build', 'checkout', 'common'])
  const navigate = useNavigate()

  const { data: sets } = useSets()
  const { data: fillings } = useFillings()
  const { data: addons } = useAddons()
  const { data: stock } = useStockToday()
  const { data: points } = usePickupPoints()
  const { data: slots } = usePickupSlots()
  const { data: zones } = useDeliveryZones()

  const [boxes, setBoxes] = useState<DraftBox[]>([])
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup')
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash')
  const [pickedPoint, setPickedPoint] = useState('')
  const [pickedSlot, setPickedSlot] = useState('')
  const [pickedZone, setPickedZone] = useState('')
  const [location, setLocation] = useState('')
  const [name, setName] = useState('')
  const [room, setRoom] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [acceptNow, setAcceptNow] = useState(true)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [acceptWarning, setAcceptWarning] = useState(false)

  // Derived before the mutation is built: mutationFn closes over these, and
  // leaving them below the early return means the closure captures bindings the
  // spinner render never initialised.
  const pointId = pickedPoint || points?.[0]?.id || ''
  const slotId = pickedSlot || slots?.[0]?.id || ''
  const zoneId = pickedZone || zones?.[0]?.id || ''

  const place = useMutation({
    mutationFn: async () => {
      const payload = {
        client_request_id: requestId,
        fulfillment,
        payment_method: method,
        note: note.trim() || null,
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
        items: boxes.map((b) => ({
          set_id: b.set_id,
          quantity: b.quantity,
          fillings: b.fillings,
          addons: b.addons,
          note: b.note,
        })),
      }

      const { data, error } = await supabase.rpc('place_order', { p_payload: payload })
      if (error) throw error
      const result = data as unknown as { id: string; code: string }

      if (acceptNow) {
        // Two calls, not one: place_order always starts an order at
        // pending_confirmation, and bending it into accepting its own orders
        // would put a staff-only branch inside the function the public calls.
        // If this half fails the order still exists and is sitting on the board
        // — visible, recoverable, and reported below rather than swallowed.
        const { error: acceptError } = await supabase.rpc('advance_order', {
          p_order_id: result.id,
          p_to_status: 'accepted',
          p_expected_version: 0,
        })
        if (acceptError) setAcceptWarning(true)
      }

      return result
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.orders('active') })
      void queryClient.invalidateQueries({ queryKey: qk.stockToday })
      // A fresh key, so the next call is a new order rather than a replay of
      // this one.
      setRequestId(crypto.randomUUID())
      setBoxes([])
    },
  })

  if (!sets || !fillings || !addons || !points || !slots || !zones) return <PageSpinner />

  const addonById = new Map(addons.map((a) => [a.id, a]))
  const boxTotal = (b: DraftBox) =>
    (b.price + b.addons.reduce((n, a) => n + Number(addonById.get(a.addon_id)?.price ?? 0) * a.qty, 0)) *
    b.quantity
  const subtotal = boxes.reduce((n, b) => n + boxTotal(b), 0)
  const deliveryFee =
    fulfillment === 'delivery' ? Number(zones.find((z) => z.id === zoneId)?.fee ?? 0) : 0

  const canSubmit =
    boxes.length > 0 &&
    (fulfillment === 'pickup'
      ? Boolean(pointId && slotId && name.trim())
      : Boolean(zoneId && location.trim() && name.trim() && phone.trim()))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 lg:max-w-5xl">
      <h1 className="text-xl font-semibold sm:text-2xl">{t('admin:newTitle')}</h1>

      {place.data && (
        <Card className="border-st-ready-fg p-4">
          <p className="font-medium text-st-ready-fg">
            {t('admin:createdCode', { code: place.data.code })}
          </p>
          {acceptWarning && (
            <p className="mt-1 text-[0.85rem] text-gold-ink">{t('admin:acceptFailed')}</p>
          )}
        </Card>
      )}

      <BoxBuilder
        sets={sets}
        fillings={fillings}
        addons={addons}
        stock={stock}
        onAdd={(box) => setBoxes((prev) => [...prev, box])}
      />

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{t('admin:boxes')}</h2>
        {boxes.length === 0 ? (
          <p className="text-[0.9rem] text-ink-muted">{t('admin:noBoxes')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {boxes.map((b) => (
              <li key={b.key} className="flex items-start gap-3 border-t border-border pt-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">
                    {b.set_name} ×{b.quantity}
                  </p>
                  <p className="text-[0.85rem] break-words text-ink-muted">
                    {b.fillings
                      .map((f) => `${fillings.find((x) => x.id === f.filling_id)?.name} ×${f.qty}`)
                      .join(' · ')}
                  </p>
                  {b.note && (
                    <p className="text-[0.85rem] break-words text-gold-ink">{b.note}</p>
                  )}
                </div>
                <span className="tnum shrink-0">{money.format(boxTotal(b))}</span>
                <button
                  type="button"
                  onClick={() => setBoxes((prev) => prev.filter((x) => x.key !== b.key))}
                  className="min-h-9 shrink-0 px-1 text-[0.85rem] text-ink-muted hover:text-st-cancel-fg"
                >
                  {t('admin:removeBox')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{t('checkout:howToGet')}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Toggle
            on={fulfillment === 'pickup'}
            onClick={() => setFulfillment('pickup')}
            label={t('checkout:pickup')}
          />
          <Toggle
            on={fulfillment === 'delivery'}
            onClick={() => setFulfillment('delivery')}
            label={t('checkout:delivery')}
          />
        </div>

        {fulfillment === 'pickup' ? (
          <>
            <Select
              label={t('checkout:pickupPoint')}
              value={pointId}
              onChange={setPickedPoint}
              options={points.map((p) => ({ value: p.id, label: p.name }))}
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
            {zones.length > 1 && (
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
              required
            />
          </>
        )}

        {/* The name is asked for on both routes, exactly as on the customer's
            checkout: it is what gets called out when the food is ready, and a
            phone order has a name in it whether or not the form asks. */}
        <Input
          label={t('checkout:name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          hint={fulfillment === 'pickup' ? t('common:optional') : undefined}
          required={fulfillment === 'delivery'}
        />
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{t('checkout:payment')}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Toggle on={method === 'cash'} onClick={() => setMethod('cash')} label={t('checkout:cash')} />
          <Toggle
            on={method === 'transfer'}
            onClick={() => setMethod('transfer')}
            label={t('checkout:transfer')}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.9rem] font-medium">{t('checkout:orderNote')}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            className="rounded-btn border border-border-strong bg-surface p-3 text-ink"
          />
        </label>

        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={acceptNow}
            onChange={(e) => setAcceptNow(e.target.checked)}
            className="size-4"
          />
          <span className="text-[0.9rem]">
            {t('admin:acceptNow')}
            <span className="block text-[0.8rem] text-ink-muted">
              {t('admin:acceptNowHelp')}
            </span>
          </span>
        </label>
      </Card>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div>
          <p className="text-[0.75rem] text-ink-muted">{t('checkout:total')}</p>
          <p className="tnum text-lg font-semibold">{money.format(subtotal + deliveryFee)}</p>
        </div>
        <Button
          size="lg"
          className="ms-auto flex-1 sm:flex-none sm:px-8"
          disabled={!canSubmit || place.isPending}
          onClick={() => {
            setAcceptWarning(false)
            place.mutate()
          }}
        >
          {place.isPending ? t('admin:submitting') : t('admin:submitOrder')}
        </Button>
        <Button variant="ghost" size="lg" onClick={() => void navigate('/admin')}>
          {t('admin:board')}
        </Button>
      </Card>

      {place.error && (
        <Card className="border-st-cancel-fg p-4" role="alert">
          <p className="break-words text-st-cancel-fg">{actionError(place.error, t)}</p>
        </Card>
      )}
    </div>
  )
}

/** Composes one box at a time, then hands it up. */
function BoxBuilder({
  sets,
  fillings,
  addons,
  stock,
  onAdd,
}: {
  sets: { id: string; name: string; piece_quota: number; price: number }[]
  fillings: { id: string; name: string; max_per_set: number | null }[]
  addons: { id: string; name: string; price: number; max_qty: number }[]
  stock: Map<string, number> | undefined
  onAdd: (box: DraftBox) => void
}) {
  const { t } = useTranslation(['admin', 'build', 'menu'])
  const [pickedSet, setPickedSet] = useState('')
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [extras, setExtras] = useState<Record<string, number>>({})
  const [quantity, setQuantity] = useState(1)
  const [boxNote, setBoxNote] = useState('')

  const setId = pickedSet || sets[0]?.id || ''
  const set = sets.find((s) => s.id === setId)
  const selected = Object.values(picked).reduce((n, q) => n + q, 0)
  const quota = set?.piece_quota ?? 0
  const remaining = quota - selected

  if (!set) return null

  return (
    <Card className="flex flex-col gap-3 p-4">
      <Select
        label={t('admin:pickSet')}
        value={setId}
        onChange={(v) => {
          setPickedSet(v)
          // A different set has a different quota, so the allocation cannot
          // carry over — silently keeping it would produce a box that fails
          // validation on submit with no obvious cause.
          setPicked({})
        }}
        options={sets.map((s) => ({
          value: s.id,
          label: `${s.name} · ${money.format(Number(s.price))}`,
        }))}
      />

      <p
        aria-live="polite"
        className={[
          'tnum text-[0.9rem]',
          remaining === 0 ? 'font-medium text-st-ready-fg' : 'text-ink-muted',
        ].join(' ')}
      >
        {t('build:chosen', { selected, quota })}
      </p>

      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {fillings.map((f) => {
          const qty = picked[f.id] ?? 0
          const left = stock?.get(f.id) ?? null
          const caps = [qty + remaining]
          if (f.max_per_set !== null) caps.push(f.max_per_set)
          if (left !== null) caps.push(left)
          return (
            <li key={f.id} className="flex flex-col gap-1 rounded-btn border border-border p-2">
              <span className="text-[0.8rem] leading-tight break-words">{f.name}</span>
              <Stepper
                value={qty}
                max={Math.min(...caps)}
                label={f.name}
                disabled={left !== null && left <= 0}
                reason={left !== null && left <= 0 ? t('build:outOfStock') : null}
                onChange={(next) =>
                  setPicked((prev) => {
                    const copy = { ...prev }
                    if (next <= 0) delete copy[f.id]
                    else copy[f.id] = next
                    return copy
                  })
                }
              />
            </li>
          )
        })}
      </ul>

      <ul className="flex flex-col gap-2">
        {addons.map((a) => (
          <li key={a.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 break-words">{a.name}</span>
            <Stepper
              value={extras[a.id] ?? 0}
              max={a.max_qty}
              label={a.name}
              onChange={(next) =>
                setExtras((prev) => {
                  const copy = { ...prev }
                  if (next <= 0) delete copy[a.id]
                  else copy[a.id] = next
                  return copy
                })
              }
            />
          </li>
        ))}
      </ul>

      <Input
        label={t('build:note')}
        value={boxNote}
        onChange={(e) => setBoxNote(e.target.value)}
      />

      <div className="flex flex-wrap items-end gap-3">
        <Stepper value={quantity} min={1} label={set.name} onChange={setQuantity} />
        <Button
          className="ms-auto"
          disabled={selected !== quota}
          onClick={() => {
            onAdd({
              key: crypto.randomUUID(),
              set_id: set.id,
              set_name: set.name,
              price: Number(set.price),
              quantity,
              fillings: Object.entries(picked).map(([filling_id, qty]) => ({ filling_id, qty })),
              addons: Object.entries(extras).map(([addon_id, qty]) => ({ addon_id, qty })),
              note: boxNote.trim() || null,
            })
            setPicked({})
            setExtras({})
            setQuantity(1)
            setBoxNote('')
          }}
        >
          {selected === quota ? t('admin:addBox') : t('build:remaining', { count: remaining })}
        </Button>
      </div>
    </Card>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={[
        'min-h-12 rounded-btn border px-3 text-[0.95rem]',
        on
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
