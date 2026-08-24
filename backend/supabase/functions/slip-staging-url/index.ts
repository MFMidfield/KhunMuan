// slip-staging-url · a signed upload URL for a slip whose order does not exist yet
//
// The checkout screen asks for the slip before it places the order, so there is
// no code and no client_token to prove anything with — the sibling function
// slip-upload-url exists precisely because those two are what authorise an
// upload once the order is real.
//
// What replaces them here is: the caller may only write to a path this function
// just minted, that path is recorded in `staged_slips` before it is handed out,
// and place_order will only accept a path it finds in that table unclaimed. A
// file uploaded and never turned into an order is deleted within six hours.
//
// The IP is hashed with the same salt as the code lookup (0018) and never
// stored raw. It is the only thing standing between this endpoint and someone
// filling the bucket, which is why a missing salt fails the request instead of
// quietly degrading.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SALT = Deno.env.get('LOOKUP_IP_SALT') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

const STATUS: Record<string, number> = {
  RATE_LIMITED: 429,
  MISSING_CLIENT_FINGERPRINT: 400,
  INVALID_PAYLOAD: 400,
}

function clientIp(req: Request): string {
  // The first entry is the client; the rest are proxies that appended
  // themselves, and trusting the last one would rate-limit the CDN.
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return req.headers.get('cf-connecting-ip') ?? 'unknown'
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!SALT) {
    return json({ message: 'LOOKUP_SALT_NOT_CONFIGURED' }, 500)
  }

  let body: { content_type?: string }
  try {
    body = await req.json()
  } catch {
    return json({ message: 'INVALID_PAYLOAD' }, 400)
  }

  const extension = EXTENSIONS[body.content_type ?? '']
  if (!extension) return json({ message: 'INVALID_PAYLOAD' }, 400)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // The path is minted and recorded in one call, so there is no window in which
  // a URL exists that place_order would not recognise.
  const { data: path, error } = await supabase.rpc('issue_staged_slip', {
    p_ip_hash: await hashIp(clientIp(req)),
    p_extension: extension,
  })

  if (error) {
    return json({ message: error.message }, STATUS[error.message] ?? 500)
  }

  const { data: grant, error: signError } = await supabase.storage
    .from('slips')
    .createSignedUploadUrl(path as unknown as string)

  if (signError) return json({ message: signError.message }, 500)

  return json({ path, token: grant.token, signed_url: grant.signedUrl }, 200)
})

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
