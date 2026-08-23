import { Link, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

/**
 * Mobile-first customer shell. No large dark areas anywhere: ink is text and
 * button edges, nothing more.
 *
 * The container widens in steps rather than jumping straight from a phone
 * column to a desktop one, because the menu and the set builder both want more
 * cards per row on a tablet than a phone and fewer than a desktop. Individual
 * screens narrow themselves further where reading a single column beats
 * spreading out — the tracking page, for instance.
 *
 * `pb-safe` on the main element is what keeps the last row of a scrolled page
 * clear of the iPhone home indicator; a sticky action bar added by a screen
 * carries its own.
 */
export function CustomerLayout() {
  const { t } = useTranslation(['common', 'tracking'])

  return (
    <div className="min-h-svh bg-ground">
      <header className="sticky top-0 z-30 border-b border-border bg-surface pt-safe">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 sm:py-3">
          <Link to="/" className="text-lg font-semibold whitespace-nowrap">
            {t('common:appName')}
          </Link>

          <div className="ms-auto flex items-center gap-1 sm:gap-2">
            <Link
              to="/my-orders"
              className={[
                'inline-flex min-h-11 items-center rounded-btn px-3',
                'text-[0.9rem] whitespace-nowrap text-gold-ink hover:underline',
              ].join(' ')}
            >
              {t('tracking:myOrders')}
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4 pb-safe sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}
