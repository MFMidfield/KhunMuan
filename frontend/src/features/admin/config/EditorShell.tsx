import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/**
 * The shared frame every configuration list uses: rows that expand into a form,
 * one "add" row at the bottom, a delete that asks first.
 *
 * It is a frame and not a table because these are edited on a phone as often as
 * on a laptop — an owner adds tomorrow's set on the bus. A table would need a
 * horizontal scroll on every one of them.
 */
export function EditorList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-3">{children}</ul>
}

export function EditorRow({
  title,
  subtitle,
  active,
  onDelete,
  deleteLabel,
  children,
  defaultOpen = false,
}: {
  title: string
  subtitle?: string
  active?: boolean
  onDelete?: () => void
  deleteLabel?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [open, setOpen] = useState(defaultOpen)

  return (
    <li>
      <Card className={['p-4', active === false ? 'opacity-60' : ''].join(' ')}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-start"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium break-words">{title}</span>
              {subtitle && (
                <span className="block text-[0.85rem] text-ink-muted">{subtitle}</span>
              )}
            </span>
            <span aria-hidden="true" className="text-ink-muted">
              {open ? '−' : '+'}
            </span>
          </button>

          {active === false && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] text-ink-muted">
              {t('admin:cfg.inactive')}
            </span>
          )}
        </div>

        {open && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
            {children}

            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="min-h-11 self-start px-1 text-[0.85rem] text-ink-muted hover:text-st-cancel-fg"
              >
                {deleteLabel ?? t('admin:cfg.deleteRow')}
              </button>
            )}
          </div>
        )}
      </Card>
    </li>
  )
}

/** The always-present "add one" card at the foot of a list. */
export function AddRow({
  label,
  disabled,
  onAdd,
  children,
}: {
  label: string
  disabled?: boolean
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <li>
      <Card className="flex flex-col gap-3 border-dashed p-4">
        {children}
        <Button className="self-start" disabled={disabled} onClick={onAdd}>
          {label}
        </Button>
      </Card>
    </li>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.85rem] font-medium">{label}</span>
      {children}
      {hint && <span className="text-[0.75rem] text-ink-muted">{hint}</span>}
    </label>
  )
}

/** A checkbox that reads as a switch without pretending to be one. */
export function ActiveToggle({
  checked,
  onChange,
  labelOn,
  labelOff,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  labelOn: string
  labelOff: string
}) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
      />
      <span className="text-[0.9rem]">{checked ? labelOn : labelOff}</span>
    </label>
  )
}
