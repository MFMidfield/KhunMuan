import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Campus wifi drops mid-shift. `navigator.onLine` is a weak signal — it goes
 * true the moment there is *a* network, connected to the internet or not — so
 * this is a hint and never a gate. Nothing is disabled while it shows; the
 * board's own connection dot is the authority on whether data is live.
 */
export function OfflineBanner() {
  const { t } = useTranslation('common')
  const [offline, setOffline] = useState(() => !navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      className={[
        'sticky top-0 z-50 bg-st-cancel-bg px-4 py-2 text-center',
        'text-[0.85rem] font-medium text-st-cancel-fg',
      ].join(' ')}
    >
      {t('error.offline')}
    </div>
  )
}
