import { useTranslation } from 'react-i18next'
import { useTheme } from '@/lib/theme'

/** Both surfaces carry one. The kitchen works under varying light. */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  const { t } = useTranslation('common')
  const label = resolved === 'dark' ? t('theme.toLight') : t('theme.toDark')

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={[
        'inline-flex size-11 items-center justify-center rounded-full',
        'border border-border bg-surface text-ink-muted',
        'hover:text-ink hover:bg-surface-2',
      ].join(' ')}
    >
      {resolved === 'dark' ? (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4" />
            <path d="M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <path
            fill="currentColor"
            d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7Z"
          />
        </svg>
      )}
    </button>
  )
}
