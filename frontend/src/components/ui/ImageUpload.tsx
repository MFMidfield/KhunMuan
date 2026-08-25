import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { toSquareWebp } from '@/lib/squareImage'
import { MenuImage } from './MenuImage'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Uploads into the public `menu` bucket and hands back the object path.
 *
 * Both limits are checked here and again by storage itself. The client check is
 * for the person — a 12 MB photo straight off a phone should say so in Thai
 * before it spends thirty seconds uploading, not after. The storage-side limit
 * is the one that actually holds.
 *
 * The path carries a timestamp so replacing a photo writes a new object rather
 * than overwriting one a CDN may still be serving.
 */
export function ImageUpload({
  folder,
  path,
  alt,
  onUploaded,
}: {
  folder: string
  path: string | null
  alt: string
  onUploaded: (path: string) => void
}) {
  const { t } = useTranslation('admin')
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File) {
    setError(null)

    if (!ALLOWED.includes(file.type) || file.size > MAX_BYTES) {
      setError(t('cfg.uploadHint'))
      return
    }

    setBusy(true)

    // Cropped square and re-encoded before it leaves the device. The size check
    // above is against the original, deliberately: telling someone their photo
    // is too big only after silently shrinking it would be nonsense.
    const prepared = await toSquareWebp(file)
    const extension = prepared.type === 'image/webp'
      ? 'webp'
      : (prepared.name.split('.').pop()?.toLowerCase() ?? 'jpg')
    const objectPath = `${folder}/${crypto.randomUUID()}-${Date.now()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('menu')
      .upload(objectPath, prepared, { contentType: prepared.type })

    setBusy(false)
    if (uploadError) {
      setError(uploadError.message)
      return
    }
    onUploaded(objectPath)
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-20 shrink-0">
        <MenuImage path={path} alt={alt} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void pick(file)
            // Cleared so choosing the same file twice still fires a change.
            e.target.value = ''
          }}
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={[
            'min-h-11 rounded-btn border border-border-strong bg-surface px-3',
            'text-[0.9rem] text-ink disabled:opacity-45',
          ].join(' ')}
        >
          {busy ? t('cfg.uploading') : t('cfg.upload')}
        </button>

        <p className="text-[0.75rem] text-ink-muted">{t('cfg.uploadHint')}</p>

        {error && (
          <p role="alert" className="text-[0.8rem] break-words text-st-cancel-fg">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
