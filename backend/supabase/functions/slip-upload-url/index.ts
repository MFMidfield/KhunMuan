// slip-upload-url · hands a customer one narrow way to upload their slip
//
// The customer has no account and no session, so they cannot be given write
// access to storage. Instead this function checks that they hold the token for
// the order they claim, then issues a signed upload URL scoped to a single
// object path under that order's id. They cannot list the bucket, cannot read
// any object, and cannot write anywhere but the one path they were handed.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let body: { code?: string; client_token?: string; content_type?: string }
  try {
    body = await req.json()
  } catch {
    return json({ message: 'INVALID_PAYLOAD' }, 400)
  }

  const extension = EXTENSIONS[body.content_type ?? '']
  if (!body.code || !body.client_token || !extension) {
    return json({ message: 'INVALID_PAYLOAD' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // The token is the whole authorisation. Matching on both columns means a
  // guessed code without the token gets the same answer as a code that does not
  // exist, which is the rule the rest of the customer path follows.
  const { data: order, error: lookupError } = await supabase
    .from('orders')
    .select('id, status')
    .eq('code', body.code.trim().toUpperCase())
    .eq('client_token', body.client_token)
    .maybeSingle()

  // Surfaced, not folded into ORDER_NOT_FOUND. A missing grant returns no rows
  // exactly like a wrong code does, and reporting the two identically hid a
  // permissions bug behind a plausible-looking 404 for as long as nobody paid
  // by transfer.
  if (lookupError) return json({ message: lookupError.message }, 500)
  if (!order) return json({ message: 'ORDER_NOT_FOUND' }, 404)

  if (['handed_over', 'cancelled', 'rejected'].includes(order.status)) {
    return json({ message: 'ORDER_CLOSED' }, 409)
  }

  // A fresh path every time rather than a fixed name per order: re-uploading
  // should not silently overwrite the slip staff may be looking at, and the
  // previous one ages out on the retention schedule like any other.
  const path = `${order.id}/${crypto.randomUUID()}.${extension}`

  const { data, error } = await supabase.storage.from('slips').createSignedUploadUrl(path)

  if (error) return json({ message: error.message }, 500)

  return json({ path, token: data.token, signed_url: data.signedUrl }, 200)
})

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
