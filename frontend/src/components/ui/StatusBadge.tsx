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
  handed_over: 'bg-st-done-bg text-st-done-fg',
  cancelled: 'bg-st-cancel-bg text-st-cancel-fg',
  rejected: 'bg-st-cancel-bg text-st-cancel-fg',
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation('tracking')
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
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
