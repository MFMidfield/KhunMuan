import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
}

export function Input({ label, hint, error, className = '', ...rest }: InputProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.9rem] font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={[
          'min-h-11 rounded-btn border bg-surface px-3 text-ink',
          'placeholder:text-ink-muted',
          error ? 'border-st-cancel-fg' : 'border-border-strong',
          className,
        ].join(' ')}
        {...rest}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[0.82rem] text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[0.82rem] text-st-cancel-fg">
          {error}
        </p>
      )}
    </div>
  )
}
