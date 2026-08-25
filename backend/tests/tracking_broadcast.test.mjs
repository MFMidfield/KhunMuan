// Live tracking · docs/plan/05-backend-security.md §7
//
//   cd backend && npm run test:tracking
//
// The customer subscribes to a channel named after the order's id, never to the
// orders table and never by code — a code used as a subscription filter is a
// code that can be brute-forced over a websocket with no HTTP request to
// rate-limit.
//
// Note the two-second settle after SUBSCRIBED. That is not padding: a broadcast
// sent inside that window is genuinely dropped, which is why the tracking page
// refetches on join and keeps a slow poll as a safety net.
import { createClient } from '../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs'
import crypto from 'node:crypto'
const URL='http://127.0.0.1:54321'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SECRET='super-secret-jwt-token-with-at-least-32-characters-long'
const mint=e=>{const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const n=Math.floor(Date.now()/1e3)
 const h=b({alg:'HS256',typ:'JWT'}),p=b({iss:'supabase-demo',role:'authenticated',aud:'authenticated',sub:crypto.randomUUID(),email:e,iat:n,exp:n+3600})
 return `${h}.${p}.${crypto.createHmac('sha256',SECRET).update(`${h}.${p}`).digest('base64url')}`}
const customer=createClient(URL,ANON)
const rpc=(fn,b,tok=ANON)=>fetch(`${URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:ANON,Authorization:`Bearer ${tok}`,'Content-Type':'application/json'},body:JSON.stringify(b)}).then(async r=>({s:r.status,b:await r.json().catch(()=>null)}))

const placed=await rpc('place_order',{p_payload:{client_request_id:crypto.randomUUID(),fulfillment:'pickup',customer_name:'ผู้ทดสอบ',
  pickup_point_id:'c0000000-0000-4000-8000-000000000001',pickup_slot_id:'50000000-0000-4000-8000-000000000001',
  payment_method:'cash',items:[{set_id:'5e000000-0000-4000-8000-000000000001',quantity:1,
  fillings:[{filling_id:'f1000000-0000-4000-8000-000000000004',qty:5}]}]}})
// Through the Edge Function, because anon lost direct access to lookup_order
// in migration 0018 — which is exactly how the real tracking page resolves a
// code into the order id it then subscribes to.
const look=await fetch(`${URL}/functions/v1/track`,{method:'POST',
  headers:{apikey:ANON,Authorization:`Bearer ${ANON}`,'Content-Type':'application/json',
           'x-forwarded-for':'203.0.113.77'},
  body:JSON.stringify({code:placed.b.code,client_token:placed.b.client_token})}).then(r=>r.json())
const id=look.id
console.log('order', placed.b.code, 'id', id)

const got=[]
const ch=customer.channel(`order:${id}`)
  .on('broadcast',{event:'status'},m=>{got.push(m.payload); console.log('  received:', JSON.stringify(m.payload))})
await new Promise(res=>ch.subscribe(s=>{console.log('  subscribe status:',s); if(s==='SUBSCRIBED')setTimeout(res,2000)}))

const A=mint('dev-staff-a@example.com')
const [row]=await fetch(`${URL}/rest/v1/orders?select=version&id=eq.${id}`,{headers:{apikey:ANON,Authorization:`Bearer ${A}`}}).then(r=>r.json())
await rpc('advance_order',{p_order_id:id,p_to_status:'accepted',p_expected_version:row.version},A)
await new Promise(r=>setTimeout(r,1500))
const [row2]=await fetch(`${URL}/rest/v1/orders?select=version&id=eq.${id}`,{headers:{apikey:ANON,Authorization:`Bearer ${A}`}}).then(r=>r.json())
await rpc('advance_order',{p_order_id:id,p_to_status:'cooking',p_expected_version:row2.version},A)
await new Promise(r=>setTimeout(r,1500))

const t=(n,c,x='')=>console.log(`  ${c?'ok  ':'FAIL'} · ${n} ${c?'':x}`)
console.log('\n— assertions —')
t('anon received both status changes', got.length===2, `got ${got.length}`)
t('first was accepted', got[0]?.status==='accepted', JSON.stringify(got[0]))
t('second was cooking', got[1]?.status==='cooking', JSON.stringify(got[1]))
t('payload carries no customer data', got[0] && !('customer_name' in got[0]) && !('code' in got[0]))
await customer.removeChannel(ch)
process.exit(got.length===2?0:1)
