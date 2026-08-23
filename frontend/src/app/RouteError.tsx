import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/**
 * Doubles as the 404 element. Rendered as a `*` route there is no error to
 * read, which is exactly the "no such page" case.
 */
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()
  const { t } = useTranslation('common')

  const notFound =
    error === undefined || (isRouteErrorResponse(error) && error.status === 404)

  const detail = notFound
    ? t('error.notFound')
    : error instanceof Error
      ? error.message
      : t('error.generic')

  return (
    <div className="mx-auto flex min-h-svh max-w-md items-center px-4 py-6 pb-safe pt-safe sm:px-6">
      <Card className="w-full p-5 sm:p-6">
        <h1 className="text-lg font-semibold">{t('error.title')}</h1>
        <p className="mt-2 text-[0.95rem] break-words text-ink-muted">{detail}</p>
        <Button size="lg" className="mt-5 w-full" onClick={() => void navigate('/')}>
          {t('back')}
        </Button>
      </Card>
    </div>
  )
}
