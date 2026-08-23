import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** 16px corners, and a shadow so light it reads as barely more than a hairline. */
export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={[
        'rounded-card border border-border bg-surface shadow-hairline',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
}
