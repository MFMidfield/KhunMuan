import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { ActiveToggle, AddRow, EditorList, EditorRow, Field } from './EditorShell'
import { fieldClass } from './editorStyles'
import { crudError, useTableCrud } from './useTableCrud'
import type { Database } from '@/types/database'

type Tables = Database['public']['Tables']
type Tab = 'sets' | 'fillings' | 'addons'

/**
 * The menu, editable by the shop. This is the screen that replaced Q4, Q5 and
 * Q6 — the sets, the fillings and the add-ons stopped being lists a developer
 * had to be handed and became rows the owner types.
 *
 * Nothing here can be deleted once an order references it; the database says so
 * with a foreign-key violation and the screen translates that into the advice
 * that actually applies, which is to stop selling it rather than remove it.
 * Historical orders keep their snapshots either way.
 */
export function MenuAdminPage() {
  const { t } = useTranslation(['admin', 'common'])
  const [tab, setTab] = useState<Tab>('sets')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t('admin:menu')}</h1>

      <div role="tablist" className="scroll-strip -mx-4 flex gap-2 px-4">
        {(['sets', 'fillings', 'addons'] as Tab[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={[
              'snap-item min-h-11 shrink-0 rounded-full border px-4 text-[0.9rem]',
              tab === key
                ? 'border-ink bg-surface-2 font-medium text-ink'
                : 'border-border bg-surface text-ink-muted',
            ].join(' ')}
          >
            {t(`admin:cfg.tab${key[0]!.toUpperCase()}${key.slice(1)}`)}
          </button>
        ))}
      </div>

      {tab === 'sets' && <SetsEditor />}
      {tab === 'fillings' && <FillingsEditor />}
      {tab === 'addons' && <AddonsEditor />}
    </div>
  )
}

/* ------------------------------------------------------------------ sets -- */

function SetsEditor() {
  const { t } = useTranslation(['admin', 'common'])
  const { list, insert, update, remove } = useTableCrud('sets', 'sort_order')
  const [draft, setDraft] = useState({ name: '', piece_quota: '', price: '' })

  if (list.isPending) return <PageSpinner />
  if (list.error) return <ErrorCard error={list.error} />

  const error = insert.error ?? update.error ?? remove.error

  return (
    <>
      {error && <ErrorCard error={error} />}
      <EditorList>
        {list.data.map((row) => (
          <SetRow key={row.id} row={row} onSave={update.mutate} onDelete={remove.mutate} />
        ))}

        <AddRow
          label={t('admin:cfg.add')}
          disabled={!draft.name.trim() || !draft.piece_quota || !draft.price}
          onAdd={() => {
            insert.mutate({
              name: draft.name.trim(),
              piece_quota: Number(draft.piece_quota),
              price: Number(draft.price),
              sort_order: (list.data.at(-1)?.sort_order ?? 0) + 1,
            })
            setDraft({ name: '', piece_quota: '', price: '' })
          }}
        >
          <Field label={t('admin:cfg.name')}>
            <input
              className={fieldClass}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('admin:cfg.pieceQuota')}>
              <input
                className={fieldClass}
                inputMode="numeric"
                value={draft.piece_quota}
                onChange={(e) =>
                  setDraft({ ...draft, piece_quota: e.target.value.replace(/\D/g, '') })
                }
              />
            </Field>
            <Field label={t('admin:cfg.price')}>
              <input
                className={fieldClass}
                inputMode="decimal"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              />
            </Field>
          </div>
        </AddRow>
      </EditorList>
    </>
  )
}

function SetRow({
  row,
  onSave,
  onDelete,
}: {
  row: Tables['sets']['Row']
  onSave: (args: { id: string; patch: Tables['sets']['Update'] }) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [d, setD] = useState({
    name: row.name,
    description: row.description ?? '',
    piece_quota: String(row.piece_quota),
    price: String(row.price),
    daily_limit: row.daily_limit === null ? '' : String(row.daily_limit),
    sort_order: String(row.sort_order),
    is_active: row.is_active,
    image_path: row.image_path,
  })

  return (
    <EditorRow
      title={row.name}
      subtitle={`${row.piece_quota} · ${row.price}`}
      active={row.is_active}
      onDelete={() => {
        if (confirm(t('admin:cfg.confirmDelete', { name: row.name }))) onDelete(row.id)
      }}
    >
      <ImageUpload
        folder="sets"
        path={d.image_path}
        alt={row.name}
        onUploaded={(p) => setD({ ...d, image_path: p })}
      />

      <Field label={t('admin:cfg.name')}>
        <input className={fieldClass} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>
      <Field label={t('admin:cfg.description')}>
        <input
          className={fieldClass}
          value={d.description}
          onChange={(e) => setD({ ...d, description: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin:cfg.pieceQuota')}>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={d.piece_quota}
            onChange={(e) => setD({ ...d, piece_quota: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
        <Field label={t('admin:cfg.price')}>
          <input
            className={fieldClass}
            inputMode="decimal"
            value={d.price}
            onChange={(e) => setD({ ...d, price: e.target.value })}
          />
        </Field>
        <Field label={t('admin:cfg.dailyLimit')} hint={t('admin:cfg.unlimited')}>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={d.daily_limit}
            onChange={(e) => setD({ ...d, daily_limit: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
        <Field label={t('admin:cfg.order')}>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={d.sort_order}
            onChange={(e) => setD({ ...d, sort_order: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
      </div>

      <ActiveToggle
        checked={d.is_active}
        onChange={(v) => setD({ ...d, is_active: v })}
        labelOn={t('admin:cfg.active')}
        labelOff={t('admin:cfg.inactive')}
      />

      <Button
        className="self-start"
        onClick={() =>
          onSave({
            id: row.id,
            patch: {
              name: d.name.trim(),
              description: d.description.trim() || null,
              piece_quota: Number(d.piece_quota),
              price: Number(d.price),
              daily_limit: d.daily_limit === '' ? null : Number(d.daily_limit),
              sort_order: Number(d.sort_order),
              is_active: d.is_active,
              image_path: d.image_path,
            },
          })
        }
      >
        {t('admin:cfg.saveRow')}
      </Button>
    </EditorRow>
  )
}

/* -------------------------------------------------------------- fillings -- */

function FillingsEditor() {
  const { t } = useTranslation(['admin', 'common'])
  const { list, insert, update, remove } = useTableCrud('fillings', 'sort_order')
  const [draft, setDraft] = useState({ name: '', image_path: '' })

  if (list.isPending) return <PageSpinner />
  if (list.error) return <ErrorCard error={list.error} />

  const error = insert.error ?? update.error ?? remove.error

  return (
    <>
      {error && <ErrorCard error={error} />}
      <EditorList>
        {list.data.map((row) => (
          <FillingRow key={row.id} row={row} onSave={update.mutate} onDelete={remove.mutate} />
        ))}

        <AddRow
          label={t('admin:cfg.add')}
          // image_path is NOT NULL in the schema, because doc 00 says every
          // filling has a real photo. The form enforces the same thing rather
          // than letting the insert fail with a constraint name.
          disabled={!draft.name.trim() || !draft.image_path}
          onAdd={() => {
            insert.mutate({
              name: draft.name.trim(),
              image_path: draft.image_path,
              sort_order: (list.data.at(-1)?.sort_order ?? 0) + 1,
            })
            setDraft({ name: '', image_path: '' })
          }}
        >
          <Field label={t('admin:cfg.name')}>
            <input
              className={fieldClass}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <ImageUpload
            folder="fillings"
            path={draft.image_path || null}
            alt={draft.name}
            onUploaded={(p) => setDraft({ ...draft, image_path: p })}
          />
        </AddRow>
      </EditorList>
    </>
  )
}

function FillingRow({
  row,
  onSave,
  onDelete,
}: {
  row: Tables['fillings']['Row']
  onSave: (args: { id: string; patch: Tables['fillings']['Update'] }) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [d, setD] = useState({
    name: row.name,
    image_path: row.image_path,
    max_per_set: row.max_per_set === null ? '' : String(row.max_per_set),
    default_daily_qty: row.default_daily_qty === null ? '' : String(row.default_daily_qty),
    sort_order: String(row.sort_order),
    is_active: row.is_active,
  })

  return (
    <EditorRow title={row.name} active={row.is_active}
      onDelete={() => {
        if (confirm(t('admin:cfg.confirmDelete', { name: row.name }))) onDelete(row.id)
      }}
    >
      <ImageUpload
        folder="fillings"
        path={d.image_path}
        alt={row.name}
        onUploaded={(p) => setD({ ...d, image_path: p })}
      />

      <Field label={t('admin:cfg.name')}>
        <input className={fieldClass} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin:cfg.maxPerSet')} hint={t('admin:cfg.unlimited')}>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={d.max_per_set}
            onChange={(e) => setD({ ...d, max_per_set: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
        <Field label={t('admin:cfg.defaultDaily')} hint={t('admin:cfg.unlimited')}>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={d.default_daily_qty}
            onChange={(e) => setD({ ...d, default_daily_qty: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
      </div>

      <Field label={t('admin:cfg.order')}>
        <input
          className={fieldClass}
          inputMode="numeric"
          value={d.sort_order}
          onChange={(e) => setD({ ...d, sort_order: e.target.value.replace(/\D/g, '') })}
        />
      </Field>

      <ActiveToggle
        checked={d.is_active}
        onChange={(v) => setD({ ...d, is_active: v })}
        labelOn={t('admin:cfg.active')}
        labelOff={t('admin:cfg.inactive')}
      />

      <Button
        className="self-start"
        onClick={() =>
          onSave({
            id: row.id,
            patch: {
              name: d.name.trim(),
              image_path: d.image_path,
              max_per_set: d.max_per_set === '' ? null : Number(d.max_per_set),
              default_daily_qty:
                d.default_daily_qty === '' ? null : Number(d.default_daily_qty),
              sort_order: Number(d.sort_order),
              is_active: d.is_active,
            },
          })
        }
      >
        {t('admin:cfg.saveRow')}
      </Button>
    </EditorRow>
  )
}

/* ---------------------------------------------------------------- addons -- */

const KINDS = ['sauce', 'utensil', 'packaging'] as const

function AddonsEditor() {
  const { t } = useTranslation(['admin', 'common'])
  const { list, insert, update, remove } = useTableCrud('addons', 'sort_order')
  const [draft, setDraft] = useState({ name: '', kind: 'sauce' as (typeof KINDS)[number] })

  if (list.isPending) return <PageSpinner />
  if (list.error) return <ErrorCard error={list.error} />

  const error = insert.error ?? update.error ?? remove.error

  return (
    <>
      {error && <ErrorCard error={error} />}
      <EditorList>
        {list.data.map((row) => (
          <AddonRow key={row.id} row={row} onSave={update.mutate} onDelete={remove.mutate} />
        ))}

        <AddRow
          label={t('admin:cfg.add')}
          disabled={!draft.name.trim()}
          onAdd={() => {
            insert.mutate({
              name: draft.name.trim(),
              kind: draft.kind,
              sort_order: (list.data.at(-1)?.sort_order ?? 0) + 1,
            })
            setDraft({ name: '', kind: 'sauce' })
          }}
        >
          <Field label={t('admin:cfg.name')}>
            <input
              className={fieldClass}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label={t('admin:cfg.kind')}>
            <select
              className={fieldClass}
              value={draft.kind}
              onChange={(e) =>
                setDraft({ ...draft, kind: e.target.value as (typeof KINDS)[number] })
              }
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`admin:cfg.kind${k[0]!.toUpperCase()}${k.slice(1)}`)}
                </option>
              ))}
            </select>
          </Field>
        </AddRow>
      </EditorList>
    </>
  )
}

function AddonRow({
  row,
  onSave,
  onDelete,
}: {
  row: Tables['addons']['Row']
  onSave: (args: { id: string; patch: Tables['addons']['Update'] }) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [d, setD] = useState({
    name: row.name,
    kind: row.kind,
    price: String(row.price),
    max_qty: String(row.max_qty),
    sort_order: String(row.sort_order),
    is_active: row.is_active,
  })

  return (
    <EditorRow
      title={row.name}
      subtitle={t(`admin:cfg.kind${row.kind[0]!.toUpperCase()}${row.kind.slice(1)}`)}
      active={row.is_active}
      onDelete={() => {
        if (confirm(t('admin:cfg.confirmDelete', { name: row.name }))) onDelete(row.id)
      }}
    >
      <Field label={t('admin:cfg.name')}>
        <input className={fieldClass} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>

      <Field label={t('admin:cfg.kind')}>
        <select
          className={fieldClass}
          value={d.kind}
          onChange={(e) => setD({ ...d, kind: e.target.value as typeof d.kind })}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`admin:cfg.kind${k[0]!.toUpperCase()}${k.slice(1)}`)}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin:cfg.price')}>
          <input
            className={fieldClass}
            inputMode="decimal"
            value={d.price}
            onChange={(e) => setD({ ...d, price: e.target.value })}
          />
        </Field>
        <Field label={t('admin:cfg.maxQty')}>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={d.max_qty}
            onChange={(e) => setD({ ...d, max_qty: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
      </div>

      <Field label={t('admin:cfg.order')}>
        <input
          className={fieldClass}
          inputMode="numeric"
          value={d.sort_order}
          onChange={(e) => setD({ ...d, sort_order: e.target.value.replace(/\D/g, '') })}
        />
      </Field>

      <ActiveToggle
        checked={d.is_active}
        onChange={(v) => setD({ ...d, is_active: v })}
        labelOn={t('admin:cfg.active')}
        labelOff={t('admin:cfg.inactive')}
      />

      <Button
        className="self-start"
        onClick={() =>
          onSave({
            id: row.id,
            patch: {
              name: d.name.trim(),
              kind: d.kind,
              price: Number(d.price),
              max_qty: Number(d.max_qty),
              sort_order: Number(d.sort_order),
              is_active: d.is_active,
            },
          })
        }
      >
        {t('admin:cfg.saveRow')}
      </Button>
    </EditorRow>
  )
}

export function ErrorCard({ error }: { error: unknown }) {
  const { t } = useTranslation(['admin', 'common'])
  return (
    <Card className="border-st-cancel-fg p-4" role="alert">
      <p className="break-words text-st-cancel-fg">{crudError(error, t)}</p>
    </Card>
  )
}
