import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { timeOfDay, dayAndMonth } from '@/lib/i18n'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useSession } from '@/features/auth/useSession'
import { useCurrentAdmin } from '@/features/auth/useCurrentAdmin'
import { useShopSettingsAdmin } from './useShopSettingsAdmin'
import { useOrderBoard } from './useOrderBoard'
import { OrderCard } from './OrderCard'
import type { Database } from '@/types/database'

type OrderStatus = Database['public']['Enums']['order_status']

interface EventRow {
  id: number
  type: string
  from_status: OrderStatus | null
  to_status: OrderStatus | null
  actor_label: string
  created_at: string
}

/**
 * One order, plus the audit trail.
 *
 * The card is the same component the board renders, so the actions available
 * here cannot drift from the actions available there — two code paths for
 * "start cooking" would eventually disagree about something.
 */
export function OrderDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { t } = useTranslation(['admin', 'tracking'])
  const { session } = useSession()
  const { data: admin } = useCurrentAdmin(session?.user.email)
  const { data: settings } = useShopSettingsAdmin()
  const board = useOrderBoard()

  const { data: events, isPending: eventsPending } = useQuery({
    queryKey: ['order-events', id],
    queryFn: async (): Promise<EventRow[]> => {
      const { data, error } = await supabase
        .from('order_events')
        .select('id, type, from_status, to_status, actor_label, created_at')
        .eq('order_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })

  if (board.isPending || eventsPending) return <PageSpinner />

  const order = board.orders.find((o) => o.id === id)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 lg:max-w-5xl lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {order ? (
          <OrderCard
            order={order}
            currentAdminId={admin?.id ?? null}
            requireCodeOnHandover={settings?.require_code_on_handover ?? true}
            exclusiveClaims={settings?.exclusive_claims ?? true}
            isNew={board.unseen.has(order.id)}
            onSeen={() => board.markSeen(order.id)}
            linkToDetail={false}
            showStatus
          />
        ) : (
          // The board query only carries active orders, so a finished one lands
          // here with just its history — which is the useful half after the
          // fact anyway.
          <Card className="p-5 text-ink-muted">{t('admin:orderNotFound')}</Card>
        )}
      </div>

      <Card className="min-w-0 flex-1 p-5 lg:max-w-sm">
        <h2 className="font-semibold">{t('admin:history')}</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {(events ?? []).map((e) => {
            const at = new Date(e.created_at)
            return (
              <li key={e.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.9rem] font-medium">
                    {t(`admin:eventType.${e.type}`, { defaultValue: e.type })}
                  </span>
                  {e.to_status && <StatusBadge status={e.to_status} />}
                </div>
                <p className="text-[0.8rem] text-ink-muted">
                  {e.actor_label} · <span className="tnum">
                    {dayAndMonth.format(at)} {timeOfDay.format(at)}
                  </span>
                </p>
              </li>
            )
          })}
        </ol>
      </Card>
    </div>
  )
}
