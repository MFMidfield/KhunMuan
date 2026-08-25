import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { dayAndMonth, timeOfDay } from '@/lib/i18n'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Database } from '@/types/database'

const KEY = ['blocked-lookup-ips'] as const

/** Generated, so a change to the function's shape breaks the build here. */
type BlockedRow = Database['public']['Functions']['blocked_lookup_ips']['Returns'][number]

/**
 * The other half of the rate limit (doc 05 §4).
 *
 * Blocking by IP hash stops someone working through the code space, and it also
 * catches the customer who mistyped their own code three times in a minute.
 * Until this screen existed the limit had a door and no key: the block cleared
 * itself after fifteen minutes and nobody could do anything for the person on
 * the phone in the meantime.
 *
 * Any admin, not just the owner. The people who take that call are the six on
 * shift, and a fix that needs the owner's account is a fix that waits.
 *
 * The hash is opaque and the whole log is deleted after 24 hours, so what this
 * undoes is a false positive — it is not a way to find out who anyone is.
 */
export function BlockedPage() {
  const { t } = useTranslation(['admin', 'common'])
  const [confirming, setConfirming] = useState<string | null>(null)

  const list = useQuery({
    queryKey: KEY,
    // Short, because the point of the screen is someone waiting on the phone.
    staleTime: 5_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<BlockedRow[]> => {
      const { data, error } = await supabase.rpc('blocked_lookup_ips', { p_limit: 100 })
      if (error) throw error
      return data ?? []
    },
  })

  const unblock = useMutation({
    mutationFn: async (ipHash: string) => {
      const { error } = await supabase.rpc('unblock_ip', { p_ip_hash: ipHash })
      if (error) throw error
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  if (list.isPending) return <PageSpinner />

  // A failed refetch keeps the rows that are already on screen; the error card
  // above says so rather than the list vanishing under whoever is reading it.
  const rows = list.data ?? []

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">{t('admin:blockedTitle')}</h1>
        <p className="mt-1 text-[0.9rem] text-ink-muted">{t('admin:blockedHelp')}</p>
      </div>

      {list.error && (
        <Card className="p-4">
          <p className="break-words text-st-cancel-fg">{list.error.message}</p>
        </Card>
      )}

      {unblock.error && (
        <Card className="p-4">
          <p role="alert" className="break-words text-st-cancel-fg">
            {(unblock.error as Error).message}
          </p>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="p-4 text-[0.9rem] text-ink-muted">{t('admin:blockedEmpty')}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.ip_hash}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[0.75rem] text-ink-muted">
                    {t('admin:blockedDevice')}
                  </span>
                  {/* Twelve characters is enough to tell two rows apart and
                      never enough to be anything else. */}
                  <span className="tnum font-semibold break-all">
                    {row.ip_hash.slice(0, 12)}
                  </span>
                  {/* Which refusal, because they are two different
                      conversations to have with the customer: "you typed too
                      fast" and "you got three codes wrong". */}
                  <span className="ms-auto rounded-full bg-surface-2 px-2 py-0.5 text-[0.75rem] text-ink-muted">
                    {t(`admin:blockedReason.${row.reason}`)}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.85rem] sm:grid-cols-4">
                  <Stat label={t('admin:blockedMisses')} value={String(row.misses)} />
                  <Stat label={t('admin:blockedAttempts')} value={String(row.attempts)} />
                  <Stat label={t('admin:blockedFirst')} value={when(row.first_seen)} />
                  <Stat label={t('admin:blockedLast')} value={when(row.last_seen)} />
                </dl>

                <div>
                  <p className="text-[0.75rem] text-ink-muted">{t('admin:blockedCodes')}</p>
                  <p className="tnum break-all">{row.codes_tried.join(' · ')}</p>
                </div>

                <Button
                  className="self-start"
                  disabled={unblock.isPending}
                  onClick={() => setConfirming(row.ip_hash)}
                >
                  {t('admin:blockedUnblock')}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <ConfirmDialog
          title={t('admin:blockedConfirmTitle')}
          body={t('admin:blockedConfirmBody')}
          confirmLabel={t('admin:blockedUnblock')}
          cancelLabel={t('common:cancel')}
          // No countdown. The dialog is here to name which device is about to
          // be cleared, not to slow anyone down: unblocking undoes a block, and
          // the worst case is that the next mistyped code re-arms it.
          delaySeconds={0}
          busy={unblock.isPending}
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            unblock.mutate(confirming)
            setConfirming(null)
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.75rem] text-ink-muted">{label}</dt>
      <dd className="tnum font-medium">{value}</dd>
    </div>
  )
}

function when(iso: string): string {
  const at = new Date(iso)
  return `${dayAndMonth.format(at)} ${timeOfDay.format(at)}`
}
