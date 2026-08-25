import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Square, 1:1, centre-cropped — filling photos tile evenly in the builder grid
 * at any column count.
 *
 * The fallback matters more than it looks. The `menu` storage bucket does not
 * exist until Phase 3, and a filling whose photo has not been uploaded yet must
 * render as a quiet placeholder, not as a broken-image icon that makes the whole
 * menu look broken.
 */
export function MenuImage({
  path,
  alt,
  className = '',
}: {
  path: string | null
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  const url = path
    ? supabase.storage.from('menu').getPublicUrl(path).data.publicUrl
    : null

  const shell = `aspect-square w-full overflow-hidden rounded-card bg-surface-2 ${className}`

  if (!url || failed) {
    return (
      <div className={`${shell} flex items-center justify-center`} role="presentation">
        <svg viewBox="0 0 24 24" className="size-8 text-border-strong" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 12h14l-4.5-6-3.5 4.5L9 13Z"
          />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${shell} object-cover`}
    />
  )
}
