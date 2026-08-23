import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/useSession'
import { useCurrentAdmin } from '@/features/auth/useCurrentAdmin'
import { PageSpinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'

/**
 * Route guard for /admin/*.
 *
 * This is convenience, not security. Anyone can edit their way past a React
 * router; nobody edits their way past RLS. The guard exists so a wrong account
 * gets a clear Thai sentence instead of a screen full of empty tables.
 */
export function RequireAdmin({ superadminOnly = false }: { superadminOnly?: boolean }) {
  const { session, loading: sessionLoading } = useSession()
  const email = session?.user.email
  const { data: admin, isPending, isError } = useCurrentAdmin(email)
  const { t } = useTranslation('admin')
  const location = useLocation()

  if (sessionLoading) return <PageSpinner />
  if (!session) return <Navigate to="/admin/login" replace state={{ from: location }} />
  if (isPending) return <PageSpinner />

  // An error here is almost always "signed in, not on the allow-list": the
  // lookup itself is denied. Treat it the same as no row.
  const authorised = !isError && admin !== null && admin.is_active

  if (!authorised) {
    return (
      <NoAccess
        title={t('noAccess')}
        detail={t('noAccessDetail')}
        email={email}
        actionLabel={t('signOut')}
      />
    )
  }

  if (superadminOnly && admin.role !== 'superadmin') {
    return (
      <NoAccess
        title={t('noAccess')}
        detail={t('superadminOnly')}
        email={email}
        actionLabel={t('signOut')}
      />
    )
  }

  return <Outlet />
}

function NoAccess({
  title,
  detail,
  email,
  actionLabel,
}: {
  title: string
  detail: string
  email: string | undefined
  actionLabel: string
}) {
  return (
    <div className="mx-auto flex min-h-svh max-w-md items-center px-4 py-6 pb-safe pt-safe sm:px-6">
      <Card className="w-full p-5 sm:p-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-[0.95rem] text-ink-muted">{detail}</p>
        {email && (
          <p className="tnum mt-3 text-[0.85rem] break-all text-ink-muted">{email}</p>
        )}
        <Button
          variant="secondary"
          size="lg"
          className="mt-5 w-full"
          onClick={() => void supabase.auth.signOut()}
        >
          {actionLabel}
        </Button>
      </Card>
    </div>
  )
}
