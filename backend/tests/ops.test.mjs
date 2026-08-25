// Daily rollover and the LINE outbox
// Plan: docs/plan/02-order-lifecycle.md §7, docs/plan/05-backend-security.md §6
//
//   cd backend && npm run test:ops
import crypto from 'node:crypto'

const URL = 'http://127.0.0.1:54321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

function mint(email) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const h = b64({ alg: 'HS256', typ: 'JWT' })
  const p = b64({ iss: 'supabase-demo', role: 'authenticated', aud: 'authenticated',
                  sub: crypto.randomUUID(), email, iat: now, exp: now + 3600 })
  return `${h}.${p}.` + crypto
    .createHmac('sha256', 'super-secret-jwt-token-with-at-least-32-characters-long')
    .update(`${h}.${p}`).digest('base64url')
}

const SUPER = mint('midfieldkanis1@gmail.com')
const STAFF = mint('dev-staff-a@example.com')
const OUTSIDER = mint('nobody@example.com')

let pass = 0, fail = 0
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log(`  ok   · ${n}`) }
  else { fail++; console.log(`  FAIL · ${n} ${x}`) }
}

const h = (t = ANON) => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })
const rpc = (fn, body, t) =>
  fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h(t), body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) }))
const read = (path, t) => fetch(`${URL}/rest/v1/${path}`, { headers: h(t) }).then((r) => r.json())

async function main() {
  console.log('\n— daily rollover —')
  const before = await read('filling_stock_daily?select=filling_id', STAFF)
  const outsiderRun = await rpc('run_daily_rollover', {}, OUTSIDER)
  ok('a non-staff account cannot run it', outsiderRun.b?.message === 'NOT_STAFF')

  // The seed already created today's rows, so a run now should create nothing —
  // which is the property that matters: it must be safe to run twice.
  const again = await rpc('run_daily_rollover', {}, STAFF)
  ok('staff can run it', again.s === 200, JSON.stringify(again.b))
  ok('running it twice creates nothing new', again.b?.created === 0, JSON.stringify(again.b))

  // The case the manual trigger exists for: a filling added after the morning
  // job has already run. Deleting a stock row was the obvious way to stage
  // this and is not possible — filling_stock_daily has no delete policy, so
  // the DELETE quietly changed nothing and the assertion passed on a lie.
  await fetch(`${URL}/rest/v1/fillings`, {
    method: 'POST', headers: { ...h(SUPER), Prefer: 'return=minimal' },
    body: JSON.stringify({
      name: '[DEV] ไส้เพิ่มระหว่างวัน',
      image_path: 'dev/placeholder.png',
      default_daily_qty: 12,
      sort_order: 99,
    }),
  })
  const refilled = await rpc('run_daily_rollover', {}, STAFF)
  ok('a filling added after the job gets today\'s row', refilled.b?.created === 1,
     JSON.stringify(refilled.b))

  await rpc('set_stock', { p_filling_id: 'f1000000-0000-4000-8000-000000000001', p_qty_total: 7 }, STAFF)
  await rpc('run_daily_rollover', {}, STAFF)
  const [row] = await read(
    'filling_stock_daily?select=qty_total&filling_id=eq.f1000000-0000-4000-8000-000000000001', STAFF)
  ok('a hand-set number is never overwritten', row.qty_total === 7, JSON.stringify(row))
  ok('the seed had rows to begin with', before.length > 0)

  console.log('\n— the outbox —')
  const quiet = await placeOrder()
  const none = await read(`notification_outbox?select=id&order_id=eq.${quiet.id}`, SUPER)
  ok('nothing is queued while LINE is switched off', none.length === 0, JSON.stringify(none))

  await fetch(`${URL}/rest/v1/shop_settings?id=eq.1`, {
    method: 'PATCH', headers: { ...h(SUPER), Prefer: 'return=minimal' },
    body: JSON.stringify({ line_notify_enabled: true }),
  })

  const loud = await placeOrder()
  const [queued] = await read(
    `notification_outbox?select=kind,state,payload&order_id=eq.${loud.id}`, SUPER)
  ok('an order queues one message', queued?.kind === 'new_order' && queued?.state === 'pending',
     JSON.stringify(queued))
  ok('it carries the code and the set summary',
     queued?.payload?.code === loud.code && String(queued?.payload?.summary).includes('เซตเล็ก'),
     JSON.stringify(queued?.payload))
  ok('and carries no customer identity at all',
     !('customer_name' in (queued?.payload ?? {})) &&
     !('customer_phone' in (queued?.payload ?? {})) &&
     !JSON.stringify(queued?.payload ?? {}).includes('08'),
     JSON.stringify(queued?.payload))

  console.log('\n— the drain —')
  const drain = await fetch(`${URL}/functions/v1/line-notify`, { method: 'POST', headers: h() })
  const drained = await drain.json()
  ok('it refuses to pretend, unconfigured', drained?.skipped === 'LINE_NOT_CONFIGURED', JSON.stringify(drained))

  const stillPending = await read(
    `notification_outbox?select=state&order_id=eq.${loud.id}`, SUPER)
  ok('and leaves the message queued for when it is configured',
     stillPending[0]?.state === 'pending')

  const staffPeek = await read('notification_outbox?select=id', STAFF)
  ok('a cook cannot read the queue', staffPeek.length === 0 || staffPeek.code === '42501',
     JSON.stringify(staffPeek).slice(0, 80))

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

async function placeOrder() {
  const r = await rpc('place_order', { p_payload: {
    client_request_id: crypto.randomUUID(), fulfillment: 'pickup', customer_name: 'ผู้ทดสอบ',
    pickup_point_id: 'c0000000-0000-4000-8000-000000000001',
    pickup_slot_id: '50000000-0000-4000-8000-000000000001',
    payment_method: 'cash',
    items: [{ set_id: '5e000000-0000-4000-8000-000000000001', quantity: 1,
              fillings: [{ filling_id: 'f1000000-0000-4000-8000-000000000004', qty: 5 }] }],
  } })
  return r.b
}

await main()
