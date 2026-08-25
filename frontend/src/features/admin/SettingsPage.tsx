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
import { ActiveToggle, Field } from './config/EditorShell'
import { fieldClass } from './config/editorStyles'
import { PointsEditor, SlotsEditor, ZonesEditor } from './config/FulfillmentEditors'

type Section = 'shop' | 'contact' | 'points' | 'slots' | 'zones' | 'rules'

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
          { key: 'contact', label: t('admin:cfg.contact') },
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
      {section === 'contact' && <ContactCard settings={settings} />}
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

  // An ordinary admin power, like open/close and for the same reason: the shape
  // of a shift changes during the shift. RLS on shop_settings is
  // superadmin-only, so this goes through an RPC rather than a table update.
  const claims = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.rpc('set_exclusive_claims', { p_enabled: enabled })
      if (error) throw error
    },
    onSuccess: () => {
      refreshSettings()
      // Every live claim was just dropped and every order's version bumped, so
      // the board in the next tab is holding rows it can no longer write to.
      void queryClient.invalidateQueries({ queryKey: qk.orders('active') })
    },
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

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold">{t('admin:cfg.claimMode')}</h2>
        <ActiveToggle
          checked={settings.exclusive_claims}
          onChange={(next) => claims.mutate(next)}
          labelOn={t('admin:cfg.claimExclusive')}
          labelOff={t('admin:cfg.claimShared')}
        />
        <p className="text-[0.8rem] text-ink-muted">{t('admin:cfg.claimModeHint')}</p>

        {claims.error && (
          <p role="alert" className="text-[0.85rem] text-st-cancel-fg">
            {actionError(claims.error, t)}
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

/**
 * The three contact channels the landing page leads with.
 *
 * The patterns are the same three the check constraints in 0025 enforce, copied
 * rather than derived because there is nowhere to derive them from. Duplicating
 * them buys a Thai sentence under the field instead of a raw
 * `violates check constraint "shop_settings_phone_format"` from Postgres — the
 * database stays the authority, this is only the earlier, kinder telling.
 */
const CONTACT_PATTERNS = {
  phone: /^\+?[0-9][0-9 ()+-]{5,24}$/,
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  instagram: /^[A-Za-z0-9._]{1,30}$/,
} as const

function ContactCard({ settings }: { settings: Settings }) {
  const { t } = useTranslation(['admin', 'common'])
  const [phone, setPhone] = useState(settings.contact_phone ?? '')
  const [email, setEmail] = useState(settings.contact_email ?? '')
  const [instagram, setInstagram] = useState(settings.contact_instagram ?? '')

  // Empty is valid everywhere: a blank field means the shop has no such channel
  // and the landing page omits the line, which is not the same as a bad value.
  const errors = {
    phone:
      phone.trim() && !CONTACT_PATTERNS.phone.test(phone.trim())
        ? t('admin:cfg.contactBadPhone')
        : '',
    email:
      email.trim() && !CONTACT_PATTERNS.email.test(email.trim())
        ? t('admin:cfg.contactBadEmail')
        : '',
    instagram:
      instagram.trim() && !CONTACT_PATTERNS.instagram.test(instagram.trim())
        ? t('admin:cfg.contactBadInstagram')
        : '',
  }
  const valid = !errors.phone && !errors.email && !errors.instagram

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('shop_settings')
        .update({
          contact_phone: phone.trim() || null,
          contact_email: email.trim().toLowerCase() || null,
          contact_instagram: instagram.trim() || null,
        })
        .eq('id', 1)
      if (error) throw error
    },
    onSuccess: refreshSettings,
  })

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h2 className="font-semibold">{t('admin:cfg.contact')}</h2>
        <p className="text-[0.85rem] text-ink-muted">{t('admin:cfg.contactHint')}</p>
      </div>

      <Field label={t('admin:cfg.contactPhone')} hint={errors.phone || t('admin:cfg.contactPhoneHint')}>
        <input
          className={fieldClass}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          aria-invalid={Boolean(errors.phone)}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>

      <Field label={t('admin:cfg.contactEmail')} hint={errors.email || undefined}>
        <input
          className={fieldClass}
          type="email"
          inputMode="email"
          autoComplete="off"
          aria-invalid={Boolean(errors.email)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field
        label={t('admin:cfg.contactInstagram')}
        hint={errors.instagram || t('admin:cfg.contactInstagramHint')}
      >
        <input
          className={fieldClass}
          autoComplete="off"
          aria-invalid={Boolean(errors.instagram)}
          value={instagram}
          // The @ is stripped on the way in rather than rejected: everyone types
          // it, the constraint forbids it, and refusing the most natural input
          // to teach a storage detail helps nobody.
          onChange={(e) => setInstagram(e.target.value.replace(/^@+/, ''))}
        />
      </Field>

      <Button
        className="self-start"
        disabled={save.isPending || !valid}
        onClick={() => save.mutate()}
      >
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

function RulesCard({ settings }: { settings: Settings }) {
  const { t } = useTranslation(['admin', 'common'])
  const [minTotal, setMinTotal] = useState(
    settings.min_order_total === null ? '' : String(settings.min_order_total),
  )
  const [maxBoxes, setMaxBoxes] = useState(
    settings.max_boxes_per_order === null ? '' : String(settings.max_boxes_per_order),
  )
  const [requireCode, setRequireCode] = useState(settings.require_code_on_handover)

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
          require_code_on_handover: requireCode,
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

      {/* Q14. The switch existed in the database and in advance_order from the
          start but had no control anywhere, which meant the answer to "we do
          not want to type the code" was a hand-written UPDATE. It lives in the
          superadmin section because turning off the one check that the person
          collecting the box is the person who ordered it is a shop decision,
          not a shift decision. */}
      <div className="border-t border-border pt-3">
        <ActiveToggle
          checked={requireCode}
          onChange={setRequireCode}
          labelOn={t('admin:cfg.codeOnHandoverOn')}
          labelOff={t('admin:cfg.codeOnHandoverOff')}
        />
        <p className="mt-1 text-[0.8rem] text-ink-muted">{t('admin:cfg.codeOnHandoverHint')}</p>
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
