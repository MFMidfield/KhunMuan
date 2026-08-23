import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { MenuImage } from '@/components/ui/MenuImage'
import { money } from '@/lib/i18n'
import { useSets, useShopSettings } from './queries'

/** 1 set card per row on a phone, 2 on a tablet, 3 on a desktop. */
export function MenuPage() {
  const { t } = useTranslation(['menu', 'common'])
  const { data: settings } = useShopSettings()
  const { data: sets, isPending, error } = useSets()

  if (isPending) return <PageSpinner />
  if (error) {
    return (
      <Card className="p-5">
        <p className="break-words text-st-cancel-fg">{error.message}</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {settings && !settings.is_open && (
        <Card className="border-border-strong bg-surface-2 p-4">
          <p className="font-medium">{t('menu:closed')}</p>
          <p className="mt-1 text-[0.9rem] text-ink-muted">
            {settings.closed_message ?? t('menu:closedDefault')}
          </p>
        </Card>
      )}

      <h1 className="text-xl font-semibold sm:text-2xl">{t('menu:title')}</h1>

      {sets.length === 0 ? (
        <Card className="p-5 text-ink-muted">{t('menu:empty')}</Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((set) => (
            <li key={set.id}>
              <Card className="flex h-full flex-col overflow-hidden">
                <MenuImage path={set.image_path} alt={set.name} className="rounded-none" />

                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div>
                    <h2 className="font-semibold">{set.name}</h2>
                    <p className="text-[0.85rem] text-ink-muted">
                      {t('menu:pieces', { count: set.piece_quota })}
                    </p>
                  </div>

                  {set.description && (
                    <p className="text-[0.9rem] break-words text-ink-muted">
                      {set.description}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                    <span className="tnum text-lg font-semibold">
                      {money.format(Number(set.price))}
                    </span>

                    {/* A Link, not a Button with onClick: it is a navigation,
                        so it must open in a new tab and be keyboard-focusable
                        like every other link on the page. */}
                    <Link
                      to={`/build/${set.id}`}
                      className={[
                        'inline-flex min-h-11 items-center justify-center rounded-btn px-4',
                        'border-[1.5px] border-gold-edge bg-gold-fill font-medium text-ink',
                        'hover:bg-gold-hover',
                      ].join(' ')}
                    >
                      {t('menu:choose')}
                    </Link>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
