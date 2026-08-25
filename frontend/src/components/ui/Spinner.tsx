import { useTranslation } from 'react-i18next'

export function Spinner({ className = '' }: { className?: string }) {
  const { t } = useTranslation('common')
  return (
    <span
      role="status"
      aria-label={t('loading')}
      className={[
        'inline-block size-5 animate-spin rounded-full',
        'border-2 border-border-strong border-t-ink',
        className,
      ].join(' ')}
    />
  )
}

export function PageSpinner() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Spinner />
    </div>
  )
}
