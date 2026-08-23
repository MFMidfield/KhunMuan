import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import type { th } from '@/lib/locales/th'

type RouteKey = keyof typeof th.common.routes

/**
 * Route shells for screens that land in a later phase. They exist now so the
 * router, the guards and the navigation are exercised end to end rather than
 * being wired up blind when the screen arrives.
 *
 * Note the titleKey: no string literal reaches JSX anywhere in this app, not
 * even in a placeholder, because that is exactly where they survive to ship.
 */
export function Placeholder({ titleKey, phase }: { titleKey: RouteKey; phase: number }) {
  const { t } = useTranslation('common')
  return (
    <Card className="p-5 sm:p-6">
      <h1 className="text-lg font-semibold sm:text-xl">{t(`routes.${titleKey}`)}</h1>
      <p className="mt-2 text-[0.9rem] text-ink-muted">{t('comingIn', { phase })}</p>
    </Card>
  )
}
