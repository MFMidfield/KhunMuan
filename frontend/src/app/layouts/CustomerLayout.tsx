import { Link, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useCart } from '@/features/cart/cartContext'

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
  const { t } = useTranslation(['common', 'tracking', 'cart'])
  const { boxCount } = useCart()

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

            <Link
              to="/cart"
              aria-label={t('cart:title')}
              className={[
                'relative inline-flex size-11 items-center justify-center rounded-full',
                'border border-border bg-surface text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none"
                   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                   strokeLinejoin="round">
                <path d="M4 5h2l2.2 9.5a1.5 1.5 0 0 0 1.5 1.2h7.1a1.5 1.5 0 0 0 1.5-1.2L20 8H6.4" />
                <circle cx="10" cy="19.5" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="17" cy="19.5" r="1.2" fill="currentColor" stroke="none" />
              </svg>

              {boxCount > 0 && (
                <span
                  className={[
                    'tnum absolute -end-0.5 -top-0.5 min-w-5 rounded-full px-1',
                    'border-[1.5px] border-gold-edge bg-gold-fill',
                    'text-center text-[0.7rem] leading-4 font-semibold text-ink',
                  ].join(' ')}
                >
                  {boxCount}
                </span>
              )}
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
