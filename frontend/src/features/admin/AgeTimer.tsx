import { useTranslation } from 'react-i18next'
import { useNow } from '@/lib/useNow'

/**
 * Counts up from created_at, amber past 10 minutes, red past 20.
 *
 * This is the entire defence against dropped orders: a card that has been
 * sitting has to *look* wrong from across the kitchen. The colours are the only
 * warm tones anywhere in the interface, which is exactly why they read as an
 * alarm — everything else, including every status chip, is cool.
 */
export function AgeTimer({ createdAt }: { createdAt: string }) {
  const { t } = useTranslation('admin')
  const now = useNow()
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000))

  const tone =
    minutes >= 20
      ? 'text-st-cancel-fg font-semibold'
      : minutes >= 10
        ? 'text-gold-ink font-medium'
        : 'text-ink-muted'

  return (
    <span className={`tnum text-[0.85rem] whitespace-nowrap ${tone}`}>
      {t('minutes', { count: minutes })}
    </span>
  )
}
