// Tracking rate limit · docs/plan/03-order-code.md §8, docs/plan/05-backend-security.md §4
//
//   cd backend && npm run test:rate-limit
//
// Driven through the `track` Edge Function with a forged x-forwarded-for,
// because the whole point of that function is that it is the only thing that
// sees an address. Testing the RPC directly would skip the half being tested.
//
// The suite needs a clean ledger: the npm script resets the database first, and
// every section deliberately spends one address's allowance.
import crypto from 'node:crypto'
const U='http://127.0.0.1:54321'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const H={apikey:ANON,Authorization:'Bearer '+ANON,'Content-Type':'application/json'}
const track=(code,token,ip)=>fetch(U+'/functions/v1/track',{method:'POST',
  headers:{...H,'x-forwarded-for':ip},body:JSON.stringify({code,client_token:token??null})})
  .then(async r=>({s:r.status,b:await r.json().catch(()=>null)}))
let pass = 0, fail = 0
const ok=(n,c,x='')=>{ if(c){pass++} else {fail++}; console.log(`  ${c?'ok  ':'FAIL'} · ${n} ${c?'':x}`) }

const placed=await fetch(U+'/rest/v1/rpc/place_order',{method:'POST',headers:H,body:JSON.stringify({p_payload:{
  client_request_id:crypto.randomUUID(),fulfillment:'pickup',customer_name:'ผู้ทดสอบ',
  pickup_point_id:'c0000000-0000-4000-8000-000000000001',pickup_slot_id:'50000000-0000-4000-8000-000000000001',
  payment_method:'cash',items:[{set_id:'5e000000-0000-4000-8000-000000000001',quantity:1,
    fillings:[{filling_id:'f1000000-0000-4000-8000-000000000004',qty:5}]}]}})}).then(r=>r.json())
console.log('order', placed.code)

console.log('\n— anon can no longer reach lookup_order directly —')
const direct=await fetch(U+'/rest/v1/rpc/lookup_order',{method:'POST',headers:H,
  body:JSON.stringify({p_code:placed.code})}).then(async r=>({s:r.status,b:await r.json().catch(()=>null)}))
ok('direct RPC refused for anon', direct.s===404||direct.s===401||direct.s===403, `${direct.s} ${JSON.stringify(direct.b)}`)

console.log('\n— the endpoint works —')
const good=await track(placed.code, placed.client_token, '203.0.113.9')
ok('a real code resolves through track', good.s===200 && good.b?.code===placed.code, JSON.stringify(good.b))
ok('and the full view came back with the token', good.b?.can_cancel===true)

console.log('\n— per-IP limit: 5 a minute —')
const ipA='198.51.100.1'
const burst=[]
for (let i=0;i<7;i++) burst.push(await track(placed.code, null, ipA))
ok('the 6th and 7th are refused', burst.slice(5).every(r=>r.s===429), JSON.stringify(burst.map(r=>r.s)))
ok('the first five got through', burst.slice(0,5).every(r=>r.s===200))

console.log('\n— three misses in a minute blocks for fifteen —')
const ipB='198.51.100.2'
const m=[]
for (const c of ['A2B3','C4D5','E6F7']) m.push(await track(c,null,ipB))
ok('three wrong codes come back as misses', m.every(r=>r.s===404||r.s===429), JSON.stringify(m.map(r=>r.s)))
const afterBlock=await track(placed.code,null,ipB)
ok('a real code is now refused too — the block is on the caller', afterBlock.s===429, `${afterBlock.s} ${JSON.stringify(afterBlock.b)}`)
ok('and it says IP_BLOCKED, not RATE_LIMITED', afterBlock.b?.message==='IP_BLOCKED', JSON.stringify(afterBlock.b))

console.log('\n— an unrelated address is untouched —')
const clean=await track(placed.code,null,'198.51.100.99')
ok('someone else can still look up their order', clean.s===200, `${clean.s}`)

console.log('\n— the owner of an order is not rate limited on it (0035) —')
// The device that placed the order holds its client_token. It polls the
// tracking page every 30 seconds and refetches on every realtime nudge, so the
// 5-a-minute rule — which counts hits as well as misses — used to lock a
// customer out of their own order. A proven owner now skips the check and is
// not written to the ledger at all.
const ipOwner='198.51.100.7'
const ownerRuns=[]
for (let i=0;i<12;i++) ownerRuns.push(await track(placed.code, placed.client_token, ipOwner))
ok('twelve reads of your own order all succeed', ownerRuns.every(r=>r.s===200), JSON.stringify(ownerRuns.map(r=>r.s)))

// Same address, no token: the wall is exactly where it was.
const stranger=[]
for (let i=0;i<7;i++) stranger.push(await track(placed.code, null, ipOwner))
ok('the same address without the token still hits the limit', stranger.some(r=>r.s===429), JSON.stringify(stranger.map(r=>r.s)))

// A token that does not belong to the code proves nothing.
const ipForged='198.51.100.8'
const forged=[]
for (const c of ['A2B3','C4D5','E6F7']) forged.push(await track(c, crypto.randomUUID(), ipForged))
const forgedAfter=await track(placed.code, crypto.randomUUID(), ipForged)
ok('a made-up token buys no exemption', forgedAfter.s===429, `${forgedAfter.s} ${JSON.stringify(forgedAfter.b)}`)

console.log('\n— the raw address is never stored —')
const S=(()=>{const c=crypto;const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url')
 const n=Math.floor(Date.now()/1e3),h=b({alg:'HS256',typ:'JWT'}),p=b({iss:'supabase-demo',role:'authenticated',aud:'authenticated',sub:c.randomUUID(),email:'midfieldkanis1@gmail.com',iat:n,exp:n+3600})
 return h+'.'+p+'.'+c.createHmac('sha256','super-secret-jwt-token-with-at-least-32-characters-long').update(h+'.'+p).digest('base64url')})()
const rows=await fetch(U+'/rest/v1/code_lookup_attempts?select=ip_hash,code,hit',{headers:{apikey:ANON,Authorization:'Bearer '+S}}).then(r=>r.json())
ok('no stored value contains an IP', !JSON.stringify(rows).includes('198.51.100'))
ok('hashes are 64 hex chars', rows.every(r=>/^[0-9a-f]{64}$/.test(r.ip_hash)))
const blocked=await fetch(U+'/rest/v1/rpc/blocked_lookup_ips',{method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+S,'Content-Type':'application/json'},body:'{}'}).then(r=>r.json())
ok('the blocked list shows the offender to the owner', blocked.length>=1, JSON.stringify(blocked).slice(0,120))
const un=await fetch(U+'/rest/v1/rpc/unblock_ip',{method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+S,'Content-Type':'application/json'},body:JSON.stringify({p_ip_hash:blocked[0].ip_hash})}).then(r=>r.json())
ok('unblocking clears their attempts', un?.cleared>0, JSON.stringify(un))

console.log('\n— the list matches the limit, not a second copy of its rule (0036) —')
// Five *hits* in a minute is RATE_LIMITED with zero misses. Under the old
// misses-only listing this device did not appear at all — and behind a shared
// campus NAT it is the common case, i.e. exactly the person phoning the shop.
// The burst is fresh here because the rule's window is 60 seconds and the
// sections above take longer than that to run.
const ipFast='198.51.100.30'
const fast=[]
for (let i=0;i<6;i++) fast.push(await track(placed.code, null, ipFast))
ok('a fast reader is refused', fast.some(r=>r.s===429), JSON.stringify(fast.map(r=>r.s)))
const listNow=await fetch(U+'/rest/v1/rpc/blocked_lookup_ips',{method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+S,'Content-Type':'application/json'},body:'{}'}).then(r=>r.json())
const fastRow=listNow.find(r=>r.misses===0)
ok('and appears on the list with zero misses', Boolean(fastRow), JSON.stringify(listNow).slice(0,200))
ok('labelled RATE_LIMITED, not IP_BLOCKED', fastRow?.reason==='RATE_LIMITED', JSON.stringify(fastRow))
ok('every listed row is one the limit is actually refusing', listNow.every(r=>r.reason==='RATE_LIMITED'||r.reason==='IP_BLOCKED'), JSON.stringify(listNow.map(r=>r.reason)))
ok('codes_tried is capped at 20', listNow.every(r=>(r.codes_tried?.length??0)<=20))

console.log('\n— an admin, not only the owner, can unblock —')
const A=(email)=>{const c=crypto;const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url')
 const n=Math.floor(Date.now()/1e3),h=b({alg:'HS256',typ:'JWT'}),p=b({iss:'supabase-demo',role:'authenticated',aud:'authenticated',sub:c.randomUUID(),email,iat:n,exp:n+3600})
 return h+'.'+p+'.'+c.createHmac('sha256','super-secret-jwt-token-with-at-least-32-characters-long').update(h+'.'+p).digest('base64url')}
const staff=A('dev-staff-a@example.com')
const staffHeaders={apikey:ANON,Authorization:'Bearer '+staff,'Content-Type':'application/json'}
const staffList=await fetch(U+'/rest/v1/rpc/blocked_lookup_ips',{method:'POST',headers:staffHeaders,body:'{}'}).then(r=>r.json())
ok('a plain admin sees the blocked list', Array.isArray(staffList), JSON.stringify(staffList).slice(0,120))
ok('and the forged-token address is on it', staffList.length>=1, JSON.stringify(staffList).slice(0,160))
const staffUn=await fetch(U+'/rest/v1/rpc/unblock_ip',{method:'POST',headers:staffHeaders,body:JSON.stringify({p_ip_hash:staffList[0]?.ip_hash??''})}).then(r=>r.json())
ok('a plain admin can clear it', staffUn?.cleared>0, JSON.stringify(staffUn))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
