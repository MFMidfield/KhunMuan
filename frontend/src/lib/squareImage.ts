/**
 * Centre-crops an image to a square, shrinks it, and re-encodes it as WebP.
 *
 * Done here rather than in an Edge Function on the way in, because the cost
 * this removes is the *upload*: a 4 MB photo straight off a phone spends thirty
 * seconds on campus wifi before a server-side resize ever sees it. Squeezing it
 * to roughly a hundred kilobytes first makes the upload instant and the menu
 * fast, and it means no second service has to be running for a photo to work.
 *
 * Square because doc 04 §6 says filling photos are 1:1 — they tile evenly in
 * the builder grid at any column count.
 */
const MAX_EDGE = 1200
const QUALITY = 0.82

export async function toSquareWebp(file: File): Promise<File> {
  // PDFs and anything the browser cannot decode pass through untouched; the
  // caller's own type check has already decided what is allowed.
  if (!file.type.startsWith('image/')) return file

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  const edge = Math.min(bitmap.width, bitmap.height)
  const size = Math.min(edge, MAX_EDGE)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')
  if (!ctx) return file

  ctx.drawImage(
    bitmap,
    // Centre crop: take the middle square of whatever shape came in.
    (bitmap.width - edge) / 2,
    (bitmap.height - edge) / 2,
    edge,
    edge,
    0,
    0,
    size,
    size,
  )
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', QUALITY),
  )

  // A browser that cannot encode WebP hands back null. The original is still a
  // perfectly good photo; it is only bigger.
  if (!blob) return file

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
    type: 'image/webp',
  })
}
