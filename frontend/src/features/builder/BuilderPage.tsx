import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { Stepper } from '@/components/ui/Stepper'
import { MenuImage } from '@/components/ui/MenuImage'
import { money } from '@/lib/i18n'
import { useAddons, useFillings, useSets, useStockToday } from '@/features/menu/queries'
import { useCart } from '@/features/cart/cartContext'
import type { AddonRow, FillingRow } from '@/features/menu/queries'

/**
 * The screen where failure mode #2 — wrong filling — is either prevented or
 * created. Doc 04 §2.
 *
 * Two rules drive most of what follows:
 *
 *   Nothing is hidden. A filling that ran out is dimmed and labelled, never
 *   removed. A customer who cannot find yesterday's favourite assumes the app
 *   is broken; one who sees it greyed out understands instantly.
 *
 *   Nothing goes dead silently. Every disabled control says why, in the same
 *   place the customer is already looking.
 */
export function BuilderPage() {
  const { setId } = useParams<{ setId: string }>()
  const [params] = useSearchParams()
  const editingLineId = params.get('line')
  const navigate = useNavigate()
  const { t } = useTranslation(['build', 'menu', 'common'])

  const { data: sets, isPending: setsPending } = useSets()
  const { data: fillings, isPending: fillingsPending } = useFillings()
  const { data: addons, isPending: addonsPending } = useAddons()
  const { data: stock } = useStockToday()
  const cart = useCart()

  const editing = editingLineId ? cart.find(editingLineId) : undefined

  const [picked, setPicked] = useState<Record<string, number>>(
    () => Object.fromEntries((editing?.fillings ?? []).map((f) => [f.filling_id, f.qty])),
  )
  const [extras, setExtras] = useState<Record<string, number>>(
    () => Object.fromEntries((editing?.addons ?? []).map((a) => [a.addon_id, a.qty])),
  )
  const [note, setNote] = useState(editing?.note ?? '')

  const set = sets?.find((s) => s.id === setId)
  const selected = useMemo(
    () => Object.values(picked).reduce((n, q) => n + q, 0),
    [picked],
  )

  if (setsPending || fillingsPending || addonsPending) return <PageSpinner />
  if (!set) return <Card className="p-5 text-ink-muted">{t('build:setNotFound')}</Card>

  const quota = set.piece_quota
  const remaining = quota - selected
  const addonTotal = (addons ?? []).reduce(
    (sum, a) => sum + Number(a.price) * (extras[a.id] ?? 0),
    0,
  )

  const chosenChips = (fillings ?? [])
    .filter((f) => (picked[f.id] ?? 0) > 0)
    .map((f) => ({ filling: f, qty: picked[f.id]! }))

  function setFilling(id: string, qty: number) {
    setPicked((prev) => {
      const next = { ...prev }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }

  function submit() {
    const line = {
      set_id: set!.id,
      quantity: editing?.quantity ?? 1,
      fillings: Object.entries(picked).map(([filling_id, qty]) => ({ filling_id, qty })),
      addons: Object.entries(extras)
        .filter(([, qty]) => qty > 0)
        .map(([addon_id, qty]) => ({ addon_id, qty })),
      note: note.trim() === '' ? null : note.trim(),
    }
    if (editingLineId) cart.replace(editingLineId, line)
    else cart.add(line)
    void navigate('/cart')
  }

  const sauces = (addons ?? []).filter((a) => a.kind === 'sauce')
  const utensils = (addons ?? []).filter((a) => a.kind !== 'sauce')

  return (
    <div className="flex flex-col gap-4 pb-28 lg:pb-0">
      {/* Sticky quota header. It never scrolls away, because the one number the
          customer must not lose track of is how many pieces are left. */}
      <div className="sticky top-14 z-20 -mx-4 bg-ground px-4 py-3">
        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-semibold">{set.name}</h1>
            <p
              aria-live="polite"
              className={[
                'tnum text-[0.95rem]',
                remaining === 0 ? 'font-medium text-st-ready-fg' : 'text-ink-muted',
              ].join(' ')}
            >
              {t('build:chosen', { selected, quota })}
            </p>
          </div>

          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="presentation"
          >
            <div
              className={[
                'h-full rounded-full transition-[width] duration-200',
                selected > quota ? 'bg-st-cancel-fg' : 'bg-gold-fill',
              ].join(' ')}
              style={{ width: `${Math.min(100, (selected / quota) * 100)}%` }}
            />
          </div>

          {chosenChips.length > 0 && (
            <>
              <ul className="mt-3 flex flex-wrap gap-2">
                {chosenChips.map(({ filling, qty }) => (
                  <li key={filling.id}>
                    <button
                      type="button"
                      onClick={() => setFilling(filling.id, qty - 1)}
                      aria-label={t('menu:stepper.decrease', { label: filling.name })}
                      className={[
                        'inline-flex min-h-9 items-center gap-1.5 rounded-full',
                        'border border-border-strong bg-surface-2 px-3',
                        'text-[0.85rem] text-ink',
                      ].join(' ')}
                    >
                      <span className="max-w-40 truncate">{filling.name}</span>
                      <span className="tnum font-medium">×{qty}</span>
                      <span aria-hidden="true" className="text-ink-muted">
                        ×
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[0.75rem] text-ink-muted">
                {t('build:tapChipToRemove')}
              </p>
            </>
          )}
        </Card>
      </div>

      <Section title={t('build:fillings')}>
        {/* 2 per row on a phone — a 1:1 photo plus a stepper needs the width. */}
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {(fillings ?? []).map((filling) => (
            <li key={filling.id}>
              <FillingCard
                filling={filling}
                qty={picked[filling.id] ?? 0}
                stockLeft={stock?.get(filling.id) ?? null}
                quotaLeft={remaining}
                onChange={(q) => setFilling(filling.id, q)}
              />
            </li>
          ))}
        </ul>
      </Section>

      {sauces.length > 0 && (
        <Section title={t('build:sauces')}>
          <AddonList addons={sauces} values={extras} onChange={setExtras} />
        </Section>
      )}

      {utensils.length > 0 && (
        <Section title={t('build:utensils')}>
          <AddonList addons={utensils} values={extras} onChange={setExtras} />
        </Section>
      )}

      <Section title={t('build:note')}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t('build:notePlaceholder')}
          className={[
            'w-full rounded-btn border border-border-strong bg-surface p-3',
            'text-ink placeholder:text-ink-muted',
          ].join(' ')}
        />
      </Section>

      {/* Sticky action bar. On a phone this is the only place the primary
          action lives, sitting above the home indicator where a thumb is. */}
      <div
        className={[
          'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface',
          'px-4 pt-3 pb-safe lg:static lg:border-0 lg:bg-transparent lg:px-0',
        ].join(' ')}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3 pb-3 lg:pb-0">
          <div className="min-w-0">
            <p className="text-[0.75rem] text-ink-muted">{t('build:boxTotal')}</p>
            <p className="tnum text-lg font-semibold">
              {money.format(Number(set.price) + addonTotal)}
            </p>
          </div>

          <Button
            size="lg"
            className="ms-auto flex-1 sm:flex-none sm:px-8"
            disabled={selected !== quota}
            onClick={submit}
          >
            {/* A disabled button that does not say what is missing is a dead
                end, so the label carries the reason. */}
            {selected === quota
              ? editingLineId
                ? t('build:saveChanges')
                : t('build:addToCart')
              : selected < quota
                ? t('build:remaining', { count: remaining })
                : t('build:over', { count: -remaining })}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[0.95rem] font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function FillingCard({
  filling,
  qty,
  stockLeft,
  quotaLeft,
  onChange,
}: {
  filling: FillingRow
  qty: number
  /** null means no stock row today, which the server treats as unlimited. */
  stockLeft: number | null
  quotaLeft: number
  onChange: (qty: number) => void
}) {
  const { t } = useTranslation(['build', 'menu'])

  const soldOut = stockLeft !== null && stockLeft <= 0
  // The cap the customer will actually hit first, out of three possible ones.
  const caps = [qty + quotaLeft]
  if (filling.max_per_set !== null) caps.push(filling.max_per_set)
  if (stockLeft !== null) caps.push(stockLeft)
  const max = Math.min(...caps)

  const reason =
    soldOut ? t('build:outOfStock')
    : filling.max_per_set !== null && qty >= filling.max_per_set
      ? t('build:maxPerSet', { count: filling.max_per_set })
    : stockLeft !== null && qty >= stockLeft
      ? t('build:stockLeft', { count: stockLeft })
    : quotaLeft <= 0
      ? t('build:quotaFull')
      : null

  return (
    <Card className={['relative flex h-full flex-col p-2', soldOut ? 'opacity-55' : ''].join(' ')}>
      <div className="relative">
        <MenuImage path={filling.image_path} alt={filling.name} />
        {soldOut && (
          <span
            className={[
              'absolute inset-x-1 bottom-1 rounded-btn bg-ink/80 px-2 py-1',
              'text-center text-[0.75rem] font-medium text-ground',
            ].join(' ')}
          >
            {t('menu:soldOutToday')}
          </span>
        )}
      </div>

      <p className="mt-2 min-h-10 text-[0.85rem] leading-tight break-words">
        {filling.name}
      </p>

      <div className="mt-auto pt-1">
        <Stepper
          value={qty}
          onChange={onChange}
          max={max}
          disabled={soldOut}
          label={filling.name}
          reason={reason}
        />
      </div>
    </Card>
  )
}

function AddonList({
  addons,
  values,
  onChange,
}: {
  addons: AddonRow[]
  values: Record<string, number>
  onChange: (next: Record<string, number>) => void
}) {
  return (
    <ul className="flex flex-col gap-2">
      {addons.map((addon) => (
        <li key={addon.id}>
          <Card className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="break-words">{addon.name}</p>
              {Number(addon.price) > 0 && (
                <p className="tnum text-[0.85rem] text-gold-ink">
                  +{money.format(Number(addon.price))}
                </p>
              )}
            </div>

            <Stepper
              value={values[addon.id] ?? 0}
              max={addon.max_qty}
              label={addon.name}
              onChange={(qty) => {
                const next = { ...values }
                if (qty <= 0) delete next[addon.id]
                else next[addon.id] = qty
                onChange(next)
              }}
            />
          </Card>
        </li>
      ))}
    </ul>
  )
}
