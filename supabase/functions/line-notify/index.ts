// line-notify · drains the notification outbox into the shop's LINE group
//
// Woken every fifteen seconds by pg_cron, and only when something is waiting.
// It stays deliberately inert until both secrets are set: an environment
// without them should say so, not pretend the shop is being notified.
//
// Q16 decides the target. LINE's push endpoint takes a `to` that is a group id
// or a user id without caring which, so switching from a group to individual
// staff is a change to LINE_TARGET_ID and nothing else.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''
const TARGET = Deno.env.get('LINE_TARGET_ID') ?? ''

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface OutboxRow {
  id: number
  kind: string
  payload: {
    code: string
    summary: string
    fulfillment: 'pickup' | 'delivery'
    pickup_point: string | null
    pickup_slot: string | null
    total: number
  }
}

function message(row: OutboxRow): string {
  const p = row.payload
  const where =
    p.fulfillment === 'pickup'
      ? [p.pickup_point, p.pickup_slot].filter(Boolean).join(' · ')
      : 'จัดส่ง'

  // No name, no phone, no room number. This lands in a group chat, and the
  // board is one tap away for anyone who needs the rest.
  return [
    `ออเดอร์ใหม่ ${p.code}`,
    p.summary,
    where,
    `฿${Number(p.total).toLocaleString('th-TH')}`,
  ]
    .filter(Boolean)
    .join('\n')
}

Deno.serve(async () => {
  if (!TOKEN || !TARGET) {
    return json({ skipped: 'LINE_NOT_CONFIGURED' }, 200)
  }

  const { data, error } = await supabase.rpc('outbox_take', { p_limit: 20 })
  if (error) return json({ message: error.message }, 500)

  const rows = (data ?? []) as OutboxRow[]
  let sent = 0

  for (const row of rows) {
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: TARGET,
          messages: [{ type: 'text', text: message(row) }],
        }),
      })

      if (res.ok) {
        await supabase.rpc('outbox_settle', { p_id: row.id, p_ok: true })
        sent++
      } else {
        await supabase.rpc('outbox_settle', {
          p_id: row.id,
          p_ok: false,
          p_error: `${res.status} ${(await res.text()).slice(0, 300)}`,
        })
      }
    } catch (e) {
      // Left pending and retried, up to the five attempts outbox_settle counts.
      await supabase.rpc('outbox_settle', {
        p_id: row.id,
        p_ok: false,
        p_error: String(e).slice(0, 300),
      })
    }
  }

  return json({ taken: rows.length, sent }, 200)
})

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
