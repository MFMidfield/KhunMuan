import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/features/auth/useSession'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export function LoginPage() {
  const { t } = useTranslation(['admin', 'common'])
  const { session, loading } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <PageSpinner />
  if (session) return <Navigate to="/admin" replace />

  async function signIn() {
    setBusy(true)
    setError(null)
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/admin`,
        // Force the account chooser. Without it Google silently reuses whichever
        // account the browser signed in with last, which on a shared shop laptop
        // — or on a phone with a personal and a shop account — means being
        // refused with no clue why, and no obvious way to pick the other one.
        queryParams: { prompt: 'select_account' },
      },
    })
    if (authError) {
      setError(authError.message)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-5 px-4 py-6 pb-safe pt-safe sm:gap-6 sm:px-6">
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">{t('common:appName')}</span>
        <ThemeToggle />
      </div>

      <Card className="p-5 sm:p-6">
        <h1 className="text-xl font-semibold">{t('admin:board')}</h1>
        <p className="mt-2 text-[0.95rem] text-ink-muted">{t('admin:noAccessDetail')}</p>

        <Button size="lg" className="mt-6 w-full" disabled={busy} onClick={() => void signIn()}>
          {busy ? t('admin:signingIn') : t('admin:signIn')}
        </Button>

        {error && (
          <p role="alert" className="mt-3 text-[0.85rem] text-st-cancel-fg">
            {error}
          </p>
        )}
      </Card>

      {/* The way out. This screen sits outside both layouts — no customer
          header, no admin tab bar — so without this link a customer who tapped
          the footer entrance out of curiosity has nothing but the browser's
          back button, and someone who just signed out lands here stranded. */}
      <Link
        to="/"
        className={[
          'inline-flex min-h-11 items-center justify-center gap-2 self-center',
          'rounded-btn px-3 text-[0.9rem] text-gold-ink hover:underline',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4 shrink-0 rtl:-scale-x-100"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {t('common:backToShop')}
      </Link>
    </div>
  )
}
