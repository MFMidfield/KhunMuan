// Back office · docs/plan/02-order-lifecycle.md §1–§2
//
// Every call here is made with a signed-in staff JWT over REST, because the
// guards being tested live behind grants and RLS that psql would bypass.
//
//   cd backend && npm run test:back-office
//
// The npm script resets the database first: the suite consumes stock and drives
// orders into terminal states on purpose.

import crypto from 'node:crypto'

const URL = 'http://127.0.0.1:54321/rest/v1'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'

const SET = '5e000000-0000-4000-8000-000000000001' // quota 5
const F_A = 'f1000000-0000-4000-8000-000000000001'
const F_C = 'f1000000-0000-4000-8000-000000000003' // limited stock
const F_D = 'f1000000-0000-4000-8000-000000000004' // unlimited
const POINT = 'c0000000-0000-4000-8000-000000000001'
const SLOT = '50000000-0000-4000-8000-000000000001'

function mint(email) {
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
  const s = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${s}`
}

const A = mint('dev-staff-a@example.com')
const B = mint('dev-staff-b@example.com')
const SUPER = mint('midfieldkanis1@gmail.com')
const OUTSIDER = mint('nobody@example.com')

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

async function read(path, token = ANON) {
  const res = await fetch(`${URL}/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  return res.json()
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

/** `as` selects who places it — staff keying in a phone order is a real path. */
async function newOrder(fillings = [{ filling_id: F_D, qty: 5 }], as = ANON) {
  const r = await rpc(
    'place_order',
    {
      p_payload: {
        client_request_id: crypto.randomUUID(),
        fulfillment: 'pickup',
        pickup_point_id: POINT,
        pickup_slot_id: SLOT,
        payment_method: 'cash',
        items: [{ set_id: SET, quantity: 1, fillings }],
      },
    },
    as,
  )
  const [row] = await read(`orders?select=id,version,code&code=eq.${r.body.code}`, A)
  return { ...row, client_token: r.body.client_token }
}

const stockOf = async (id) =>
  (await read(`filling_stock_daily?select=qty_remaining&filling_id=eq.${id}`, A))[0]
    ?.qty_remaining ?? null

async function main() {
  console.log('\n— who may touch the board —')
  const outsiderClaim = await rpc('claim_order', { p_order_id: crypto.randomUUID() }, OUTSIDER)
  ok('a signed-in non-staff account → NOT_STAFF', outsiderClaim.body?.message === 'NOT_STAFF')
  const anonClaim = await rpc('claim_order', { p_order_id: crypto.randomUUID() })
  ok('anon cannot even execute claim_order', anonClaim.status === 401 || anonClaim.status === 403)

  console.log('\n— claiming —')
  const o1 = await newOrder()
  const claimA = await rpc('claim_order', { p_order_id: o1.id }, A)
  ok('A claims it', claimA.body?.claimed === true)

  const claimB = await rpc('claim_order', { p_order_id: o1.id }, B)
  ok('B loses the race, and it is not an error', claimB.status === 200 && claimB.body?.claimed === false)
  ok('B is told who has it', claimB.body?.claimed_by_name === '[DEV] พนักงาน A', claimB.body?.claimed_by_name)

  const releaseB = await rpc('release_order', { p_order_id: o1.id }, B)
  ok('B cannot release A’s claim', releaseB.body?.message === 'NOT_YOUR_CLAIM')

  const releaseSuper = await rpc('release_order', { p_order_id: o1.id }, SUPER)
  ok('the superadmin can force-release it', releaseSuper.body?.claimed === false)

  console.log('\n— concurrent claim —')
  const o2 = await newOrder()
  const rush = await Promise.all([...Array(6)].map(() => rpc('claim_order', { p_order_id: o2.id }, A)))
  ok(
    '6 simultaneous claims → exactly one wins',
    rush.filter((r) => r.body?.claimed === true).length === 1,
    String(rush.filter((r) => r.body?.claimed === true).length),
  )
  ok('none of the six errored', rush.every((r) => r.status === 200))

  console.log('\n— guarded transitions —')
  const o3 = await newOrder()

  const stale = await rpc(
    'advance_order',
    { p_order_id: o3.id, p_to_status: 'accepted', p_expected_version: o3.version + 99 },
    A,
  )
  ok('a stale version → STALE_ORDER', stale.body?.message === 'STALE_ORDER')

  const illegal = await rpc(
    'advance_order',
    { p_order_id: o3.id, p_to_status: 'ready', p_expected_version: o3.version },
    A,
  )
  ok('pending → ready → ILLEGAL_TRANSITION', illegal.body?.message === 'ILLEGAL_TRANSITION')

  const accepted = await rpc(
    'advance_order',
    { p_order_id: o3.id, p_to_status: 'accepted', p_expected_version: o3.version },
    A,
  )
  ok('pending → accepted', accepted.body?.status === 'accepted')
  ok('the version moved', accepted.body?.version === o3.version + 1)

  const [afterAccept] = await read(`orders?select=claimed_by,version&id=eq.${o3.id}`, A)
  ok('accepting claimed it for A (0027)', afterAccept.claimed_by !== null)

  const replay = await rpc(
    'advance_order',
    { p_order_id: o3.id, p_to_status: 'accepted', p_expected_version: o3.version },
    A,
  )
  ok('the same tap a second time → STALE_ORDER, not a double-write', replay.body?.message === 'STALE_ORDER')

  console.log('\n— cooking requires the claim —')
  const cookByB = await rpc(
    'advance_order',
    { p_order_id: o3.id, p_to_status: 'cooking', p_expected_version: accepted.body.version },
    B,
  )
  ok(
    'B may not start what A accepted',
    cookByB.body?.message === 'CLAIMED_BY_SOMEONE_ELSE',
    JSON.stringify(cookByB.body),
  )

  // Released, the order is anyone's again — and picking it up is still one tap,
  // because starting work claims implicitly.
  await rpc('release_order', { p_order_id: o3.id }, A)
  // Releasing bumps the version too, so the next call has to quote the new one.
  const [afterRelease] = await read(`orders?select=claimed_by,version&id=eq.${o3.id}`, A)
  ok('releasing left it unclaimed', afterRelease.claimed_by === null)

  const cookByBAgain = await rpc(
    'advance_order',
    { p_order_id: o3.id, p_to_status: 'cooking', p_expected_version: afterRelease.version },
    B,
  )
  ok('B may start it once A released it', cookByBAgain.body?.status === 'cooking')

  const [afterCook] = await read(`orders?select=claimed_by,version&id=eq.${o3.id}`, A)
  ok('starting work claimed it implicitly', afterCook.claimed_by !== null)

  const readyByA = await rpc(
    'advance_order',
    { p_order_id: o3.id, p_to_status: 'ready', p_expected_version: afterCook.version },
    A,
  )
  ok(
    'A cannot finish what B is cooking',
    readyByA.body?.message === 'CLAIMED_BY_SOMEONE_ELSE',
    JSON.stringify(readyByA.body),
  )

  const readyByB = await rpc(
    'advance_order',
    { p_order_id: o3.id, p_to_status: 'ready', p_expected_version: afterCook.version },
    B,
  )
  ok('B finishes it', readyByB.body?.status === 'ready')

  console.log('\n— handover —')
  const noCode = await rpc(
    'advance_order',
    { p_order_id: o3.id, p_to_status: 'handed_over', p_expected_version: readyByB.body.version },
    B,
  )
  ok('no code → CODE_REQUIRED', noCode.body?.message === 'CODE_REQUIRED')

  const wrongCode = await rpc(
    'advance_order',
    {
      p_order_id: o3.id,
      p_to_status: 'handed_over',
      p_expected_version: readyByB.body.version,
      p_code: 'ZZ99',
    },
    B,
  )
  ok('the wrong code → CODE_REQUIRED', wrongCode.body?.message === 'CODE_REQUIRED')

  const unpaid = await rpc(
    'advance_order',
    {
      p_order_id: o3.id,
      p_to_status: 'handed_over',
      p_expected_version: readyByB.body.version,
      p_code: o3.code.toLowerCase(),
    },
    B,
  )
  ok('right code but unpaid → PAYMENT_NOT_SETTLED', unpaid.body?.message === 'PAYMENT_NOT_SETTLED')

  const silentOverride = await rpc(
    'advance_order',
    {
      p_order_id: o3.id,
      p_to_status: 'handed_over',
      p_expected_version: readyByB.body.version,
      p_code: o3.code,
      p_override_payment: true,
    },
    B,
  )
  ok(
    'overriding payment without a note → OVERRIDE_NOTE_REQUIRED',
    silentOverride.body?.message === 'OVERRIDE_NOTE_REQUIRED',
  )

  const paid = await rpc('set_payment', { p_order_id: o3.id, p_state: 'paid' }, B)
  ok('set_payment marks it paid', paid.body?.state === 'paid')

  const handed = await rpc(
    'advance_order',
    {
      p_order_id: o3.id,
      p_to_status: 'handed_over',
      p_expected_version: readyByB.body.version,
      p_code: o3.code,
    },
    B,
  )
  ok('paid + correct code → handed_over', handed.body?.status === 'handed_over')

  console.log('\n— rejection needs a reason from the list —')
  const o4 = await newOrder([{ filling_id: F_C, qty: 2 }, { filling_id: F_D, qty: 3 }])
  const beforeReject = await stockOf(F_C)

  const noReason = await rpc(
    'advance_order',
    { p_order_id: o4.id, p_to_status: 'rejected', p_expected_version: o4.version },
    A,
  )
  ok('rejecting with no reason → REASON_REQUIRED', noReason.body?.message === 'REASON_REQUIRED')

  const bogus = await rpc(
    'advance_order',
    {
      p_order_id: o4.id,
      p_to_status: 'rejected',
      p_expected_version: o4.version,
      p_reason_id: crypto.randomUUID(),
    },
    A,
  )
  ok('an invented reason id → REASON_UNKNOWN', bogus.body?.message === 'REASON_UNKNOWN')

  const reasons = await read('order_reject_reasons?select=id,label&order=sort_order', A)
  ok('the reason list is readable by staff', reasons.length === 4, String(reasons.length))

  const rejected = await rpc(
    'advance_order',
    {
      p_order_id: o4.id,
      p_to_status: 'rejected',
      p_expected_version: o4.version,
      p_reason_id: reasons[0].id,
      p_note: 'กุ้งหมดตั้งแต่เที่ยง',
    },
    A,
  )
  ok('rejecting with a listed reason works', rejected.body?.status === 'rejected')
  ok('rejecting restored the stock', (await stockOf(F_C)) - beforeReject === 2)

  const [rejectedRow] = await read(
    `orders?select=reject_reason_id,cancelled_reason&id=eq.${o4.id}`,
    A,
  )
  ok('the groupable reason was stored', rejectedRow.reject_reason_id === reasons[0].id)
  ok('the free-text detail was stored beside it', rejectedRow.cancelled_reason === 'กุ้งหมดตั้งแต่เที่ยง')

  console.log('\n— a customer cancelling leaves no UI string in the database —')
  const o5 = await newOrder()
  await rpc('cancel_order', { p_code: o5.code, p_client_token: o5.client_token })
  const [cancelledRow] = await read(
    `orders?select=status,cancelled_reason,reject_reason_id&id=eq.${o5.id}`,
    A,
  )
  ok('status is cancelled', cancelledRow.status === 'cancelled')
  ok('cancelled_reason stays null', cancelledRow.cancelled_reason === null)
  const events = await read(
    `order_events?select=type,actor_label&order_id=eq.${o5.id}&type=eq.cancelled`,
    A,
  )
  ok('the event records the customer as the actor', events[0]?.actor_label === 'customer')

  console.log('\n— stock —')
  const consumedBefore = await stockOf(F_A)
  await newOrder([{ filling_id: F_A, qty: 5 }])
  const afterSale = await stockOf(F_A)
  ok('a sale consumed 5', consumedBefore - afterSale === 5)

  const restocked = await rpc('set_stock', { p_filling_id: F_A, p_qty_total: 100 }, A)
  ok(
    'raising the tray to 100 keeps what is already sold sold',
    restocked.body?.qty_remaining === 100 - (consumedBefore - afterSale + (40 - consumedBefore)),
    JSON.stringify(restocked.body),
  )

  console.log('\n— open / close —')
  const closed = await rpc('toggle_shop', { p_is_open: false }, A)
  ok('staff can close the shop', closed.body?.is_open === false)
  const blocked = await rpc('place_order', {
    p_payload: {
      client_request_id: crypto.randomUUID(),
      fulfillment: 'pickup',
      pickup_point_id: POINT,
      pickup_slot_id: SLOT,
      payment_method: 'cash',
      items: [{ set_id: SET, quantity: 1, fillings: [{ filling_id: F_D, qty: 5 }] }],
    },
  })
  ok('a customer cannot order while closed', blocked.body?.message === 'SHOP_CLOSED')
  const staffStillCan = await newOrder([{ filling_id: F_D, qty: 5 }], A)
  ok('staff can still key in a phone order while closed', Boolean(staffStillCan.id))

  const [keyedIn] = await read(
    `orders?select=source,created_by_admin&id=eq.${staffStillCan.id}`,
    A,
  )
  ok('it is recorded as an admin-entered order', keyedIn.source === 'admin')
  ok('and it remembers who keyed it in', keyedIn.created_by_admin !== null)

  // What /admin/new does when "รับออเดอร์ให้เลย" is ticked: place, then accept
  // in a second call. place_order always starts at pending_confirmation, and a
  // freshly placed order is therefore always at version 0.
  const acceptedAtOnce = await rpc(
    'advance_order',
    { p_order_id: staffStillCan.id, p_to_status: 'accepted', p_expected_version: 0 },
    A,
  )
  ok(
    'a just-placed order accepts at version 0',
    acceptedAtOnce.body?.status === 'accepted',
    JSON.stringify(acceptedAtOnce.body),
  )
  await rpc('toggle_shop', { p_is_open: true }, A)

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

await main()
