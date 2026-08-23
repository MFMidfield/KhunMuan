import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * The last line before a white screen.
 *
 * React Router's errorElement catches what happens inside a route; this catches
 * what happens in a provider, a layout, or a render that throws after the route
 * has already resolved. A customer mid-order should see a sentence and a way
 * back, not a blank page they will assume means the shop is closed.
 *
 * A class component because there is still no hook form of this.
 */
interface Props {
  children: ReactNode
  /** Passed in rather than translated here: this must render even if i18n is what broke. */
  title: string
  detail: string
  reloadLabel: string
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No error service is wired up yet, so the console is where this goes.
    // Swallowing it silently would make the sentence below the only evidence
    // anything happened.
    console.error('[khunmuan] render failed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="mx-auto flex min-h-svh max-w-md items-center px-4">
        <div className="w-full rounded-card border border-border bg-surface p-5 shadow-hairline">
          <h1 className="text-lg font-semibold">{this.props.title}</h1>
          <p className="mt-2 text-[0.95rem] break-words text-ink-muted">
            {this.props.detail}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={[
              'mt-5 min-h-12 w-full rounded-btn border-[1.5px] border-gold-edge',
              'bg-gold-fill font-medium text-ink',
            ].join(' ')}
          >
            {this.props.reloadLabel}
          </button>
        </div>
      </div>
    )
  }
}
