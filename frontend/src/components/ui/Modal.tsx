import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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
 *
 * **Rendered into `document.body`, always.** `position: fixed` is relative to
 * the viewport only while no ancestor has a transform, a filter or `will-change`
 * on either — and the dialogs here open from inside cards and page wrappers that
 * do (`.anim-rise`, `.anim-pop`). With such an ancestor the overlay is measured
 * against that box instead: the dim and the blur cover the card rather than the
 * screen, and "centred" means the centre of the card, which on a scrolled board
 * is nowhere near the middle of the screen. The portal takes the whole question
 * off the table for every caller, present and future.
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
  const panel = useRef<HTMLDivElement>(null)

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

  /**
   * Focus goes in, stays in, and comes back out to where it started.
   *
   * Without this, Tab walks straight out of the dialog and into the page behind
   * it — which is still there, still clickable by keyboard, and hidden from
   * nobody but a mouse. `aria-modal` says the dialog is exclusive; the trap is
   * what makes that true.
   */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    // The panel itself when there is nothing inside to focus yet — a dialog
    // that is still loading its content still has to take the focus.
    ;(focusable()[0] ?? panel.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        e.preventDefault()
        panel.current?.focus()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-safe pb-safe">
      <button
        type="button"
        aria-label={t('common:close')}
        onClick={onClose}
        className="backdrop-dim anim-fade absolute inset-0"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={[
          // `min-w-0` and the x-axis clamp together: a panel that is only told
          // to scroll on y still computes `overflow-x: auto`, and one wide
          // child — a landscape slip, a long unbroken code — then stretched the
          // panel past the screen and pushed its own left edge out of reach.
          // The child scrolls inside its own box now; the panel does not move.
          'anim-pop relative flex max-h-full w-full max-w-md min-w-0 flex-col',
          'overflow-x-hidden overflow-y-auto outline-none',
          'rounded-card border border-border bg-surface p-6 shadow-lg',
          className,
        ].join(' ')}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
