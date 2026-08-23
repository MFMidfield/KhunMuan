import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { ActiveToggle, AddRow, EditorList, EditorRow, Field } from './EditorShell'
import { fieldClass } from './editorStyles'
import { ErrorCard } from './MenuAdminPage'
import { useTableCrud } from './useTableCrud'
import type { Database } from '@/types/database'

type AdminRow = Database['public']['Tables']['admin_users']['Row']

/**
 * The allow-list, which is what Q13 turned into.
 *
 * Access is granted by adding an address here **first**; Google sign-in
 * succeeds for any account and the allow-list is the only thing that makes one
 * of them staff. Adding someone who has already tried and been refused works
 * too — a trigger links their existing auth row on the way in.
 *
 * The superadmin row is rendered but not editable. RLS refuses any write
 * touching `role = 'superadmin'` on either side, so the screen states the rule
 * rather than offering a control the database will reject.
 */
export function StaffPage() {
  const { t } = useTranslation(['admin', 'common'])
  const { list, insert, update, remove } = useTableCrud('admin_users', 'created_at')
  const [draft, setDraft] = useState({ email: '', display_name: '' })

  if (list.isPending) return <PageSpinner />
  if (list.error) return <ErrorCard error={list.error} />

  const error = insert.error ?? update.error ?? remove.error

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t('admin:cfg.staffTitle')}</h1>

      {error && <ErrorCard error={error} />}

      <EditorList>
        {list.data.map((row) =>
          row.role === 'superadmin' ? (
            <li key={row.id}>
              <Card className="p-4">
                <p className="font-medium break-words">{row.display_name}</p>
                <p className="text-[0.85rem] break-all text-ink-muted">{row.email}</p>
                <p className="mt-2 text-[0.8rem] text-ink-muted">
                  {t('admin:cfg.roleSuperadmin')} · {t('admin:cfg.ownerLocked')}
                </p>
              </Card>
            </li>
          ) : (
            <StaffRow key={row.id} row={row} onSave={update.mutate} onDelete={remove.mutate} />
          ),
        )}

        <AddRow
          label={t('admin:cfg.add')}
          disabled={!draft.email.trim() || !draft.display_name.trim()}
          onAdd={() => {
            insert.mutate({
              // Lower-cased and trimmed by a trigger anyway; doing it here too
              // means the row the owner sees matches the row that was stored.
              email: draft.email.trim().toLowerCase(),
              display_name: draft.display_name.trim(),
              role: 'admin',
            })
            setDraft({ email: '', display_name: '' })
          }}
        >
          <Field label={t('admin:cfg.staffEmail')}>
            <input
              className={fieldClass}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>
          <Field label={t('admin:cfg.staffName')}>
            <input
              className={fieldClass}
              value={draft.display_name}
              onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
            />
          </Field>
        </AddRow>
      </EditorList>
    </div>
  )
}

function StaffRow({
  row,
  onSave,
  onDelete,
}: {
  row: AdminRow
  onSave: (args: { id: string; patch: Database['public']['Tables']['admin_users']['Update'] }) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [d, setD] = useState({
    display_name: row.display_name,
    is_active: row.is_active,
  })

  return (
    <EditorRow
      title={row.display_name}
      subtitle={row.email}
      active={row.is_active}
      onDelete={() => {
        if (confirm(t('admin:cfg.confirmDelete', { name: row.display_name }))) onDelete(row.id)
      }}
    >
      <Field label={t('admin:cfg.staffName')}>
        <input
          className={fieldClass}
          value={d.display_name}
          onChange={(e) => setD({ ...d, display_name: e.target.value })}
        />
      </Field>

      <p className="text-[0.8rem] text-ink-muted">
        {row.auth_user_id ? t('admin:cfg.signedInOnce') : t('admin:cfg.neverSignedIn')}
      </p>

      {/* Deactivating is the usual move, not deleting: it takes effect on the
          person's next request because every policy resolves the role from this
          table at query time, and it keeps the name on their historical
          order_events rows. */}
      <ActiveToggle
        checked={d.is_active}
        onChange={(v) => setD({ ...d, is_active: v })}
        labelOn={t('admin:cfg.activeStaff')}
        labelOff={t('admin:cfg.inactiveStaff')}
      />

      <Button
        className="self-start"
        onClick={() =>
          onSave({
            id: row.id,
            patch: { display_name: d.display_name.trim(), is_active: d.is_active },
          })
        }
      >
        {t('admin:cfg.saveRow')}
      </Button>
    </EditorRow>
  )
}
