// slip-prune · deletes slips past the shop's retention window
//
// Woken hourly-ish by pg_cron through pg_net. It runs here rather than in SQL
// because deleting the storage.objects row removes the metadata and not
// reliably the bytes behind it — and a retention promise kept only in metadata
// is not a retention promise.
//
// Idempotent: a failed run simply happens again tomorrow.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(async () => {
  const { data: expired, error } = await supabase.rpc('expired_slips')

  if (error) {
    return new Response(JSON.stringify({ message: error.message }), { status: 500 })
  }

  const rows = (expired ?? []) as { order_id: string; slip_path: string }[]

  if (rows.length > 0) {
    const { error: removeError } = await supabase.storage
      .from('slips')
      .remove(rows.map((r) => r.slip_path))

    if (removeError) {
      return new Response(JSON.stringify({ message: removeError.message }), { status: 500 })
    }

    // Only after the bytes are gone. Clearing the column first would leave a
    // file nothing points at, which is the worst of both outcomes.
    for (const row of rows) {
      await supabase.rpc('forget_slip', { p_order_id: row.order_id })
    }
  }

  // Abandoned checkouts (0028). These are slips whose order was never placed,
  // so they belong to nobody and the shop's retention window — which is about
  // how long a *payment* is kept — has nothing to say about them. Six hours.
  const { data: orphans, error: orphanError } = await supabase.rpc('orphan_staged_slips')

  if (orphanError) {
    return new Response(JSON.stringify({ message: orphanError.message }), { status: 500 })
  }

  const staged = (orphans ?? []) as { id: string; path: string }[]

  if (staged.length > 0) {
    const { error: removeError } = await supabase.storage
      .from('slips')
      .remove(staged.map((r) => r.path))

    if (removeError) {
      return new Response(JSON.stringify({ message: removeError.message }), { status: 500 })
    }

    for (const row of staged) {
      await supabase.rpc('forget_staged_slip', { p_id: row.id })
    }
  }

  return new Response(
    JSON.stringify({ deleted: rows.length, staged_deleted: staged.length }),
    { status: 200 },
  )
})
