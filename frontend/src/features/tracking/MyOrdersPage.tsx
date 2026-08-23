import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { dayAndMonth, timeOfDay } from '@/lib/i18n'
import { readMyOrders } from './myOrders'

/** Characters the alphabet deliberately excludes, because people misread them. */
const EXCLUDED = /[ILO01]/

export function MyOrdersPage() {
  const { t } = useTranslation(['tracking', 'common'])
  const navigate = useNavigate()
  const orders = useMemo(() => readMyOrders(), [])
  const [code, setCode] = useState('')
  const [hint, setHint] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const clean = code.toUpperCase().replace(/\s/g, '')
    // Rejected with a hint rather than silently corrected: guessing a user's
    // intent on an access key is worse than asking.
    if (EXCLUDED.test(clean)) {
      setHint(t('tracking:lookupBadChar'))
      return
    }
    if (clean.length >= 4) void navigate(`/o/${clean}`)
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <div>
          <h1 className="font-semibold">{t('tracking:lookupTitle')}</h1>
          <p className="text-[0.85rem] text-ink-muted">{t('tracking:lookupHelp')}</p>
        </div>

        <form onSubmit={submit} className="flex flex-wrap items-start gap-2">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setHint(null)
            }}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={6}
            aria-label={t('tracking:codeLabel')}
            aria-invalid={hint ? true : undefined}
            className={[
              'tnum min-h-12 w-40 flex-1 rounded-btn border px-3',
              'text-center text-2xl tracking-[0.3em] uppercase',
              hint ? 'border-st-cancel-fg' : 'border-border-strong',
              'bg-surface text-ink',
            ].join(' ')}
          />
          <Button type="submit" size="lg" disabled={code.trim().length < 4}>
            {t('tracking:lookupSubmit')}
          </Button>
        </form>

        {hint && (
          <p role="alert" className="text-[0.85rem] text-st-cancel-fg">
            {hint}
          </p>
        )}
      </Card>

      <h2 className="px-1 font-semibold">{t('tracking:myOrders')}</h2>

      {orders.length === 0 ? (
        <Card className="p-5 text-ink-muted">{t('tracking:myOrdersEmpty')}</Card>
      ) : (
        <ul className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
          {orders.map((o) => {
            const at = new Date(o.created_at)
            return (
              <li key={o.code}>
                <Link to={`/o/${o.code}`} className="block">
                  <Card className="flex items-center justify-between gap-3 p-4">
                    <span className="tnum text-xl font-semibold tracking-wide">{o.code}</span>
                    <span className="text-[0.85rem] text-ink-muted">
                      {dayAndMonth.format(at)} · {timeOfDay.format(at)}
                    </span>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
