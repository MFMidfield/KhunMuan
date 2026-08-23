import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageSpinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { ActiveToggle, AddRow, EditorList, EditorRow, Field } from './EditorShell'
import { fieldClass } from './editorStyles'
import { ErrorCard } from './MenuAdminPage'
import { useTableCrud } from './useTableCrud'
import type { Database } from '@/types/database'

type Tables = Database['public']['Tables']

/** Pickup points — Q11. */
export function PointsEditor() {
  const { t } = useTranslation(['admin', 'common'])
  const { list, insert, update, remove } = useTableCrud('pickup_points', 'sort_order')
  const [draft, setDraft] = useState({ name: '', detail: '' })

  if (list.isPending) return <PageSpinner />
  if (list.error) return <ErrorCard error={list.error} />
  const error = insert.error ?? update.error ?? remove.error

  return (
    <>
      {error && <ErrorCard error={error} />}
      <EditorList>
        {list.data.map((row) => (
          <PointRow key={row.id} row={row} onSave={update.mutate} onDelete={remove.mutate} />
        ))}
        <AddRow
          label={t('admin:cfg.add')}
          disabled={!draft.name.trim()}
          onAdd={() => {
            insert.mutate({
              name: draft.name.trim(),
              detail: draft.detail.trim() || null,
              sort_order: (list.data.at(-1)?.sort_order ?? 0) + 1,
            })
            setDraft({ name: '', detail: '' })
          }}
        >
          <Field label={t('admin:cfg.name')}>
            <input
              className={fieldClass}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label={t('admin:cfg.pointDetail')}>
            <input
              className={fieldClass}
              value={draft.detail}
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
            />
          </Field>
        </AddRow>
      </EditorList>
    </>
  )
}

function PointRow({
  row,
  onSave,
  onDelete,
}: {
  row: Tables['pickup_points']['Row']
  onSave: (args: { id: string; patch: Tables['pickup_points']['Update'] }) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [d, setD] = useState({
    name: row.name,
    detail: row.detail ?? '',
    sort_order: String(row.sort_order),
    is_active: row.is_active,
  })

  return (
    <EditorRow
      title={row.name}
      subtitle={row.detail ?? undefined}
      active={row.is_active}
      onDelete={() => {
        if (confirm(t('admin:cfg.confirmDelete', { name: row.name }))) onDelete(row.id)
      }}
    >
      <Field label={t('admin:cfg.name')}>
        <input className={fieldClass} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>
      <Field label={t('admin:cfg.pointDetail')}>
        <input className={fieldClass} value={d.detail} onChange={(e) => setD({ ...d, detail: e.target.value })} />
      </Field>
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
              detail: d.detail.trim() || null,
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

/** Pickup slots — Q12, including the cutoff. */
export function SlotsEditor() {
  const { t } = useTranslation(['admin', 'common'])
  const { list, insert, update, remove } = useTableCrud('pickup_slots', 'starts_at_local')
  const [draft, setDraft] = useState({ label: '', starts_at_local: '' })

  if (list.isPending) return <PageSpinner />
  if (list.error) return <ErrorCard error={list.error} />
  const error = insert.error ?? update.error ?? remove.error

  return (
    <>
      {error && <ErrorCard error={error} />}
      <EditorList>
        {list.data.map((row) => (
          <SlotRow key={row.id} row={row} onSave={update.mutate} onDelete={remove.mutate} />
        ))}
        <AddRow
          label={t('admin:cfg.add')}
          disabled={!draft.label.trim() || !draft.starts_at_local}
          onAdd={() => {
            insert.mutate({
              label: draft.label.trim(),
              starts_at_local: draft.starts_at_local,
            })
            setDraft({ label: '', starts_at_local: '' })
          }}
        >
          <Field label={t('admin:cfg.slotLabel')}>
            <input
              className={fieldClass}
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </Field>
          <Field label={t('admin:cfg.slotStart')}>
            <input
              className={fieldClass}
              type="time"
              value={draft.starts_at_local}
              onChange={(e) => setDraft({ ...draft, starts_at_local: e.target.value })}
            />
          </Field>
        </AddRow>
      </EditorList>
    </>
  )
}

function SlotRow({
  row,
  onSave,
  onDelete,
}: {
  row: Tables['pickup_slots']['Row']
  onSave: (args: { id: string; patch: Tables['pickup_slots']['Update'] }) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [d, setD] = useState({
    label: row.label,
    // Postgres hands back HH:MM:SS; the time input wants HH:MM.
    starts_at_local: row.starts_at_local.slice(0, 5),
    capacity: row.capacity === null ? '' : String(row.capacity),
    cutoff_minutes: row.cutoff_minutes === null ? '' : String(row.cutoff_minutes),
    is_active: row.is_active,
  })

  return (
    <EditorRow
      title={row.label}
      subtitle={row.starts_at_local.slice(0, 5)}
      active={row.is_active}
      onDelete={() => {
        if (confirm(t('admin:cfg.confirmDelete', { name: row.label }))) onDelete(row.id)
      }}
    >
      <Field label={t('admin:cfg.slotLabel')}>
        <input className={fieldClass} value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
      </Field>
      <Field label={t('admin:cfg.slotStart')}>
        <input
          className={fieldClass}
          type="time"
          value={d.starts_at_local}
          onChange={(e) => setD({ ...d, starts_at_local: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin:cfg.slotCapacity')} hint={t('admin:cfg.unlimited')}>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={d.capacity}
            onChange={(e) => setD({ ...d, capacity: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
        <Field label={t('admin:cfg.slotCutoff')} hint={t('admin:cfg.slotCutoffHint')}>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={d.cutoff_minutes}
            onChange={(e) => setD({ ...d, cutoff_minutes: e.target.value.replace(/\D/g, '') })}
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
              label: d.label.trim(),
              starts_at_local: d.starts_at_local,
              capacity: d.capacity === '' ? null : Number(d.capacity),
              cutoff_minutes: d.cutoff_minutes === '' ? null : Number(d.cutoff_minutes),
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

/** Delivery zones — Q7. One zone hides the picker on the customer's checkout. */
export function ZonesEditor() {
  const { t } = useTranslation(['admin', 'common'])
  const { list, insert, update, remove } = useTableCrud('delivery_zones', 'sort_order')
  const [draft, setDraft] = useState({ name: '', fee: '' })

  if (list.isPending) return <PageSpinner />
  if (list.error) return <ErrorCard error={list.error} />
  const error = insert.error ?? update.error ?? remove.error

  return (
    <>
      {error && <ErrorCard error={error} />}
      <EditorList>
        {list.data.map((row) => (
          <ZoneRow key={row.id} row={row} onSave={update.mutate} onDelete={remove.mutate} />
        ))}
        <AddRow
          label={t('admin:cfg.add')}
          disabled={!draft.name.trim() || draft.fee === ''}
          onAdd={() => {
            insert.mutate({
              name: draft.name.trim(),
              fee: Number(draft.fee),
              sort_order: (list.data.at(-1)?.sort_order ?? 0) + 1,
            })
            setDraft({ name: '', fee: '' })
          }}
        >
          <Field label={t('admin:cfg.name')}>
            <input
              className={fieldClass}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label={t('admin:cfg.zoneFee')}>
            <input
              className={fieldClass}
              inputMode="decimal"
              value={draft.fee}
              onChange={(e) => setDraft({ ...draft, fee: e.target.value })}
            />
          </Field>
        </AddRow>
      </EditorList>
    </>
  )
}

function ZoneRow({
  row,
  onSave,
  onDelete,
}: {
  row: Tables['delivery_zones']['Row']
  onSave: (args: { id: string; patch: Tables['delivery_zones']['Update'] }) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [d, setD] = useState({
    name: row.name,
    fee: String(row.fee),
    sort_order: String(row.sort_order),
    is_active: row.is_active,
  })

  return (
    <EditorRow
      title={row.name}
      subtitle={String(row.fee)}
      active={row.is_active}
      onDelete={() => {
        if (confirm(t('admin:cfg.confirmDelete', { name: row.name }))) onDelete(row.id)
      }}
    >
      <Field label={t('admin:cfg.name')}>
        <input className={fieldClass} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin:cfg.zoneFee')}>
          <input
            className={fieldClass}
            inputMode="decimal"
            value={d.fee}
            onChange={(e) => setD({ ...d, fee: e.target.value })}
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
              fee: Number(d.fee),
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
