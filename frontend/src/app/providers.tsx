import { QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import type { ReactNode } from 'react'
import i18n from '@/lib/i18n'
import { queryClient } from '@/lib/queryClient'
import { ThemeProvider } from '@/lib/theme'
import { CartProvider } from '@/features/cart/cartContext'
import { ErrorBoundary } from './ErrorBoundary'
import { OfflineBanner } from './OfflineBanner'
import { th } from '@/lib/locales/th'

export function Providers({ children }: { children: ReactNode }) {
  return (
    // The boundary is outermost and takes its strings from the dictionary
    // directly rather than through t(): if i18n is what failed, a hook that
    // reads from it would fail too, and the fallback would be the white screen
    // it exists to replace.
    <ErrorBoundary
      title={th.common.error.title}
      detail={th.common.error.generic}
      reloadLabel={th.common.retry}
    >
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <CartProvider>
              <OfflineBanner />
              {children}
            </CartProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ErrorBoundary>
  )
}
