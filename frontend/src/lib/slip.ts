import { supabase } from './supabase'

/**
 * The two limits the `slips` bucket enforces, restated on the client.
 *
 * Checked here so a 12 MB photo says so in Thai before it spends thirty seconds
 * uploading. Storage enforces the same two, and that is the copy that holds —
 * these exist to make the failure fast and legible, not to be the rule.
 */
export const SLIP_MAX_BYTES = 5 * 1024 * 1024
export const SLIP_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function checkSlipFile(file: File) {
  if (!SLIP_TYPES.includes(file.type)) throw new Error('slipWrongType')
  if (file.size > SLIP_MAX_BYTES) throw new Error('slipTooBig')
}

/**
 * Uploads a slip that has no order yet, and returns the path to hand to
 * `place_order`.
 *
 * The checkout screen asks for the slip before the order exists, so there is no
 * code and no client_token to authorise with. The `slip-staging-url` Edge
 * Function mints a path, records it, and hands back a signed URL scoped to that
 * one path — see migration 0028. Nothing here can choose where the file lands.
 */
export async function stageSlip(file: File): Promise<string> {
  checkSlipFile(file)

  const { data: grant, error } = await supabase.functions.invoke<{
    path: string
    token: string
  }>('slip-staging-url', { body: { content_type: file.type } })

  if (error || !grant) throw new Error('slipFailed')

  const { error: putError } = await supabase.storage
    .from('slips')
    .uploadToSignedUrl(grant.path, grant.token, file, { contentType: file.type })

  if (putError) throw new Error('slipFailed')

  return grant.path
}
