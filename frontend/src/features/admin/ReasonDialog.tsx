import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

/**
 * Ending an order needs a reason from the list plus optional free text (Q15).
 * The list is what makes the report groupable; the free text is what stops
 * staff picking a wrong-but-close option because the right one is missing.
 */
export function ReasonDialog({
  title,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string
  confirmLabel: string
  busy: boolean
  onConfirm: (reasonId: string, note: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [picked, setPicked] = useState('')
  const [note, setNote] = useState('')

  const { data: reasons } = useQuery({
    queryKey: ['reject-reasons'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_reject_reasons')
        .select('id, label')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  // Derived, not synced in an effect: the first reason is the default until
  // someone picks another, and an effect would briefly render with none chosen.
  const reasonId = picked || reasons?.[0]?.id || ''

  return (
    <Modal label={title} onClose={onClose}>
      <h2 className="font-semibold">{title}</h2>

      <fieldset className="mt-4 flex flex-col gap-1">
        <legend className="mb-1 text-[0.9rem] font-medium">{t('admin:reasonTitle')}</legend>
        {(reasons ?? []).map((r) => (
          <label
            key={r.id}
            className="tap-target flex min-h-11 items-center gap-3 rounded-btn px-2 hover:bg-surface-2"
          >
            <input
              type="radio"
              name="reason"
              checked={reasonId === r.id}
              onChange={() => setPicked(r.id)}
              className="size-4"
            />
            <span>{r.label}</span>
          </label>
        ))}
      </fieldset>

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-[0.9rem] font-medium">
          {t('admin:reasonDetail')}{' '}
          <span className="font-normal text-ink-muted">
            ({t('admin:reasonDetailOptional')})
          </span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={300}
          className="rounded-btn border border-border-strong bg-surface p-3 text-ink"
        />
      </label>

      <div className="mt-6 flex gap-3">
        <Button variant="ghost" size="lg" className="flex-1" onClick={onClose}>
          {t('common:cancel')}
        </Button>
        <Button
          variant="danger"
          size="lg"
          className="flex-1"
          disabled={!reasonId || busy}
          onClick={() => onConfirm(reasonId, note.trim())}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
