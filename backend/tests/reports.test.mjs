// Reports · docs/plan/02-order-lifecycle.md §8
//
//   cd backend && npm run test:reports
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

let pass = 0, fail = 0
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log(`  ok   · ${n}`) }
  else { fail++; console.log(`  FAIL · ${n} ${x}`) }
}

const h = (t = ANON) => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })
const rpc = (fn, body, t) =>
  fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h(t), body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) }))

const today = new Date().toISOString().slice(0, 10)

async function drive(status) {
  const placed = await rpc('place_order', { p_payload: {
    client_request_id: crypto.randomUUID(), fulfillment: 'pickup', customer_name: 'ผู้ทดสอบ',
    pickup_point_id: 'c0000000-0000-4000-8000-000000000001',
    pickup_slot_id: '50000000-0000-4000-8000-000000000001',
    payment_method: 'cash',
    items: [{ set_id: '5e000000-0000-4000-8000-000000000001', quantity: 1,
              fillings: [{ filling_id: 'f1000000-0000-4000-8000-000000000004', qty: 5 }] }],
  } })
  const [row] = await fetch(`${URL}/rest/v1/orders?select=id,version&code=eq.${placed.b.code}`,
    { headers: h(STAFF) }).then((r) => r.json())

  let v = row.version
  const step = async (to, extra = {}) => {
    const r = await rpc('advance_order',
      { p_order_id: row.id, p_to_status: to, p_expected_version: v, ...extra }, STAFF)
    if (r.b?.version !== undefined) v = r.b.version
    return r
  }

  if (status === 'handed_over') {
    await step('accepted'); await step('cooking'); await step('ready')
    await rpc('set_payment', { p_order_id: row.id, p_state: 'paid' }, STAFF)
    await step('handed_over', { p_code: placed.b.code })
  } else if (status === 'rejected') {
    const [reason] = await fetch(`${URL}/rest/v1/order_reject_reasons?select=id&limit=1`,
      { headers: h(STAFF) }).then((r) => r.json())
    await step('rejected', { p_reason_id: reason.id })
  }
  return placed.b
}

async function main() {
  console.log('\n— who may read sales figures —')
  const cook = await rpc('report_sales', { p_from: today, p_to: today }, STAFF)
  ok('a cook sees nothing', Array.isArray(cook.b) && cook.b.length === 0, JSON.stringify(cook.b))

  const stranger = await rpc('report_sales', { p_from: today, p_to: today })
  ok('anon cannot call it at all', stranger.s !== 200, `${stranger.s}`)

  console.log('\n— what counts as revenue —')
  await drive('handed_over')
  await drive('handed_over')
  await drive('rejected')
  await drive(null) // left pending

  const sales = await rpc('report_sales', { p_from: today, p_to: today }, SUPER)
  const day = sales.b?.[0]
  ok('two handed-over orders are counted', Number(day?.completed) === 2, JSON.stringify(day))
  ok('the rejected one is counted as lost', Number(day?.lost) === 1, JSON.stringify(day))
  ok('revenue is 2 × ฿99, and the pending and rejected ones add nothing',
     Number(day?.revenue) === 198, JSON.stringify(day))
  ok('it splits by payment method', Number(day?.cash) === 198 && Number(day?.transfer) === 0,
     JSON.stringify(day))

  console.log('\n— fillings —')
  const fillings = await rpc('report_fillings', { p_from: today, p_to: today }, SUPER)
  const d = fillings.b?.find((r) => r.filling_name.includes('ไส้ D'))
  ok('only handed-over orders count toward popularity', Number(d?.pieces) === 10,
     JSON.stringify(fillings.b))

  console.log('\n— stage timing —')
  const timing = await rpc('report_stage_timing', { p_from: today, p_to: today }, SUPER)
  ok('every transition that happened has a row', (timing.b?.length ?? 0) >= 3,
     JSON.stringify(timing.b))
  ok('it reports a median beside the mean',
     timing.b?.every((r) => r.median_minutes !== null), JSON.stringify(timing.b))

  console.log('\n— an empty range —')
  const empty = await rpc('report_sales', { p_from: '2020-01-01', p_to: '2020-01-02' }, SUPER)
  ok('returns nothing rather than failing', Array.isArray(empty.b) && empty.b.length === 0)

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

await main()
