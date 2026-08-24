import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * The shell every dialog in the app sits in.
 *
 * It exists because there were three of these, written separately, already
 * drifting: one had a scroll cap and two did not, and none of them locked the
 * body underneath. A dialog is the one component where "roughly the same" is
 * expensive — it traps attention, and every difference in how it opens, closes
 * or scrolls is a difference someone has to learn twice.
 *
 * Centred at every width. A bottom sheet is easier on a thumb, and that was the
 * original reason for one on phones, but these are questions rather than menus:
 * the answer is read before it is tapped, and the middle of the screen is where
 * reading happens.
 *
 * The panel never touches the screen edge — the overlay carries its own padding
 * and the safe-area insets, so a button inside can reach the panel's edge
 * without reaching the phone's.
 */
export function Modal({
  label,
  onClose,
  children,
  className = '',
}: {
  /** Accessible name for the dialog. */
  label: string
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  const { t } = useTranslation(['common'])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // The page behind must not scroll under the dialog. The previous value is
  // restored rather than cleared, so a dialog opened from inside something that
  // was already locked does not unlock it on the way out.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-safe pb-safe">
      <button
        type="button"
        aria-label={t('common:close')}
        onClick={onClose}
        className="backdrop-dim anim-fade absolute inset-0"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={[
          'anim-pop relative flex max-h-full w-full max-w-md flex-col overflow-y-auto',
          'rounded-card border border-border bg-surface p-6 shadow-lg',
          className,
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  )
}
