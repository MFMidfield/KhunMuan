// place_order / cancel_order · docs/plan/02-order-lifecycle.md §3–§5
//
// Exercised over REST as the anonymous client, the way the real customer app
// will call it — not through psql as a superuser, because that would skip the
// grants and RLS that are half of what makes this function safe.
//
//   cd backend && npm run test:orders
//
// The npm script resets the database first, and it has to: the suite consumes
// stock, slot capacity and a daily set limit on purpose. Those are exactly the
// finite resources whose exhaustion is being tested, so the suite is not
// idempotent against a database it has already run on.
import crypto from 'node:crypto'

const URL = 'http://127.0.0.1:54321/rest/v1'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const SET_SMALL = '5e000000-0000-4000-8000-000000000001' // quota 5, 99
const SET_BIG = '5e000000-0000-4000-8000-000000000002' // quota 10, 179
const F_A = 'f1000000-0000-4000-8000-000000000001'
const F_B = 'f1000000-0000-4000-8000-000000000002' // max_per_set 6
const F_C = 'f1000000-0000-4000-8000-000000000003' // only 5 in stock
const F_D = 'f1000000-0000-4000-8000-000000000004' // unlimited
const F_OFF = 'f1000000-0000-4000-8000-000000000005' // inactive
const SAUCE_PAID = 'ad000000-0000-4000-8000-000000000002' // 10 baht, max 3
const ZONE = 'd0000000-0000-4000-8000-000000000001' // fee 10
const POINT = 'c0000000-0000-4000-8000-000000000001'
const SLOT_CAP2 = '50000000-0000-4000-8000-000000000002'
const SLOT_FREE = '50000000-0000-4000-8000-000000000001'
const SET_LIMITED = '5e000000-0000-4000-8000-000000000003' // daily_limit 2
// Reserved for the concurrency section: earlier tests eat into SLOT_CAP2.
const SLOT_RACE = '50000000-0000-4000-8000-000000000003' // capacity 2

let pass = 0
let fail = 0

async function rpc(fn, body, token = ANON) {
  const res = await fetch(`${URL}/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

function ok(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ok   · ${name}`)
  } else {
    fail++
    console.log(`  FAIL · ${name} ${extra}`)
  }
}

const pickup = (items, extra = {}) => ({
  client_request_id: crypto.randomUUID(),
  fulfillment: 'pickup',
  pickup_point_id: POINT,
  pickup_slot_id: SLOT_FREE,
  payment_method: 'cash',
  items,
  ...extra,
})

const fill = (id, qty) => ({ filling_id: id, qty })

/** A signed-in superadmin, for the parts of the suite that need one. */
function mintStaff(email = 'midfieldkanis1@gmail.com') {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const h = b64({ alg: 'HS256', typ: 'JWT' })
  const p = b64({
    iss: 'supabase-demo',
    role: 'authenticated',
    aud: 'authenticated',
    sub: crypto.randomUUID(),
    email,
    iat: now,
    exp: now + 3600,
  })
  const s = crypto
    .createHmac('sha256', 'super-secret-jwt-token-with-at-least-32-characters-long')
    .update(`${h}.${p}`)
    .digest('base64url')
  return `${h}.${p}.${s}`
}

/** The minimum and the cap live in shop_settings, editable in the back office. */
async function setRules(patch, token) {
  const res = await fetch(`${URL}/shop_settings?id=eq.1`, {
    method: 'PATCH',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`setRules failed: ${res.status} ${await res.text()}`)
}

async function main() {
  console.log('\n— happy path —')
  const good = await rpc('place_order', {
    p_payload: pickup([
      { set_id: SET_SMALL, quantity: 2, fillings: [fill(F_A, 3), fill(F_D, 2)] },
    ]),
  })
  ok('placed', good.status === 200 && good.body?.code, JSON.stringify(good.body))
  ok('code is 4 chars, mixed', /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{4}$/.test(good.body?.code ?? ''), good.body?.code)
  ok('total = 99 × 2 = 198', Number(good.body?.total) === 198, good.body?.total)
  ok('client_token returned', Boolean(good.body?.client_token))
  ok('not a replay', good.body?.replayed === false)

  console.log('\n— idempotency —')
  const payload = pickup([
    { set_id: SET_SMALL, quantity: 1, fillings: [fill(F_A, 5)] },
  ])
  const first = await rpc('place_order', { p_payload: payload })
  const retry = await rpc('place_order', { p_payload: payload })
  ok('retry returns the same order', first.body?.id === retry.body?.id)
  ok('retry is flagged as replayed', retry.body?.replayed === true)

  console.log('\n— the server owns the price —')
  const lying = await rpc('place_order', {
    p_payload: pickup(
      [{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_A, 5)] }],
      { client_total: 1 },
    ),
  })
  ok('a client-sent total of ฿1 is ignored', Number(lying.body?.total) === 99, lying.body?.total)

  console.log('\n— add-ons and delivery fee —')
  const withAddons = await rpc('place_order', {
    p_payload: {
      client_request_id: crypto.randomUUID(),
      fulfillment: 'delivery',
      delivery_zone_id: ZONE,
      delivery_location: 'ตึกตัวอย่าง',
      customer_name: 'ทดสอบ',
      customer_phone: '0800000000',
      payment_method: 'transfer',
      items: [
        {
          set_id: SET_SMALL,
          quantity: 1,
          fillings: [fill(F_A, 5)],
          addons: [{ addon_id: SAUCE_PAID, qty: 2 }],
        },
      ],
    },
  })
  ok('99 + (10×2) + 10 delivery = 129', Number(withAddons.body?.total) === 129, withAddons.body?.total)

  console.log('\n— validation —')
  const cases = [
    ['quota short → QUOTA_MISMATCH', pickup([{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_A, 4)] }]), 'QUOTA_MISMATCH'],
    ['quota over → QUOTA_MISMATCH', pickup([{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_A, 6)] }]), 'QUOTA_MISMATCH'],
    ['inactive filling → FILLING_UNAVAILABLE', pickup([{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_OFF, 5)] }]), 'FILLING_UNAVAILABLE'],
    ['unknown filling → FILLING_UNAVAILABLE', pickup([{ set_id: SET_SMALL, quantity: 1, fillings: [fill('f1000000-0000-4000-8000-0000000000ff', 5)] }]), 'FILLING_UNAVAILABLE'],
    ['max_per_set → MAX_PER_SET_EXCEEDED', pickup([{ set_id: SET_BIG, quantity: 1, fillings: [fill(F_B, 7), fill(F_A, 3)] }]), 'MAX_PER_SET_EXCEEDED'],
    ['empty cart → EMPTY_CART', pickup([]), 'EMPTY_CART'],
    ['quantity 0 → INVALID_QUANTITY', pickup([{ set_id: SET_SMALL, quantity: 0, fillings: [fill(F_A, 5)] }]), 'INVALID_QUANTITY'],
    ['addon over max_qty → ADDON_QTY_INVALID', pickup([{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_A, 5)], addons: [{ addon_id: SAUCE_PAID, qty: 9 }] }]), 'ADDON_QTY_INVALID'],
    ['delivery without a name → INVALID_PAYLOAD', { client_request_id: crypto.randomUUID(), fulfillment: 'delivery', delivery_zone_id: ZONE, delivery_location: 'x', customer_phone: '08', payment_method: 'cash', items: [{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_A, 5)] }] }, 'INVALID_PAYLOAD'],
    ['no request id → MISSING_REQUEST_ID', { fulfillment: 'pickup', pickup_point_id: POINT, pickup_slot_id: SLOT_FREE, payment_method: 'cash', items: [{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_A, 5)] }] }, 'MISSING_REQUEST_ID'],
  ]
  for (const [name, p, expected] of cases) {
    const r = await rpc('place_order', { p_payload: p })
    ok(name, r.body?.message === expected, `got ${r.status} ${JSON.stringify(r.body)}`)
  }

  console.log('\n— stock —')
  // F_C has 5 for the day. Ask for 6 across two boxes of the big set.
  const oversell = await rpc('place_order', {
    p_payload: pickup([{ set_id: SET_BIG, quantity: 2, fillings: [fill(F_C, 3), fill(F_A, 7)] }]),
  })
  ok('oversell → OUT_OF_STOCK', oversell.body?.message === 'OUT_OF_STOCK', JSON.stringify(oversell.body))
  ok('OUT_OF_STOCK names the filling', String(oversell.body?.details ?? '').includes('ไส้ C'), oversell.body?.details)

  const beforeC = await stockOf(F_C)
  await rpc('place_order', {
    p_payload: pickup([{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_C, 2), fill(F_A, 3)] }]),
  })
  const afterC = await stockOf(F_C)
  ok('stock decremented by exactly 2', beforeC - afterC === 2, `${beforeC} → ${afterC}`)

  console.log('\n— slot capacity —')
  const slotBody = (n) => ({
    client_request_id: crypto.randomUUID(),
    fulfillment: 'pickup',
    pickup_point_id: POINT,
    pickup_slot_id: SLOT_CAP2,
    payment_method: 'cash',
    items: [{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_D, 5)] }],
    note: `slot ${n}`,
  })
  const s1 = await rpc('place_order', { p_payload: slotBody(1) })
  const s2 = await rpc('place_order', { p_payload: slotBody(2) })
  const s3 = await rpc('place_order', { p_payload: slotBody(3) })
  ok('slot capacity 2 accepts two', s1.status === 200 && s2.status === 200)
  ok('third → SLOT_FULL', s3.body?.message === 'SLOT_FULL', JSON.stringify(s3.body))

  console.log('\n— cancellation —')
  const toCancel = await rpc('place_order', {
    p_payload: pickup([{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_C, 1), fill(F_D, 4)] }]),
  })
  const cBefore = await stockOf(F_C)
  const wrongToken = await rpc('cancel_order', {
    p_code: toCancel.body.code,
    p_client_token: crypto.randomUUID(),
  })
  ok('wrong token → ORDER_NOT_FOUND', wrongToken.body?.message === 'ORDER_NOT_FOUND')

  const cancelled = await rpc('cancel_order', {
    p_code: toCancel.body.code.toLowerCase(),
    p_client_token: toCancel.body.client_token,
  })
  ok('lower-case code still cancels', cancelled.body?.status === 'cancelled', JSON.stringify(cancelled.body))
  const cAfter = await stockOf(F_C)
  ok('cancelling restores stock', cAfter - cBefore === 1, `${cBefore} → ${cAfter}`)

  const twice = await rpc('cancel_order', {
    p_code: toCancel.body.code,
    p_client_token: toCancel.body.client_token,
  })
  ok('cancelling twice → CANCEL_WINDOW_CLOSED', twice.body?.message === 'CANCEL_WINDOW_CLOSED')


  console.log('\n— concurrency: the whole reason this logic lives in Postgres —')
  const raceOrder = (fillings, slot = SLOT_FREE, setId = SET_SMALL) => ({
    client_request_id: crypto.randomUUID(),
    fulfillment: 'pickup',
    pickup_point_id: POINT,
    pickup_slot_id: slot,
    payment_method: 'cash',
    items: [{ set_id: setId, quantity: 1, fillings }],
  })

  // Whatever is left of F_C by now — earlier assertions deliberately spent
  // some of it, so the expectation is read rather than hard-coded.
  const left = await stockOf(F_C)
  const stockRace = await Promise.all(
    [...Array(12)].map(() =>
      rpc('place_order', { p_payload: raceOrder([fill(F_C, 1), fill(F_D, 4)]) }),
    ),
  )
  const won = stockRace.filter((r) => r.status === 200)
  ok(
    `12 concurrent orders, ${left} in stock → exactly ${left} succeed`,
    won.length === left,
    String(won.length),
  )
  ok(
    'the losers all get OUT_OF_STOCK, none get a deadlock or a 500',
    stockRace.filter((r) => r.body?.message === 'OUT_OF_STOCK').length === 12 - left,
  )
  ok('stock lands on exactly zero', (await stockOf(F_C)) === 0)
  ok('every winner got a distinct code', new Set(won.map((r) => r.body.code)).size === won.length)

  // Slot capacity 2, six at once.
  const slotRace = await Promise.all(
    [...Array(6)].map(() => rpc('place_order', { p_payload: raceOrder([fill(F_D, 5)], SLOT_RACE) })),
  )
  ok(
    'slot capacity 2 holds under 6 concurrent orders',
    slotRace.filter((r) => r.status === 200).length === 2,
    String(slotRace.filter((r) => r.status === 200).length),
  )

  // sets.daily_limit 2, five at once.
  const limitRace = await Promise.all(
    [...Array(5)].map(() =>
      rpc('place_order', { p_payload: raceOrder([fill(F_D, 5)], SLOT_FREE, SET_LIMITED) }),
    ),
  )
  ok(
    'a daily set limit of 2 holds under 5 concurrent orders',
    limitRace.filter((r) => r.status === 200).length === 2,
    String(limitRace.filter((r) => r.status === 200).length),
  )

  console.log('\n— shop-configurable rules (Q10, Q12) —')
  // These are null in the seed, so they are switched on here, exercised, and
  // switched back off. Leaving them on would change what every other assertion
  // in this file means.
  const SLOT_CLOSED_ALWAYS = '50000000-0000-4000-8000-000000000004'
  const staffToken = mintStaff()

  const closed = await rpc('place_order', {
    p_payload: {
      client_request_id: crypto.randomUUID(),
      fulfillment: 'pickup',
      pickup_point_id: POINT,
      pickup_slot_id: SLOT_CLOSED_ALWAYS,
      payment_method: 'cash',
      items: [{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_D, 5)] }],
    },
  })
  ok('a slot past its cutoff → SLOT_CLOSED', closed.body?.message === 'SLOT_CLOSED')

  const staffLate = await rpc(
    'place_order',
    {
      p_payload: {
        client_request_id: crypto.randomUUID(),
        fulfillment: 'pickup',
        pickup_point_id: POINT,
        pickup_slot_id: SLOT_CLOSED_ALWAYS,
        payment_method: 'cash',
        items: [{ set_id: SET_SMALL, quantity: 1, fillings: [fill(F_D, 5)] }],
      },
    },
    staffToken,
  )
  ok('staff are exempt from the cutoff', staffLate.status === 200, JSON.stringify(staffLate.body))

  await setRules({ min_order_total: 150, max_boxes_per_order: 3 }, staffToken)

  const tooSmall = await rpc('place_order', { p_payload: pickup([
    { set_id: SET_SMALL, quantity: 1, fillings: [fill(F_D, 5)] },
  ]) })
  ok('below the minimum → BELOW_MINIMUM', tooSmall.body?.message === 'BELOW_MINIMUM')

  const bigEnough = await rpc('place_order', { p_payload: pickup([
    { set_id: SET_SMALL, quantity: 2, fillings: [fill(F_D, 5)] },
  ]) })
  ok('two boxes clear it', bigEnough.status === 200, JSON.stringify(bigEnough.body))

  const tooMany = await rpc('place_order', { p_payload: pickup([
    { set_id: SET_SMALL, quantity: 4, fillings: [fill(F_D, 5)] },
  ]) })
  ok('over the box cap → TOO_MANY_BOXES', tooMany.body?.message === 'TOO_MANY_BOXES')

  await setRules({ min_order_total: null, max_boxes_per_order: null }, staffToken)

  console.log('\n— anon still cannot read anything —')
  const peek = await fetch(`${URL}/orders?select=code,customer_phone`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  ok('orders table unreadable by anon', peek.status === 401, String(peek.status))

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

async function stockOf(fillingId) {
  const res = await fetch(
    `${URL}/filling_stock_daily?select=qty_remaining&filling_id=eq.${fillingId}`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
  )
  const rows = await res.json()
  return rows[0]?.qty_remaining ?? null
}

await main()
