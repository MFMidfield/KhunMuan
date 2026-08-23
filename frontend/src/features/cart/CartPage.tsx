import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stepper } from '@/components/ui/Stepper'
import { money } from '@/lib/i18n'
import { useAddons, useFillings, useSets } from '@/features/menu/queries'
import { useCart } from './cartContext'

export function CartPage() {
  const { t } = useTranslation(['cart', 'build', 'common'])
  const navigate = useNavigate()
  const cart = useCart()
  const { data: sets, isPending: setsPending } = useSets()
  const { data: fillings, isPending: fillingsPending } = useFillings()
  const { data: addons, isPending: addonsPending } = useAddons()

  if (setsPending || fillingsPending || addonsPending) return <PageSpinner />
  if (!sets || !fillings || !addons) return <PageSpinner />

  if (cart.lines.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-4 p-5">
        <p className="text-ink-muted">{t('cart:empty')}</p>
        <Button onClick={() => void navigate('/')}>{t('cart:emptyAction')}</Button>
      </Card>
    )
  }

  const setById = new Map(sets.map((s) => [s.id, s]))
  const fillingById = new Map(fillings.map((f) => [f.id, f]))
  const addonById = new Map(addons.map((a) => [a.id, a]))

  // Display arithmetic only. The server recomputes every baht at placement, so
  // a menu price that changed under a resting cart corrects itself there.
  const lineTotal = (lineId: string) => {
    const line = cart.lines.find((l) => l.line_id === lineId)!
    const set = setById.get(line.set_id)
    const extras = line.addons.reduce(
      (sum, a) => sum + Number(addonById.get(a.addon_id)?.price ?? 0) * a.qty,
      0,
    )
    return (Number(set?.price ?? 0) + extras) * line.quantity
  }

  const subtotal = cart.lines.reduce((sum, l) => sum + lineTotal(l.line_id), 0)

  return (
    <div className="flex flex-col gap-4 pb-28 lg:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">{t('cart:title')}</h1>
        <p className="tnum text-[0.9rem] text-ink-muted">
          {t('cart:boxes', { count: cart.boxCount })}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {cart.lines.map((line) => {
          const set = setById.get(line.set_id)
          const name = set?.name ?? line.set_id

          return (
            <li key={line.line_id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold break-words">{name}</h2>
                  <span className="tnum shrink-0 font-semibold">
                    {money.format(lineTotal(line.line_id))}
                  </span>
                </div>

                <p className="text-[0.9rem] break-words text-ink-muted">
                  {line.fillings
                    .map((f) => `${fillingById.get(f.filling_id)?.name ?? '?'} ×${f.qty}`)
                    .join(' · ')}
                </p>

                {line.addons.length > 0 && (
                  <p className="text-[0.85rem] break-words text-ink-muted">
                    {line.addons
                      .map((a) => `${addonById.get(a.addon_id)?.name ?? '?'} ×${a.qty}`)
                      .join(' · ')}
                  </p>
                )}

                {line.note && (
                  <p className="text-[0.85rem] break-words text-ink-muted">
                    {t('cart:itemNote')}: {line.note}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Stepper
                    value={line.quantity}
                    min={1}
                    label={name}
                    onChange={(q) => cart.setQuantity(line.line_id, q)}
                  />

                  <Link
                    to={`/build/${line.set_id}?line=${line.line_id}`}
                    className="min-h-11 content-center px-2 text-[0.9rem] text-gold-ink hover:underline"
                  >
                    {t('common:edit')}
                  </Link>

                  <button
                    type="button"
                    onClick={() => cart.remove(line.line_id)}
                    aria-label={t('cart:removeLine', { name })}
                    className="ms-auto min-h-11 px-2 text-[0.9rem] text-ink-muted hover:text-st-cancel-fg"
                  >
                    {t('common:remove')}
                  </button>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>

      <div
        className={[
          'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface',
          'px-4 pt-3 pb-safe lg:static lg:border-0 lg:bg-transparent lg:px-0',
        ].join(' ')}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3 pb-3 lg:pb-0">
          <div>
            <p className="text-[0.75rem] text-ink-muted">{t('cart:subtotal')}</p>
            <p className="tnum text-lg font-semibold">{money.format(subtotal)}</p>
          </div>
          <Button
            size="lg"
            className="ms-auto flex-1 sm:flex-none sm:px-8"
            onClick={() => void navigate('/checkout')}
          >
            {t('cart:checkout')}
          </Button>
        </div>
      </div>
    </div>
  )
}
