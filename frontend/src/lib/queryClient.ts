import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Campus wifi drops mid-shift. Refetching on reconnect is how a stale
      // board recovers on its own instead of lying quietly.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 2,
      staleTime: 30_000,
    },
    mutations: {
      // Mutations are order placements and status changes. A blind retry could
      // duplicate work, so every retry is an explicit decision at the call site.
      retry: 0,
    },
  },
})

/** Query keys in one place, so an invalidation can never miss a subscriber. */
export const qk = {
  shopSettings: ['shop-settings'] as const,
  sets: ['sets'] as const,
  fillings: ['fillings'] as const,
  addons: ['addons'] as const,
  stockToday: ['filling-stock', 'today'] as const,
  pickupPoints: ['pickup-points'] as const,
  pickupSlots: ['pickup-slots'] as const,
  deliveryZones: ['delivery-zones'] as const,
  currentAdmin: ['current-admin'] as const,
  orders: (scope: string) => ['orders', scope] as const,
  order: (id: string) => ['orders', 'detail', id] as const,
}
