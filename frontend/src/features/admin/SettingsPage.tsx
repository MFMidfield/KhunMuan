import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { qk, queryClient } from '@/lib/queryClient'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { useSession } from '@/features/auth/useSession'
import { useCurrentAdmin } from '@/features/auth/useCurrentAdmin'
import { useShopSettingsAdmin } from './useShopSettingsAdmin'
import { actionError } from './useOrderActions'
import { Field } from './config/EditorShell'
import { fieldClass } from './config/editorStyles'
import { PointsEditor, SlotsEditor, ZonesEditor } from './config/FulfillmentEditors'

type Section = 'shop' | 'points' | 'slots' | 'zones' | 'rules'

/**
 * Open/close is an ordinary admin power (doc 04 §1) — whoever is on shift when
 * the last tray runs out has to be able to stop the queue without phoning the
 * owner. Everything below it is the shop's own configuration and is
 * superadmin-only, gated inside the page rather than by the route, so a cook
 * following a link lands on the switch they are allowed to use instead of on a
 * refusal.
 */
export function SettingsPage() {
  const { t } = useTranslation(['admin', 'common'])
  const { session } = useSession()
  const { data: admin } = useCurrentAdmin(session?.user.email)
  const { data: settings, isPending } = useShopSettingsAdmin()
  const [section, setSection] = useState<Section>('shop')

  if (isPending || !settings) return <PageSpinner />

  const isSuper = admin?.role === 'superadmin'

  const sections: { key: Section; label: string }[] = [
    { key: 'shop', label: t('admin:settings') },
    ...(isSuper
      ? ([
          { key: 'points', label: t('admin:cfg.points') },
          { key: 'slots', label: t('admin:cfg.slots') },
          { key: 'zones', label: t('admin:cfg.zones') },
          { key: 'rules', label: t('admin:cfg.rules') },
        ] as const)
      : []),
  ]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t('admin:settings')}</h1>

      {sections.length > 1 && (
        <div role="tablist" className="scroll-strip -mx-4 flex gap-2 px-4">
          {sections.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={section === s.key}
              onClick={() => setSection(s.key)}
              className={[
                'snap-item min-h-11 shrink-0 rounded-full border px-4 text-[0.9rem]',
                section === s.key
                  ? 'border-ink bg-surface-2 font-medium text-ink'
                  : 'border-border bg-surface text-ink-muted',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {section === 'shop' && <OpenCloseCard settings={settings} isSuper={isSuper} />}
      {section === 'points' && <PointsEditor />}
      {section === 'slots' && <SlotsEditor />}
      {section === 'zones' && <ZonesEditor />}
      {section === 'rules' && <RulesCard settings={settings} />}
    </div>
  )
}

type Settings = NonNullable<ReturnType<typeof useShopSettingsAdmin>['data']>

function OpenCloseCard({ settings, isSuper }: { settings: Settings; isSuper: boolean }) {
  const { t } = useTranslation(['admin', 'common'])
  // Uncontrolled, seeded from the server value. Mirroring it into state would
  // mean an effect that overwrites whatever the person is halfway through
  // typing every time the query refetches.
  const messageRef = useRef<HTMLTextAreaElement>(null)

  const toggle = useMutation({
    mutationFn: async (open: boolean) => {
      const note = messageRef.current?.value.trim() ?? ''
      const { error } = await supabase.rpc('toggle_shop', {
        p_is_open: open,
        ...(note ? { p_message: note } : {}),
      })
      if (error) throw error
    },
    onSuccess: refreshSettings,
  })

  const saveQr = useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase
        .from('shop_settings')
        .update({ promptpay_qr_path: path })
        .eq('id', 1)
      if (error) throw error
    },
    onSuccess: refreshSettings,
  })

  const open = settings.is_open

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={['size-3 rounded-full', open ? 'bg-st-ready-fg' : 'bg-st-cancel-fg'].join(' ')}
          />
          <p className="font-semibold">{open ? t('admin:shopOpen') : t('admin:shopClosed')}</p>
        </div>

        <Field label={t('admin:closedMessage')}>
          <textarea
            ref={messageRef}
            defaultValue={settings.closed_message ?? ''}
            rows={2}
            maxLength={200}
            className="rounded-btn border border-border-strong bg-surface p-3 text-ink"
          />
        </Field>

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

      {isSuper && (
        <Card className="flex flex-col gap-3 p-5">
          <div>
            <h2 className="font-semibold">{t('admin:cfg.qr')}</h2>
            <p className="text-[0.85rem] text-ink-muted">{t('admin:cfg.qrHint')}</p>
          </div>
          <ImageUpload
            folder="shop"
            path={settings.promptpay_qr_path}
            alt={t('admin:cfg.qr')}
            onUploaded={(path) => saveQr.mutate(path)}
          />
          {saveQr.error && (
            <p role="alert" className="text-[0.85rem] text-st-cancel-fg">
              {actionError(saveQr.error, t)}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}

function RulesCard({ settings }: { settings: Settings }) {
  const { t } = useTranslation(['admin', 'common'])
  const [minTotal, setMinTotal] = useState(
    settings.min_order_total === null ? '' : String(settings.min_order_total),
  )
  const [maxBoxes, setMaxBoxes] = useState(
    settings.max_boxes_per_order === null ? '' : String(settings.max_boxes_per_order),
  )

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('shop_settings')
        .update({
          // Empty means no limit, which is null and not zero — a zero minimum
          // and no minimum are the same thing to a customer but not to a
          // check constraint.
          min_order_total: minTotal === '' ? null : Number(minTotal),
          max_boxes_per_order: maxBoxes === '' ? null : Number(maxBoxes),
        })
        .eq('id', 1)
      if (error) throw error
    },
    onSuccess: refreshSettings,
  })

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-semibold">{t('admin:cfg.rules')}</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('admin:cfg.minOrder')} hint={t('admin:cfg.rulesHint')}>
          <input
            className={fieldClass}
            inputMode="decimal"
            value={minTotal}
            onChange={(e) => setMinTotal(e.target.value)}
          />
        </Field>
        <Field label={t('admin:cfg.maxBoxes')} hint={t('admin:cfg.rulesHint')}>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={maxBoxes}
            onChange={(e) => setMaxBoxes(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      </div>

      <Button className="self-start" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isSuccess ? t('admin:cfg.saved') : t('admin:cfg.saveRow')}
      </Button>

      {save.error && (
        <p role="alert" className="text-[0.85rem] text-st-cancel-fg">
          {actionError(save.error, t)}
        </p>
      )}
    </Card>
  )
}

function refreshSettings() {
  void queryClient.invalidateQueries({ queryKey: ['shop-settings', 'admin'] })
  void queryClient.invalidateQueries({ queryKey: qk.shopSettings })
}
