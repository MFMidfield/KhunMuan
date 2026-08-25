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
  client_request_id:crypto.randomUUID(),fulfillment:'pickup',
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

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
