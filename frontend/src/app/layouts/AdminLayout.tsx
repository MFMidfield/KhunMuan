import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/features/auth/useSession'
import { useCurrentAdmin } from '@/features/auth/useCurrentAdmin'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Button } from '@/components/ui/Button'
import {
  MORE_ICON,
  PRIMARY_LINKS,
  SECONDARY_LINKS,
  visibleLinks,
  type AdminLink,
} from './adminNav'

/**
 * Mobile-first shell.
 *
 *   phone   sticky header + a fixed bottom tab bar. The three links a cook uses
 *           mid-shift get a thumb-reachable tab each; the owner's four sit
 *           behind one sheet. Nothing important is at the top of a phone screen
 *           where a hand holding a basket cannot reach it.
 *   tablet  the same bottom bar, wider content, two-column board.
 *   desktop the bar disappears and every link moves inline into the header,
 *           where a mouse is already travelling.
 */
export function AdminLayout() {
  const { t } = useTranslation(['admin', 'common'])
  const { session } = useSession()
  const { data: admin } = useCurrentAdmin(session?.user.email)
  const isSuper = admin?.role === 'superadmin'
  const [moreOpen, setMoreOpen] = useState(false)

  const primary = visibleLinks(PRIMARY_LINKS, isSuper)
  const secondary = visibleLinks(SECONDARY_LINKS, isSuper)

  return (
    <div className="min-h-svh bg-ground">
      <header className="sticky top-0 z-30 border-b border-border bg-surface pt-safe">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 lg:py-3">
          <span className="font-semibold whitespace-nowrap">{t('common:appName')}</span>

          {/* Inline nav is desktop-only: on a phone these same links are tabs. */}
          <nav className="hidden lg:flex lg:flex-wrap lg:items-center lg:gap-1">
            {[...primary, ...secondary].map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  [
                    'rounded-btn px-3 py-2 text-[0.9rem]',
                    isActive
                      ? 'bg-surface-2 font-medium text-ink'
                      : 'text-ink-muted hover:text-ink',
                  ].join(' ')
                }
              >
                {t(`admin:${l.key}`)}
              </NavLink>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            {admin && (
              <span className="hidden max-w-32 truncate text-[0.85rem] text-ink-muted sm:inline">
                {admin.display_name}
              </span>
            )}
            <ThemeToggle />
            <Button
              variant="ghost"
              className="hidden lg:inline-flex"
              onClick={() => void supabase.auth.signOut()}
            >
              {t('admin:signOut')}
            </Button>
          </div>
        </div>
      </header>

      {/* pb-tabbar keeps the last card clear of the fixed bar; lg drops it. */}
      <main className="mx-auto max-w-7xl px-3 py-4 pb-tabbar sm:px-4 lg:py-6 lg:pb-6">
        <Outlet />
      </main>

      <TabBar
        primary={primary}
        moreOpen={moreOpen}
        onToggleMore={() => setMoreOpen((v) => !v)}
      />

      {moreOpen && <MoreSheet links={secondary} onClose={() => setMoreOpen(false)} />}
    </div>
  )
}

// The "more" tab is always present, even for a plain admin whose sheet holds
// nothing but sign-out. Without it there is no way off a phone at all: the
// inline sign-out button is desktop-only.
function TabBar({
  primary,
  moreOpen,
  onToggleMore,
}: {
  primary: AdminLink[]
  moreOpen: boolean
  onToggleMore: () => void
}) {
  const { t } = useTranslation('admin')

  return (
    <nav
      className={[
        'fixed inset-x-0 bottom-0 z-40 lg:hidden',
        'border-t border-border bg-surface pb-safe',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-lg">
        {primary.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              [
                'flex min-h-16 flex-1 flex-col items-center justify-center gap-1',
                'px-1 text-[0.72rem]',
                isActive ? 'font-medium text-ink' : 'text-ink-muted',
              ].join(' ')
            }
          >
            {l.icon}
            <span className="truncate">{t(l.key)}</span>
          </NavLink>
        ))}

        <button
          type="button"
          onClick={onToggleMore}
          aria-expanded={moreOpen}
          className={[
            'flex min-h-16 flex-1 flex-col items-center justify-center gap-1',
            'px-1 text-[0.72rem]',
            moreOpen ? 'font-medium text-ink' : 'text-ink-muted',
          ].join(' ')}
        >
          {MORE_ICON}
          <span className="truncate">{t('more')}</span>
        </button>
      </div>
    </nav>
  )
}

function MoreSheet({ links, onClose }: { links: AdminLink[]; onClose: () => void }) {
  const { t } = useTranslation(['admin', 'common'])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label={t('common:close')}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('admin:moreTitle')}
        className={[
          'absolute inset-x-0 bottom-0 rounded-t-card border-t border-border',
          'bg-surface px-3 pt-3 pb-tabbar',
        ].join(' ')}
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong"
        />

        <ul className="flex flex-col">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                end={l.end}
                // Closing here rather than watching the URL: the tap is the
                // event, and a navigation that does not change the path would
                // otherwise leave the sheet hanging over the screen.
                onClick={onClose}
                className={({ isActive }) =>
                  [
                    'flex min-h-14 items-center gap-3 rounded-btn px-3',
                    isActive ? 'bg-surface-2 font-medium text-ink' : 'text-ink',
                  ].join(' ')
                }
              >
                {l.icon}
                {t(`admin:${l.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>

        <Button
          variant="ghost"
          size="lg"
          className="mt-2 w-full"
          onClick={() => void supabase.auth.signOut()}
        >
          {t('admin:signOut')}
        </Button>
      </div>
    </div>
  )
}
