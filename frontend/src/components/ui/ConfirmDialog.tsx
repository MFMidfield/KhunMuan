import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Modal } from './Modal'

/**
 * A yes/no dialog whose confirm button is dead for the first few seconds.
 *
 * The delay is the point, not a loading state. Both places this is used —
 * placing an order and cancelling one — are decisions the customer cannot take
 * back from the screen they are on, and both buttons sit exactly where a person
 * has just been tapping. The countdown makes the sentence above it get read.
 *
 * Cancelling out is never delayed: making it slow to back out of a dialog is a
 * dark pattern, and closing changes nothing.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  delaySeconds = 3,
  busy = false,
  danger = false,
  children,
  onConfirm,
  onClose,
}: {
  title: string
  body?: string
  confirmLabel: string
  cancelLabel?: string
  delaySeconds?: number
  busy?: boolean
  danger?: boolean
  children?: React.ReactNode
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useTranslation(['common'])
  const [left, setLeft] = useState(delaySeconds)

  useEffect(() => {
    if (left <= 0) return
    const id = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [left])

  const waiting = left > 0

  return (
    <Modal label={title} onClose={onClose}>
      <h2 className="font-semibold">{title}</h2>
      {body && <p className="mt-2 text-[0.95rem] text-ink-muted">{body}</p>}

      {children}

      <div className="mt-6 flex gap-3">
        <Button variant="ghost" size="lg" className="flex-1" onClick={onClose}>
          {cancelLabel ?? t('common:close')}
        </Button>
        <Button
          type="button"
          variant={danger ? 'danger' : 'primary'}
          size="lg"
          className="flex-1"
          // aria-describedby is not enough on its own: a disabled button is
          // skipped by some screen readers, so the seconds go in the label.
          disabled={waiting || busy}
          onClick={onConfirm}
        >
          {waiting ? t('common:waitSeconds', { count: left }) : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
