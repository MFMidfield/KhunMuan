---
name: khunmuan
description: โปรเจกต์ KhunMuan (คุณม้วน) — webapp สั่งสุกี้โรลคัสตอมสำหรับร้านในมหาลัย React+TS+Tailwind+Supabase ใช้เมื่อทำงานใน repo KhunMuan, แก้ frontend/backend ของแอปสั่งอาหารนี้, แตะเรื่อง order code, สถานะออเดอร์, สต็อกไส้, หลังร้าน, หรือ design token ของร้าน
---
 
# KhunMuan
 
ทำตาม `few-workflow` ทุกข้อ ไฟล์นี้เสริมเฉพาะเรื่องโปรเจกต์นี้
 
## อ่านก่อนเสมอ
 
1. `docs/PROJECT_MAP.md`
2. `docs/plan/README.md` — สารบัญ + สรุป decision ทั้งหมด
3. เอกสารที่เกี่ยวกับงานที่กำลังทำ:
| ไฟล์ | เรื่อง |
|------|-------|
| `docs/plan/00-overview.md` | เป้าหมาย, actor, stack |
| `docs/plan/01-data-model.md` | ตาราง, constraint, index |
| `docs/plan/02-order-lifecycle.md` | state machine, claim, ตัดสต็อก |
| `docs/plan/03-order-code.md` | logic สร้างรหัส 4 ตัว + security |
| `docs/plan/04-frontend.md` | route, จอ, design token |
| `docs/plan/05-backend-security.md` | auth, RLS, realtime, storage, rate limit |
| `docs/plan/06-roadmap-open-questions.md` | เฟส + สิ่งที่ยังไม่เคาะ |
 
decision ที่อยู่ในเอกสารพวกนี้ = ล็อกแล้ว **ห้ามเปลี่ยนโดยไม่ถาม**
เปลี่ยนเมื่อไหร่ → แก้ในเอกสารด้วย ไม่ใช่แค่บอกในแชท
 
## Stack
 
React 19 + TypeScript + Vite · Tailwind v4 · React Router v7 · TanStack Query · React Hook Form + Zod
Supabase (Postgres / Auth / Realtime / Storage / Edge Functions) · Google OAuth เฉพาะ staff
dev = supabase local · prod = Supabase Cloud + Vercel
 
```
KhunMuan/
├── docs/plan/          เอกสารแผน
├── backend/supabase/   migrations, functions, seed
└── frontend/src/
    ├── app/            router, provider, layout
    ├── features/       menu, cart, checkout, tracking, admin
    ├── components/ui/  design system
    ├── lib/            supabase client, i18n, utils
    └── types/          database.ts (generated)
```
 
## กฎเฉพาะโปรเจกต์นี้
 
### Logic อยู่ใน Postgres
`place_order`, `claim_order`, `advance_order`, `set_payment`, `set_stock` เป็น `SECURITY DEFINER` function
client **ห้าม** เขียน `orders.status`, ราคา, หรือสต็อกตรงๆ
ต้องเพิ่ม/แก้ function → paste SQL ในแชท (ตาม few-workflow ข้อ 3)
 
### รหัสออเดอร์
4 ตัว · alphabet `A-Z 2-9` ตัด `I L O 0 1` ออก · **ทุกรหัสต้องมีทั้งตัวอักษรและตัวเลข**
สร้างด้วย keyed Feistel + cycle-walk เข้า `[0,M)` → unrank เข้าเซตผสม
ลำดับนี้สลับไม่ได้ สลับแล้วรหัสชนกัน — เหตุผลอยู่ใน `03-order-code.md` §4
มี property test ต้องผ่านเสมอ: 639,584 รหัส ไม่ซ้ำ ทุกตัวมีเลข+อักษร
 
### สถานะ
`pending_confirmation → accepted → cooking → ready → handed_over`
(+ `cancelled`, `rejected`)
ลูกค้ายกเลิกได้เฉพาะตอน `pending_confirmation`
 
### สีทอง — สองค่า ห้ามสลับ
- `--gold` `#F5D68A` = **ถมพื้นเท่านั้น** เป็นตัวหนังสือบนพื้นสว่างได้ 1.19:1 อ่านไม่ออก
- `--gold-ink` `#B45309` = **ตัวหนังสือเท่านั้น**
- dark mode สองตัวนี้สลับหน้าที่กันเอง ผ่าน token **ห้าม hardcode ค่า**
- ปุ่มหลัก = พื้น `--gold` + ตัวหนังสือ `--ink` + **ขอบ `--ink` 1.5px**
  ขอบจำเป็น ไม่ใช่ของตกแต่ง — ทองบนพื้นหน้าได้ 1.33:1 ต่ำกว่าเกณฑ์ 3:1 ของ WCAG 1.4.11
- สีสถานะโทนเย็นล้วน ห้ามใช้เหลือง/ส้มเป็นสถานะ
### อื่นๆ
- ฟอนต์ IBM Plex Sans Thai + IBM Plex Mono (รหัส, ราคา, ตัวจับเวลา → tabular-nums)
- การ์ด 16px ปุ่ม 12px เงาเบาเกือบแค่เส้นขอบ
- รูปไส้ 1:1
- ไม่มีพื้นดำใหญ่ในหน้าลูกค้า ดำเป็นแค่ตัวหนังสือกับขอบปุ่ม
- light + dark ทั้งสองฝั่ง **สว่างเป็น default ทุกเครื่อง** มีปุ่มสลับ จำค่าไว้
  ห้ามใส่ `@media (prefers-color-scheme: dark)` กลับเข้า `index.css` — เหตุผลอยู่ใน `04-frontend.md` §6
- ไทยก่อน แต่ห้ามฝัง string ใน JSX ใช้ `t()` เสมอ
- ราคาต้อง snapshot ลง order ห้าม join สดจาก `sets`
- 6 คนใช้หลังร้านพร้อมกัน → ทุก mutation ต้องกัน race (claim, `expected_version`)
## ยังไม่เคาะ
 
ดู `docs/plan/06-roadmap-open-questions.md`
ที่ยังค้างส่วนใหญ่คือข้อมูลร้าน (รายชื่อไส้จริง ราคา จุดนัดรับ slot อีเมลทีม LINE OA)
งานไหนต้องใช้ข้อมูลพวกนี้ → ถามก่อน ห้ามใส่ค่าสมมติ