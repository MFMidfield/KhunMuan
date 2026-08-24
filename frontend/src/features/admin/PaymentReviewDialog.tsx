import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

/**
 * The one screen where the shop decides whether money arrived.
 *
 * The slip is shown here rather than behind a link because the decision cannot
 * be made without looking at it, and a decision that can be taken without
 * looking is one that will be. The confirm button is dead for three seconds for
 * the same reason: this tap both marks the order paid and accepts it, and it
 * sits where the accept button used to be on a board people tap fast.
 *
 * Rejecting is not delayed. It does not finish anything — it opens the reason
 * dialog, which is its own deliberate step.
 */
export function PaymentReviewDialog({
  slipPath,
  total,
  code,
  busy,
  delaySeconds = 3,
  onAccept,
  onReject,
  onClose,
}: {
  slipPath: string | null
  total: number
  code: string
  busy: boolean
  delaySeconds?: number
  onAccept: () => void
  onReject: () => void
  onClose: () => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [left, setLeft] = useState(delaySeconds)

  useEffect(() => {
    if (left <= 0) return
    const id = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [left])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /**
   * Signed for two minutes, not for the session. The bucket is private and
   * stays private — a URL that still works after this dialog closes is a URL
   * that ends up in a group chat, and a slip carries a name, part of an account
   * number and an amount.
   */
  const slip = useQuery({
    queryKey: ['slip-url', slipPath],
    enabled: Boolean(slipPath),
    staleTime: 90_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('slips')
        .createSignedUrl(slipPath!, 120)
      if (error) throw error
      return data.signedUrl
    },
  })

  const waiting = left > 0
  const isPdf = slipPath?.toLowerCase().endsWith('.pdf') ?? false

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={t('common:close')}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('admin:payReviewTitle')}
        className={[
          'relative flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto',
          'rounded-t-card border border-border bg-surface p-5 pb-safe sm:rounded-card',
        ].join(' ')}
      >
        <h2 className="font-semibold">{t('admin:payReviewTitle')}</h2>
        <p className="mt-1 text-[0.9rem] text-ink-muted">
          <span className="tnum">{code}</span> · {t('admin:payReviewAmount')}{' '}
          <span className="tnum font-semibold text-ink">{money.format(total)}</span>
        </p>

        <div className="mt-4 flex min-h-40 items-center justify-center rounded-card border border-border bg-surface-2 p-2">
          {!slipPath ? (
            <p className="p-4 text-center text-[0.9rem] text-gold-ink">
              {t('admin:payReviewNoSlip')}
            </p>
          ) : slip.isPending ? (
            <Spinner />
          ) : slip.error || !slip.data ? (
            <p className="p-4 text-center text-[0.9rem] text-st-cancel-fg">
              {t('admin:payReviewSlipFailed')}
            </p>
          ) : isPdf ? (
            // A PDF has no useful inline preview at this size, so it opens in a
            // tab instead of being crammed into an iframe nobody can read.
            <a
              href={slip.data}
              target="_blank"
              rel="noopener"
              className="min-h-11 px-3 py-3 text-gold-ink underline"
            >
              {t('admin:payReviewOpenPdf')}
            </a>
          ) : (
            <a href={slip.data} target="_blank" rel="noopener">
              <img
                src={slip.data}
                alt={t('admin:payReviewTitle')}
                className="max-h-[46vh] w-auto rounded-btn"
              />
            </a>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Button
            size="lg"
            disabled={waiting || busy}
            onClick={onAccept}
          >
            {waiting ? t('common:waitSeconds', { count: left }) : t('admin:payReviewAccept')}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" className="flex-1" onClick={onClose}>
              {t('common:close')}
            </Button>
            <Button variant="danger" size="lg" className="flex-1" disabled={busy} onClick={onReject}>
              {t('admin:payReviewReject')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
