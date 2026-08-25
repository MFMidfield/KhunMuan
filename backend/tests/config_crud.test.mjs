// Back-office configuration · docs/plan/06-roadmap-open-questions.md Q4–Q13
//
//   cd backend && npm run test:config
//
// These tables are written straight through PostgREST rather than through an
// RPC, so the only thing standing between a cook and the price list is RLS.
// This asserts that, from both sides.
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
  const s = crypto.createHmac('sha256', 'super-secret-jwt-token-with-at-least-32-characters-long')
    .update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${s}`
}

const SUPER = mint('midfieldkanis1@gmail.com')
const STAFF = mint('dev-staff-a@example.com')

let pass = 0, fail = 0
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log(`  ok   · ${n}`) }
  else { fail++; console.log(`  FAIL · ${n} ${x}`) }
}

const rest = (path, init = {}, token = ANON) =>
  fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })

async function main() {
  console.log('\n— who may edit the menu —')
  const body = JSON.stringify({ name: 'ทดสอบสิทธิ์', piece_quota: 5, price: 10 })

  const anonInsert = await rest('sets', { method: 'POST', body })
  ok('anon cannot add a set', anonInsert.status === 401 || anonInsert.status === 403, String(anonInsert.status))

  const staffInsert = await rest('sets', { method: 'POST', body }, STAFF)
  ok('a cook cannot add a set', staffInsert.status === 403, String(staffInsert.status))

  const superInsert = await rest('sets', { method: 'POST', body }, SUPER)
  ok('the owner can', superInsert.status === 201, String(superInsert.status))
  const [created] = await superInsert.json()

  const staffEdit = await rest(`sets?id=eq.${created.id}`, {
    method: 'PATCH', body: JSON.stringify({ price: 1 }),
  }, STAFF)
  ok('a cook cannot change a price', (await staffEdit.json()).length === 0)

  const superEdit = await rest(`sets?id=eq.${created.id}`, {
    method: 'PATCH', body: JSON.stringify({ price: 123 }),
  }, SUPER)
  // PostgREST serialises numeric as a JSON number, so 123.00 arrives as 123.
  ok('the owner can', Number((await superEdit.json())[0]?.price) === 123)

  console.log('\n— deleting something an order used —')
  // The seeded sets are referenced by nothing yet, so make a reference first.
  const placed = await fetch(`${URL}/rest/v1/rpc/place_order`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_payload: {
      client_request_id: crypto.randomUUID(), fulfillment: 'pickup', customer_name: 'ผู้ทดสอบ',
      pickup_point_id: 'c0000000-0000-4000-8000-000000000001',
      pickup_slot_id: '50000000-0000-4000-8000-000000000001',
      payment_method: 'cash',
      items: [{ set_id: '5e000000-0000-4000-8000-000000000001', quantity: 1,
                fillings: [{ filling_id: 'f1000000-0000-4000-8000-000000000004', qty: 5 }] }],
    } }),
  })
  ok('an order exists to reference a filling', placed.status === 200)

  const delUsed = await rest('fillings?id=eq.f1000000-0000-4000-8000-000000000004',
    { method: 'DELETE' }, SUPER)
  const delBody = await delUsed.json().catch(() => null)
  ok('a filling an order used cannot be deleted', delUsed.status === 409 && delBody?.code === '23503',
     `${delUsed.status} ${JSON.stringify(delBody)}`)

  const deactivate = await rest('fillings?id=eq.f1000000-0000-4000-8000-000000000004',
    { method: 'PATCH', body: JSON.stringify({ is_active: false }) }, SUPER)
  ok('but it can be taken off the menu', (await deactivate.json())[0]?.is_active === false)

  console.log('\n— the superadmin row is untouchable through the API —')
  const demote = await rest('admin_users?role=eq.superadmin',
    { method: 'PATCH', body: JSON.stringify({ display_name: 'x' }) }, SUPER)
  ok('even the owner cannot edit their own superadmin row', (await demote.json()).length === 0)

  const secondOwner = await rest('admin_users', { method: 'POST',
    body: JSON.stringify({ email: 'evil@example.com', display_name: 'E', role: 'superadmin' }) }, SUPER)
  ok('and cannot create a second one', secondOwner.status === 403)

  console.log('\n— deleting a staff member who has claimed something —')
  // orders.claimed_by is ON DELETE SET NULL, which used to leave claimed_at
  // behind and trip the pair constraint with a 400. A before-delete trigger
  // clears both halves and records why (migration 0017).
  const [worker] = await (await rest('admin_users', {
    method: 'POST',
    body: JSON.stringify({ email: 'delete-me@example.com', display_name: 'มีประวัติ', role: 'admin' }),
  }, SUPER)).json()

  const order = await (await fetch(`${URL}/rest/v1/rpc/place_order`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_payload: {
      client_request_id: crypto.randomUUID(), fulfillment: 'pickup', customer_name: 'ผู้ทดสอบ',
      pickup_point_id: 'c0000000-0000-4000-8000-000000000001',
      pickup_slot_id: '50000000-0000-4000-8000-000000000001',
      payment_method: 'cash',
      items: [{ set_id: '5e000000-0000-4000-8000-000000000001', quantity: 1,
                fillings: [{ filling_id: 'f1000000-0000-4000-8000-000000000001', qty: 5 }] }],
    } }),
  })).json()
  const [row] = await (await rest(`orders?select=id&code=eq.${order.code}`, {}, SUPER)).json()

  const WORKER = mint('delete-me@example.com')
  await fetch(`${URL}/rest/v1/rpc/claim_order`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${WORKER}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_order_id: row.id }),
  })

  const dropped = await rest(`admin_users?id=eq.${worker.id}`, { method: 'DELETE' }, SUPER)
  ok('a staff member with history can be deleted', dropped.status === 200, String(dropped.status))

  const [freed] = await (await rest(
    `orders?select=claimed_by,claimed_at&id=eq.${row.id}`, {}, SUPER)).json()
  ok('their claim is released, both halves', freed.claimed_by === null && freed.claimed_at === null,
     JSON.stringify(freed))

  const [ev] = await (await rest(
    `order_events?select=actor_label,payload&order_id=eq.${row.id}&type=eq.released`, {}, SUPER)).json()
  ok('and the board can see why it came free',
     ev?.payload?.reason === 'staff_removed' && ev?.actor_label === 'มีประวัติ',
     JSON.stringify(ev))

  console.log('\n— storage —')
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64')
  const upload = (token) => fetch(`${URL}/storage/v1/object/menu/test/${crypto.randomUUID()}.png`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
    body: png,
  })
  const staffUpload = await upload(STAFF)
  ok('a cook cannot upload a photo', staffUpload.status === 400 || staffUpload.status === 403,
     String(staffUpload.status))
  const superUpload = await upload(SUPER)
  ok('the owner can', superUpload.status === 200, String(superUpload.status))

  const objectPath = (await superUpload.json()).Key?.replace(/^menu\//, '')
  const publicRead = await fetch(`${URL}/storage/v1/object/public/menu/${objectPath}`)
  ok('and anyone can look at it', publicRead.status === 200, String(publicRead.status))

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

await main()
