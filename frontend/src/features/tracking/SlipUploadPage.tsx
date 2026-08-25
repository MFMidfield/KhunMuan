import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/i18n'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { MenuImage } from '@/components/ui/MenuImage'
import { checkSlipFile, SLIP_TYPES } from '@/lib/slip'
import { useShopSettings } from '@/features/menu/queries'
import { tokenForCode } from './myOrders'

/**
 * Where a customer attaches proof of a transfer.
 *
 * Only the device that placed the order can reach it: attaching a payment to
 * somebody else's order is exactly the mischief the token exists to prevent, so
 * a visitor who only knows the code is told plainly rather than shown a button
 * that will fail.
 */
export function SlipUploadPage() {
  const { code = '' } = useParams<{ code: string }>()
  const { t } = useTranslation(['tracking', 'common'])
  const { data: settings } = useShopSettings()
  const [error, setError] = useState<string | null>(null)

  const token = tokenForCode(code)

  const status = useQuery({
    queryKey: ['slip-status', code.toUpperCase()],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error: lookupError } = await supabase.functions.invoke<{
        total: number
        payment: { state: string } | null
      }>('track', { body: { code, client_token: token } })
      if (lookupError) throw lookupError
      return data!
    },
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      checkSlipFile(file)

      const { data: grant, error: grantError } = await supabase.functions.invoke<{
        path: string
        token: string
      }>('slip-upload-url', {
        body: { code, client_token: token, content_type: file.type },
      })
      if (grantError || !grant) throw new Error('slipFailed')

      const { error: putError } = await supabase.storage
        .from('slips')
        .uploadToSignedUrl(grant.path, grant.token, file, { contentType: file.type })
      if (putError) throw new Error('slipFailed')

      const { error: attachError } = await supabase.rpc('attach_slip', {
        p_code: code,
        p_client_token: token!,
        p_path: grant.path,
      })
      if (attachError) throw new Error('slipFailed')
    },
    onSuccess: () => {
      setError(null)
      void status.refetch()
    },
    onError: (e: Error) => setError(e.message),
  })

  if (!token) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Card className="p-5">
          <p className="text-ink-muted">{t('tracking:slipOnlyOwner')}</p>
        </Card>
        <BackHome />
      </div>
    )
  }

  if (status.isPending) return <PageSpinner />

  const uploaded = status.data?.payment?.state === 'slip_uploaded'
  const paid = status.data?.payment?.state === 'paid'

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t('tracking:slipTitle')}</h1>

      <Card className="flex flex-col items-center gap-3 p-5 text-center">
        <p className="text-[0.85rem] text-ink-muted">{t('tracking:slipAmount')}</p>
        <p className="tnum text-3xl font-semibold">
          {money.format(Number(status.data?.total ?? 0))}
        </p>

        {settings?.promptpay_qr_path ? (
          <>
            <p className="text-[0.85rem] text-ink-muted">{t('tracking:slipScan')}</p>
            <div className="w-56 max-w-full">
              <MenuImage path={settings.promptpay_qr_path} alt={t('tracking:slipScan')} />
            </div>
          </>
        ) : (
          <p className="text-[0.85rem] text-gold-ink">{t('tracking:slipNoQr')}</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        {paid || uploaded ? (
          <p className={paid ? 'text-st-ready-fg' : 'text-ink-muted'}>
            {t('tracking:slipDone')}
          </p>
        ) : (
          <p className="text-[0.95rem]">{t('tracking:slipNeeded')}</p>
        )}

        <label className="flex flex-col gap-2">
          <span className="sr-only">{t('tracking:slipPick')}</span>
          <input
            type="file"
            accept={SLIP_TYPES.join(',')}
            disabled={upload.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file)
              e.target.value = ''
            }}
            className="hidden"
            id="slip-file"
          />
          <Button
            size="lg"
            disabled={upload.isPending}
            onClick={() => document.getElementById('slip-file')?.click()}
          >
            {upload.isPending
              ? t('tracking:slipUploading')
              : uploaded
                ? t('tracking:slipAgain')
                : t('tracking:slipPick')}
          </Button>
        </label>

        {error && (
          <p role="alert" className="text-[0.85rem] text-st-cancel-fg">
            {t(`tracking:${error}`)}
          </p>
        )}
      </Card>

      <BackHome />
    </div>
  )
}

/** Every customer screen that can be arrived at directly needs one of these. */
function BackHome() {
  const { t } = useTranslation(['common'])
  const navigate = useNavigate()
  return (
    <Button variant="ghost" size="lg" onClick={() => void navigate('/')}>
      {t('common:backToShop')}
    </Button>
  )
}
