import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/lib/theme'
import { useCart } from '@/features/cart/cartContext'

/**
 * Mobile-first customer shell. No large dark areas anywhere: ink is text and
 * button edges, nothing more.
 *
 * The header carries two things and no more — the wordmark, and the button that
 * opens the side nav. Everything else that used to sit up there (cart, my
 * orders, the theme toggle) lives in the drawer now, which leaves the top of a
 * 360px screen legible instead of holding four competing controls.
 *
 * The drawer is one behaviour at every width rather than a drawer on a phone
 * and a permanent rail on a desktop. A permanent rail would take a column out
 * of every customer screen, and those screens — the builder grid, the checkout
 * summary — were laid out against the full container width.
 *
 * `pb-safe` on the main element is what keeps the last row of a scrolled page
 * clear of the iPhone home indicator; a sticky action bar added by a screen
 * carries its own.
 */
export function CustomerLayout() {
  const { t } = useTranslation(['common', 'cart'])
  const { boxCount } = useCart()
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="min-h-svh bg-ground">
      <header className="sticky top-0 z-30 border-b border-border bg-surface pt-safe">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 sm:py-3">
          <Link to="/" className="text-lg font-semibold whitespace-nowrap">
            {t('common:appName')}
          </Link>

          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-expanded={navOpen}
            aria-label={t('common:nav.open')}
            className={[
              'relative ms-auto inline-flex size-11 items-center justify-center rounded-full',
              'border border-border bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink',
            ].join(' ')}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>

            {/* The cart count rides the menu button. Folding the cart into the
                drawer would otherwise hide the one piece of state a customer
                needs at a glance — that they have something waiting in it. */}
            {boxCount > 0 && <CountBadge count={boxCount} />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4 pb-safe sm:py-6">
        <Outlet />
      </main>

      {navOpen && <SideNav onClose={() => setNavOpen(false)} boxCount={boxCount} />}
    </div>
  )
}

function CountBadge({ count }: { count: number }) {
  return (
    <span
      className={[
        'tnum absolute -end-0.5 -top-0.5 min-w-5 rounded-full px-1',
        'border-[1.5px] border-gold-edge bg-gold-fill',
        'text-center text-[0.7rem] leading-4 font-semibold text-ink',
      ].join(' ')}
    >
      {count}
    </span>
  )
}

/**
 * The drawer itself. Slides in from the end side, which is the side the button
 * that opened it is on — a panel that appears away from the thumb that summoned
 * it reads as a different surface arriving rather than the same one expanding.
 */
function SideNav({ onClose, boxCount }: { onClose: () => void; boxCount: number }) {
  const { t } = useTranslation(['common', 'cart', 'tracking'])
  const { resolved, toggle } = useTheme()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // The page behind a full-height drawer must not scroll under it. Restored
    // to whatever it was rather than to '', so a screen that sets its own
    // overflow while a sheet is open does not lose it here.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const themeLabel = resolved === 'dark' ? t('common:theme.toLight') : t('common:theme.toDark')

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={t('common:close')}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('common:nav.title')}
        className={[
          'absolute inset-y-0 end-0 flex w-72 max-w-[85vw] flex-col',
          'border-s border-border bg-surface pt-safe pb-safe',
        ].join(' ')}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <span className="ps-1 font-semibold">{t('common:nav.title')}</span>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('common:close')}
            className={[
              'ms-auto inline-flex size-11 items-center justify-center rounded-full',
              'text-ink-muted hover:bg-surface-2 hover:text-ink',
            ].join(' ')}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col">
            <NavItem
              to="/menu"
              onNavigate={onClose}
              label={t('common:nav.menu')}
              icon={
                <>
                  <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
                  <path d="M7.5 9h9M7.5 13h6" />
                </>
              }
            />

            <NavItem
              to="/cart"
              onNavigate={onClose}
              label={t('cart:title')}
              count={boxCount}
              icon={
                <>
                  <path d="M4 5h2l2.2 9.5a1.5 1.5 0 0 0 1.5 1.2h7.1a1.5 1.5 0 0 0 1.5-1.2L20 8H6.4" />
                  <circle cx="10" cy="19.5" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="17" cy="19.5" r="1.2" fill="currentColor" stroke="none" />
                </>
              }
            />

            <NavItem
              to="/my-orders"
              onNavigate={onClose}
              label={t('tracking:myOrders')}
              icon={
                <>
                  <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
                  <path d="M8.5 8.5h7M8.5 12.5h7M8.5 16.5h4" />
                </>
              }
            />
          </ul>
        </nav>

        <div className="border-t border-border p-2">
          {/* A row, not the round ThemeToggle button: inside a list of rows a
              44px circle reads as a stray control. Same action, same label. */}
          <button
            type="button"
            onClick={toggle}
            className={[
              'flex min-h-11 w-full items-center gap-3 rounded-btn px-3',
              'text-start text-ink-muted hover:bg-surface-2 hover:text-ink',
            ].join(' ')}
          >
            <NavIcon>
              {resolved === 'dark' ? (
                <>
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4" />
                  <path d="M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
                </>
              ) : (
                <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7Z" />
              )}
            </NavIcon>
            <span>{themeLabel}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function NavItem({
  to,
  label,
  icon,
  count,
  onNavigate,
}: {
  to: string
  label: string
  icon: ReactNode
  count?: number
  onNavigate: () => void
}) {
  return (
    <li>
      <NavLink
        to={to}
        // Closing on the tap rather than by watching the pathname, the same way
        // the back office's "more" sheet does: the tap is the event, and a
        // navigation that does not change the path would otherwise leave the
        // drawer hanging open over the page it just took you to.
        onClick={onNavigate}
        className={({ isActive }) =>
          [
            'flex min-h-11 items-center gap-3 rounded-btn px-3',
            isActive
              ? 'bg-surface-2 font-medium text-ink'
              : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
          ].join(' ')
        }
      >
        <NavIcon>{icon}</NavIcon>
        <span className="flex-1 break-words">{label}</span>
        {count !== undefined && count > 0 && (
          <span
            className={[
              'tnum min-w-5 rounded-full px-1 text-center text-[0.7rem] leading-5 font-semibold',
              'border-[1.5px] border-gold-edge bg-gold-fill text-ink',
            ].join(' ')}
          >
            {count}
          </span>
        )}
      </NavLink>
    </li>
  )
}

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}
