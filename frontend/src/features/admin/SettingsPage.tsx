import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { qk, queryClient } from '@/lib/queryClient'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useShopSettingsAdmin } from './useShopSettingsAdmin'
import { actionError } from './useOrderActions'

/**
 * Open/close is an ordinary admin power, not a superadmin one (doc 04 §1) —
 * whoever is on shift when the last tray runs out has to be able to stop the
 * queue without phoning the owner.
 *
 * The menu, pickup points, slots and zones editors are superadmin and land in
 * Phase 4; this page is deliberately just the switch for now.
 */
export function SettingsPage() {
  const { t } = useTranslation(['admin', 'common'])
  const { data: settings, isPending } = useShopSettingsAdmin()
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (settings) setMessage(settings.closed_message ?? '')
  }, [settings])

  const toggle = useMutation({
    mutationFn: async (open: boolean) => {
      const { error } = await supabase.rpc('toggle_shop', {
        p_is_open: open,
        ...(message.trim() ? { p_message: message.trim() } : {}),
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shop-settings', 'admin'] })
      void queryClient.invalidateQueries({ queryKey: qk.shopSettings })
    },
  })

  if (isPending || !settings) return <PageSpinner />

  const open = settings.is_open

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t('admin:settings')}</h1>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={[
              'size-3 rounded-full',
              open ? 'bg-st-ready-fg' : 'bg-st-cancel-fg',
            ].join(' ')}
          />
          <p className="font-semibold">
            {open ? t('admin:shopOpen') : t('admin:shopClosed')}
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.9rem] font-medium">{t('admin:closedMessage')}</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={200}
            className="rounded-btn border border-border-strong bg-surface p-3 text-ink"
          />
        </label>

        <Button
          size="lg"
          variant={open ? 'danger' : 'primary'}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(!open)}
        >
          {open ? t('admin:shopCloseAction') : t('admin:shopOpenAction')}
        </Button>

        {toggle.error && (
          <p role="alert" className="text-[0.85rem] text-st-cancel-fg">
            {actionError(toggle.error, t)}
          </p>
        )}
      </Card>
    </div>
  )
}
