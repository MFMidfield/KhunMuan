import { useTranslation } from 'react-i18next'
import type { Database } from '@/types/database'

type OrderStatus = Database['public']['Enums']['order_status']

/*
 * Every chip carries a dot, a colour AND a word. Colour alone fails for
 * colour-blind staff and under bad kitchen lighting.
 *
 * Nothing here touches yellow or orange, so gold keeps exactly one meaning in
 * the interface: this is the brand, never this is a state.
 */
const TONES: Record<OrderStatus, string> = {
  pending_confirmation: 'bg-st-pending-bg text-st-pending-fg',
  accepted: 'bg-st-accept-bg text-st-accept-fg',
  cooking: 'bg-st-cook-bg text-st-cook-fg',
  ready: 'bg-st-ready-bg text-st-ready-fg',
  // Shares cooking's blue, which is the colour this interface uses for "this
  // order is in motion" — and the same blue as the delivery card's edge. The
  // rule that keeps that readable is the one at the top of this file: the word
  // is always there too, so no state is ever told by colour alone.
  out_for_delivery: 'bg-st-cook-bg text-st-cook-fg',
  handed_over: 'bg-st-done-bg text-st-done-fg',
  cancelled: 'bg-st-cancel-bg text-st-cancel-fg',
  rejected: 'bg-st-cancel-bg text-st-cancel-fg',
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation('tracking')
  return (
    <span
      className={[
        'tap-target inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
        'text-[0.8rem] font-medium',
        TONES[status],
      ].join(' ')}
    >
      {/* Hollow dot for pending — deliberately inert, nothing has started. */}
      <span
        aria-hidden="true"
        className={[
          'size-1.5 rounded-full',
          status === 'pending_confirmation'
            ? 'border-[1.5px] border-current'
            : 'bg-current',
        ].join(' ')}
      />
      {t(`status.${status}`)}
    </span>
  )
}
