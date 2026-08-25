import { useTranslation } from 'react-i18next'

interface StepperProps {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  /** Announced by screen readers and used in both button labels. */
  label: string
  /** Why `+` is disabled. Shown inline, never as a silent dead button. */
  reason?: string | null
  disabled?: boolean
}

/**
 * Real buttons with real labels. A `+` that goes dead without saying why is a
 * dead end, so the reason renders underneath rather than living in a tooltip
 * nobody can reach on a phone.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  label,
  reason = null,
  disabled = false,
}: StepperProps) {
  const { t } = useTranslation('menu')
  const canDecrease = !disabled && value > min
  const canIncrease = !disabled && (max === undefined || value < max)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t('stepper.decrease', { label })}
          disabled={!canDecrease}
          onClick={() => onChange(value - 1)}
          className={buttonClass}
        >
          <span aria-hidden="true">−</span>
        </button>

        <output
          aria-label={t('stepper.current', { label, count: value })}
          className="tnum min-w-9 text-center text-base font-medium"
        >
          {value}
        </output>

        <button
          type="button"
          aria-label={t('stepper.increase', { label })}
          disabled={!canIncrease}
          onClick={() => onChange(value + 1)}
          className={buttonClass}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>

      {reason && !canIncrease && (
        <p className="text-[0.75rem] leading-tight text-ink-muted">{reason}</p>
      )}
    </div>
  )
}

const buttonClass = [
  'inline-flex size-11 items-center justify-center rounded-btn',
  'border border-border-strong bg-surface text-lg leading-none text-ink',
  'disabled:cursor-not-allowed disabled:opacity-35',
].join(' ')
