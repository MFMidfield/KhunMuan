// Transfer slips · docs/plan/05-backend-security.md §5
//
//   cd backend && npm run test:slips
//
// Slips carry a name, part of an account number and an amount, uploaded by
// someone with no account and no session. Every assertion here is about who can
// reach one.
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
const fn = (name, body) =>
  fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: h(), body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) }))

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64')

async function place() {
  const r = await rpc('place_order', { p_payload: {
    client_request_id: crypto.randomUUID(), fulfillment: 'pickup',
    pickup_point_id: 'c0000000-0000-4000-8000-000000000001',
    pickup_slot_id: '50000000-0000-4000-8000-000000000001',
    payment_method: 'transfer',
    items: [{ set_id: '5e000000-0000-4000-8000-000000000001', quantity: 1,
              fillings: [{ filling_id: 'f1000000-0000-4000-8000-000000000004', qty: 5 }] }],
  } })
  return r.b
}

async function main() {
  const order = await place()
  const other = await place()

  console.log('\n— getting permission to upload —')
  const noToken = await fn('slip-upload-url', { code: order.code, client_token: crypto.randomUUID(), content_type: 'image/png' })
  // The body matters as much as the status here: an edge runtime that has not
  // picked up a new function also answers 404, and this assertion passed
  // against that once already.
  ok('the wrong token is refused', noToken.s === 404 && noToken.b?.message === 'ORDER_NOT_FOUND',
     `${noToken.s} ${JSON.stringify(noToken.b)}`)

  const badType = await fn('slip-upload-url', { code: order.code, client_token: order.client_token, content_type: 'application/zip' })
  ok('a disallowed type is refused', badType.s === 400)

  const grant = await fn('slip-upload-url', { code: order.code, client_token: order.client_token, content_type: 'image/png' })
  ok('the owner gets a signed upload URL', grant.s === 200 && Boolean(grant.b?.token), JSON.stringify(grant.b))
  ok('scoped to a path under their own order id', String(grant.b?.path).startsWith(`${await idOf(order.code)}/`), grant.b?.path)

  console.log('\n— uploading —')
  const put = await fetch(`${URL}/storage/v1/object/upload/sign/slips/${grant.b.path}?token=${grant.b.token}`, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: PNG,
  })
  ok('the file goes up', put.status === 200, `${put.status} ${await put.text()}`)

  const attach = await rpc('attach_slip', {
    p_code: order.code, p_client_token: order.client_token, p_path: grant.b.path,
  })
  ok('attach_slip records it', attach.s === 200 && attach.b?.state === 'slip_uploaded', JSON.stringify(attach.b))

  const [pay] = await fetch(`${URL}/rest/v1/payments?select=state,slip_path&order_id=eq.${await idOf(order.code)}`,
    { headers: h(STAFF) }).then((r) => r.json())
  ok('the payment moves to slip_uploaded, never straight to paid', pay.state === 'slip_uploaded')

  console.log('\n— pointing a payment at somebody else’s order —')
  const crossed = await rpc('attach_slip', {
    p_code: other.code, p_client_token: other.client_token, p_path: grant.b.path,
  })
  ok('a path from another order is refused', crossed.b?.message === 'SLIP_PATH_MISMATCH', JSON.stringify(crossed.b))

  console.log('\n— who can see it —')
  const publicRead = await fetch(`${URL}/storage/v1/object/public/slips/${grant.b.path}`)
  ok('the bucket is not public', publicRead.status !== 200, `${publicRead.status}`)

  const anonSign = await fetch(`${URL}/storage/v1/object/sign/slips/${grant.b.path}`, {
    method: 'POST', headers: h(), body: JSON.stringify({ expiresIn: 60 }),
  })
  ok('anon cannot sign a link for it', anonSign.status !== 200, `${anonSign.status}`)

  const outsiderSign = await fetch(`${URL}/storage/v1/object/sign/slips/${grant.b.path}`, {
    method: 'POST', headers: h(OUTSIDER), body: JSON.stringify({ expiresIn: 60 }),
  })
  ok('a signed-in non-staff account cannot either', outsiderSign.status !== 200, `${outsiderSign.status}`)

  const staffSign = await fetch(`${URL}/storage/v1/object/sign/slips/${grant.b.path}`, {
    method: 'POST', headers: h(STAFF), body: JSON.stringify({ expiresIn: 60 }),
  })
  ok('staff can, which is how the board shows it', staffSign.status === 200, `${staffSign.status}`)

  const signed = await staffSign.json()
  const fetched = await fetch(`${URL}/storage/v1${signed.signedURL}`)
  ok('and the signed link actually resolves', fetched.status === 200, `${fetched.status}`)

  console.log('\n— retention —')
  const expired = await rpc('expired_slips', {}, STAFF)
  ok('expired_slips is not callable by staff, only by the pruner', expired.s !== 200, `${expired.s}`)

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

async function idOf(code) {
  const [row] = await fetch(`${URL}/rest/v1/orders?select=id&code=eq.${code}`, { headers: h(STAFF) })
    .then((r) => r.json())
  return row.id
}

await main()
