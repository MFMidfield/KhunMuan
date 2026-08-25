import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

/*
 * The primary button is gold fill + ink text + a 1.5px ink outline.
 *
 * The outline is not decoration. --gold against --ground measures 1.33:1, and
 * WCAG 1.4.11 wants 3:1 for the boundary of an interactive control, so an
 * unoutlined gold button dissolves into the page even though its label is
 * perfectly legible at 12.76:1. The edge measures 16.96:1 and comes straight
 * from the logo, where every letterform is a yellow shape with a heavy dark
 * outline. Removing it breaks accessibility and the brand in one move.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gold-fill text-ink border-[1.5px] border-gold-edge hover:bg-gold-hover active:translate-y-px',
  secondary:
    'bg-ink text-ground border-[1.5px] border-ink hover:opacity-90 active:translate-y-px',
  ghost:
    'bg-transparent text-ink border-[1.5px] border-border-strong hover:bg-surface-2',
  danger:
    'bg-st-cancel-bg text-st-cancel-fg border-[1.5px] border-st-cancel-fg hover:opacity-90',
}

// Back-office minimum is 44px: it is used fast, with wet hands.
const SIZES: Record<Size, string> = {
  md: 'min-h-11 px-4 text-[0.95rem]',
  lg: 'min-h-12 px-6 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-btn font-medium',
        'transition-[background-color,opacity,transform] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
