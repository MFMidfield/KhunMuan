// track · the public tracking endpoint
//
// Everything a customer sees about their order comes through here, because a
// plain RPC is never told the caller's IP and the rate limit in doc 05 §4 is
// per-IP. This function is the only place that address exists.
//
// It is hashed with a server-side salt and never stored raw. The hash is
// opaque, expires with the 24-hour log, and is enough to count requests without
// being enough to identify anyone.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Set per environment. Without it the hash would be a plain SHA-256 of an IP,
// which is trivially reversible for a v4 address — there are only four billion.
const SALT = Deno.env.get('LOOKUP_IP_SALT') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Errors the RPC raises, mapped to the status they actually mean. */
const STATUS: Record<string, number> = {
  RATE_LIMITED: 429,
  IP_BLOCKED: 429,
  ORDER_NOT_FOUND: 404,
  ORDER_EXPIRED: 410,
  MISSING_CLIENT_FINGERPRINT: 400,
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
    // Failing loudly beats hashing with an empty salt and pretending the
    // addresses are protected.
    return json({ message: 'LOOKUP_SALT_NOT_CONFIGURED' }, 500)
  }

  let body: { code?: string; client_token?: string | null }
  try {
    body = await req.json()
  } catch {
    return json({ message: 'INVALID_PAYLOAD' }, 400)
  }

  if (!body.code) return json({ message: 'INVALID_PAYLOAD' }, 400)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.rpc('lookup_order_tracked', {
    p_code: body.code,
    p_client_token: body.client_token ?? null,
    p_ip_hash: await hashIp(clientIp(req)),
  })

  if (error) {
    const code = error.message ?? 'UNKNOWN'
    return json({ message: code }, STATUS[code] ?? 400)
  }

  // The RPC reports refusals in the payload rather than raising them, because
  // it has an attempt to record and an exception would roll that record back
  // along with everything else.
  const refusal = (data as { error?: string } | null)?.error
  if (refusal) return json({ message: refusal }, STATUS[refusal] ?? 400)

  return json(data, 200)
})

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
