# Design prompt — KhunMuan ordering app

Copy everything below the line into ChatGPT or Google Stitch.

> **Note for Stitch:** it generates one screen at a time. Paste **Part 1 + Part 2**
> as standing context first, then paste one screen block from **Part 3** per
> generation. ChatGPT can take the whole thing at once.

---

You are designing the complete UI for **คุณม้วน (KhunMuan)**, a mobile-first web
app for a small Thai suki-roll shop that sells inside a university campus.
Customers order custom rolls from their phone; staff run the kitchen from a
shared back-office board.

Design **every screen listed in Part 3**, in both light and dark theme, mobile
first (375px) with desktop variants (1280px) where noted. All visible UI text
must be **Thai**, exactly as written in this brief. Do not translate the Thai
copy into English and do not invent your own wording.

---

# PART 1 — Design system (follow exactly, no substitutions)

## Brand

The shop logo is a circular sticker: a cartoon portrait of a smiling young man
with glasses and braces, on a golden-yellow disc, ringed in black, with the hand-
lettered Thai word "คุณม้วน" below — white outlined letters for "คุณ", golden
letters for "ม้วน", every letter carrying a thick black outline.

The interface takes the logo's gold and black but stays **light and calm**. The
photography of the food does the visual work; the chrome stays quiet.

## Color tokens — light theme

```
--ground        #F7F8FA   page background (slate-biased off-white)
--surface       #FFFFFF   cards, sheets, modals
--surface-2     #EFF2F6   table headers, inset panels
--ink           #101720   body text, text on gold, primary-button outline
--ink-muted     #5A6675   secondary text, labels
--border        #E3E7EC   card borders, dividers
--border-strong #CDD5DE   swatch borders, dashed containers

--gold          #F5D68A   FILL ONLY
--gold-hover    #EFC65F   primary button hover
--gold-edge     #101720   primary button 1.5px outline
--gold-ink      #B45309   TEXT ONLY
--gold-wash     #FDF6E4   soft background for callouts
```

## Color tokens — dark theme

```
--ground        #0E1319
--surface       #161D26
--surface-2     #1D2531
--ink           #E6EAF0
--ink-muted     #94A3B8
--border        #26303C
--border-strong #36424F

--gold          #F5D68A   (unchanged)
--gold-hover    #FAE3AC
--gold-edge     #F5D68A   outline becomes gold on dark
--gold-ink      #F2CE74   the text-gold changes value in dark
--gold-wash     #2A2113
```

## THREE RULES YOU MUST NOT BREAK

**1. Gold is a fill, never a text color.**
`--gold` on a light surface measures 1.19:1 — unreadable. Any text that needs to
be gold uses `--gold-ink`. Any gold area has `--ink` text on top (12.76:1).
In dark theme the two swap roles; use the tokens, never raw hex.

**2. The primary button always carries a 1.5px `--ink` outline.**
`--gold` against `--ground` is only 1.33:1, below the 3:1 WCAG 1.4.11 minimum for
a control boundary — without the outline the button dissolves into the page. The
outline is not decoration. It also mirrors the logo, whose letterforms all carry
heavy dark outlines, so the button reads as a sticker.
Primary button = `--gold` fill + `--ink` text + 1.5px `--ink` outline + 12px radius.
Secondary button = solid `--ink` fill + `--ground` text, no outline.

**3. No status color may be yellow or orange.**
Gold means "this is the brand" and nothing else. The full status set is cool:

```
รอยืนยัน      text #334155  chip #E2E8F0   hollow ring dot
รับแล้ว       text #155E75  chip #CFF3FB   solid dot
กำลังทำ       text #1E40AF  chip #DBE7FE   solid dot
รอรับ         text #065F46  chip #D1FAE9   solid dot, gentle pulse
ส่งมอบแล้ว    text #475569  chip #F1F5F9   faintest chip in the set
ยกเลิก        text #991B1B  chip #FEE2E2   solid dot
```

Dark theme chips:
```
รอยืนยัน  #CBD5E1 on #1E293B   รับแล้ว    #7DD8EE on #0B3947
กำลังทำ   #93B4FD on #132C63   รอรับ      #6EE7B7 on #06372A
ส่งมอบแล้ว #94A3B8 on #1A222E  ยกเลิก     #FCA5A5 on #4A1414
```

Every status chip shows a dot, a color, **and** the Thai word — never color alone.

## Typography

- All text: **IBM Plex Sans Thai** (fallback `Noto Sans Thai`, system-ui)
- Order codes, prices, timers, counts: **IBM Plex Mono** with tabular numerals
- Scale: 12 / 14 / 16 / 20 / 24 / 32px. Body 16px, line-height 1.7
- Headings 600 weight, body 400, buttons and prices 600
- Uppercase mono labels get 0.1em letter-spacing

## Shape and depth

- Card / sheet / modal radius **16px**
- Button / input / chip radius **12px** (pills stay fully round)
- Shadow is near-invisible: `0 1px 2px rgb(16 23 32 / 0.04)`. Cards are defined by
  their 1px border, not by shadow. Never use a heavy or colored drop shadow.
- Spacing on a 4px grid; card padding 16–20px; section gaps 24–32px
- Touch targets minimum 44×44px everywhere in the back office

## Imagery

- Every filling and set has a real photograph, **square 1:1**, centre-cropped
- The logo is used **whole** — full circle, portrait included — in every header
  and as the favicon. Never crop it or reduce it to a letterform.

## Overall feel

Minimal, modern, clean, and friendly. Rounded and soft, generous whitespace, one
accent color. **No large black areas anywhere in the customer app** — black
appears only as text and as the primary button's outline. No gradients, no
decorative illustration, no glassmorphism, no neon.

## Theme behaviour

Light and dark both ship. First load follows the device setting. Both the
customer app and the back office have a manual light/dark toggle.

---

# PART 2 — Product model (so the screens make sense)

- The shop sells **sets** of suki rolls. A set has a name, a price and a **piece
  quota** — e.g. "เซตใหญ่ 10 ชิ้น" is 10 pieces.
- The customer distributes that quota across **fillings** in any combination:
  10 pieces could be 10 different fillings or 10 of the same. **All fillings cost
  the same and are included in the set price.**
- On top of that: dipping sauces and utensils/packaging (some free, some priced),
  and a free-text note.
- Several configured sets go into a **cart** and are paid for together.
- Fulfilment is either **pickup** (choose one of the shop's meeting points and a
  time slot) or **delivery** (customer types their own location, pays a fee).
- **No customer login at all.** After ordering, the customer gets a
  **4-character code** like `K7P2` (letters and digits mixed, always uppercase).
  That code is how they look their order up.
- Payment is **cash on handover** or **bank transfer** — for transfer the
  customer uploads a slip photo and staff confirm it by hand.
- Order status runs: รอยืนยัน → รับแล้ว → กำลังทำ → รอรับ → ส่งมอบแล้ว.
  The customer can cancel only while it is still รอยืนยัน.
- Staff sign in with Google. Six of them work at once on a mix of phones and
  desktops, so every order card shows **who claimed it**.

---

# PART 3 — Screens to design

## A. Customer app (mobile 375px primary; tablet/desktop secondary)

### A1 — หน้าเมนู (menu, home)
Sticky top bar: full circular logo at left, shop name "คุณม้วน", theme toggle and
cart icon with a count badge at right. Below it, a row of set cards — square
photo, set name, piece count, price, and a gold outlined "เลือกไส้" button. If the
shop is closed, a full-width `--gold-wash` banner sits above everything:
**"ร้านปิดรับออเดอร์ชั่วคราว"** with a smaller line **"เปิดอีกครั้ง 17:00 น."**, and
every set button is disabled.

### A2 — หน้าเลือกไส้ (set builder) — THE MOST IMPORTANT SCREEN
- Sticky header that never scrolls away, showing **"เลือกแล้ว 6 / 10 ชิ้น"** with a
  progress bar underneath.
- Directly under it, a wrapping row of chosen chips: `กุ้ง ×3` `หมู ×2` `ปูอัด ×1`,
  each tappable to decrement, each with a small × .
- A 2-column grid of filling cards. Each = square photo, Thai name, and a stepper
  `−  0  +` with 44px targets.
- Sold-out fillings are **dimmed but still visible**, with a **"หมดวันนี้"** ribbon
  across the photo corner and disabled steppers. Never hide them.
- `+` disables when the quota is full, with an inline hint **"เลือกครบแล้ว"**.
- Below the grid: **น้ำจิ้ม** (steppers, price shown only when non-zero, e.g.
  "น้ำจิ้มสุกี้ +5฿"), **อุปกรณ์กิน** (checkboxes), and a note field with placeholder
  **"เช่น ไม่ใส่ผักชี เผ็ดน้อย"**.
- Sticky bottom bar with the running total and a full-width primary button. The
  button is **disabled until the quota is exactly filled**, and its label says what
  is missing: **"เลือกอีก 4 ชิ้น"** → **"เพิ่มลงตะกร้า · ฿259"**.

### A3 — ตะกร้า (cart)
List of configured boxes. Each row: set name, the filling breakdown as a muted
line, add-ons, quantity stepper, line price, and small **"แก้ไข"** / **"ลบ"** links.
Summary block: **ยอดรวม**, **ค่าส่ง**, **รวมทั้งหมด**. Primary button
**"ไปชำระเงิน"**.

### A4 — ตะกร้าว่าง (empty cart)
Centred illustration-free empty state: a large muted icon, **"ยังไม่มีอะไรในตะกร้า"**,
sub-line **"เลือกเซตที่ชอบแล้วจัดไส้เองได้เลย"**, primary button **"ดูเมนู"**.

### A5 — หน้าชำระเงิน (checkout)
Segmented control at the top: **"มารับเอง"** / **"ให้ไปส่ง"**.
- **มารับเอง** reveals: a list of pickup points as selectable cards
  (`หน้าตึก 3`, `โรงอาหาร`, `หอพัก A`) and a grid of time-slot chips
  (`12:00–12:15`, `12:15–12:30` …). Full slots are disabled and show **"เต็มแล้ว"**.
  No personal details are asked for.
- **ให้ไปส่ง** reveals: **ชื่อ**, **ห้อง/คณะ**, **เบอร์โทร**, **จุดที่ให้ไปส่ง**
  (free text), and a note that the delivery fee applies.
- Payment method as two large radio cards: **"เงินสด"** (sub-line "จ่ายตอนรับของ")
  and **"โอน"** (sub-line "อัปสลิปหลังสั่ง").
- Order summary, then primary button **"ยืนยันสั่งซื้อ"**.

### A6 — หน้ายืนยันหลังสั่ง (order confirmed)
This screen exists to make the code impossible to lose.
- A large gold-filled card, black outline, containing the code
  **`K7P2`** in mono at roughly 48px with wide letter-spacing.
- Above it: **"สั่งสำเร็จแล้ว"**. Below it: **"จำรหัสนี้ไว้ ใช้เช็คสถานะออเดอร์"**.
- Two secondary buttons side by side: **"คัดลอกรหัส"** and **"บันทึกภาพ"**.
- A muted line: **"บันทึกไว้ในเครื่องแล้ว เปิดเว็บนี้อีกครั้งก็เจอ"**.
- Primary button **"ดูสถานะออเดอร์"**.

### A7 — หน้าอัปสลิป (slip upload, transfer orders only)
Leads with the shop's PromptPay QR and the exact amount **"฿259"** in mono.
A large dashed drop zone: **"แตะเพื่ออัปโหลดสลิป"**. After selecting, a thumbnail
with **"เปลี่ยนรูป"**. Primary button **"ส่งสลิป"**. Muted footer:
**"แอดมินจะตรวจสลิปแล้วยืนยันให้"**.

### A8 — หน้าติดตามออเดอร์ (order tracking)
- The code `K7P2` shown large in mono at the top with a copy icon.
- A **vertical stepper** of five nodes — รอยืนยัน · รับแล้ว · กำลังทำ · รอรับ ·
  ส่งมอบแล้ว — completed nodes filled, the current node pulsing, future nodes
  hollow. Each completed node shows its timestamp.
- Below: the order contents, the pickup point and slot (or delivery location),
  payment method and payment state, and the total.
- While status is รอยืนยัน only, a bordered destructive-text button
  **"ยกเลิกออเดอร์"**. Show the same screen in a second variant where the status is
  กำลังทำ and that button has been replaced by the muted line
  **"ร้านรับออเดอร์แล้ว ยกเลิกเองไม่ได้ ติดต่อร้านได้ที่ 08x-xxx-xxxx"**.

### A9 — หน้าค้นหาออเดอร์ (code lookup)
**Four separate single-character input boxes**, large, mono, auto-uppercasing,
auto-advancing. Label above: **"ใส่รหัส 4 ตัวจากตอนสั่ง"**. Primary button
**"ค้นหา"**. Below, if the device has saved codes, a section
**"ออเดอร์ของฉัน"** listing them as tappable rows with code, status chip and time.

### A10 — ออเดอร์ของฉัน ว่าง (empty saved-orders)
**"ยังไม่มีออเดอร์ในเครื่องนี้"** + **"สั่งครั้งแรกแล้วรหัสจะถูกเก็บไว้ให้อัตโนมัติ"**.

## B. Customer error states

### B1 — รหัสไม่ถูกต้อง
Inline under the four boxes, in the cancel-red text color:
**"ไม่พบรหัสนี้ ลองเช็คอีกครั้ง"**. The boxes get a red border.

### B2 — โดนจำกัดการค้นหา (rate limited, the important one)
A centred card, `--gold-wash` background, gold-ink left rule:
- **"ลองค้นหาบ่อยเกินไป"**
- **"รอ 15 นาทีแล้วลองใหม่ หรือติดต่อร้านให้ช่วยเช็คให้"**
- Two secondary buttons: **"โทรหาร้าน"** and **"แชท LINE"**
- A mono countdown **`14:32`**

### B3 — ไส้หมดตอนกดสั่ง
A bottom sheet: **"ไส้บางอย่างหมดพอดี"**, a list of the affected items
(**"กุ้ง เหลือ 2 ชิ้น"**), and two buttons: **"กลับไปแก้"** (primary) and
**"ยกเลิก"**.

### B4 — ออฟไลน์
A slim bar pinned under the header, `--surface-2`, muted text:
**"ออฟไลน์ กำลังลองเชื่อมต่อใหม่"** with a small spinner.

### B5 — 404
**"ไม่เจอหน้านี้"** + primary button **"กลับหน้าเมนู"**.

## C. Back office (design BOTH mobile 375px and desktop 1280px)

### C1 — หน้าเข้าสู่ระบบ (staff login)
Centred card on `--ground`. Full circular logo, **"หลังร้านคุณม้วน"**, one button
**"เข้าสู่ระบบด้วย Google"**, and a muted footer
**"เฉพาะทีมงานที่ได้รับสิทธิ์เท่านั้น"**.

### C2 — ไม่มีสิทธิ์เข้าใช้ (access denied)
Same card, red-text heading **"บัญชีนี้ไม่มีสิทธิ์เข้าใช้"**, sub-line
**"ติดต่อแอดมินให้เพิ่มอีเมลของคุณ"**, secondary button **"ออกจากระบบ"**.

### C3 — กระดานออเดอร์ (order board) — THE SECOND MOST IMPORTANT SCREEN
**Desktop:** four Kanban columns — **รอยืนยัน · รับแล้ว · กำลังทำ · รอรับ** — each
with a count in its header. Cards have explicit action buttons; do not design
drag handles.
**Mobile:** a single scrolling list with a sticky row of filter chips
(**ทั้งหมด · รอยืนยัน · รับแล้ว · กำลังทำ · รอรับ**), newest-relevant first.

Top bar carries: the logo, a shop **เปิด/ปิด** toggle switch, a connection dot with
the label **"เชื่อมต่ออยู่"**, a theme toggle, and the signed-in staff avatar.

**Order card anatomy** — design this precisely:
```
┌────────────────────────────────────────┐
│ K7P2            [รอยืนยัน]     3 นาที  │
│ ───────────────────────────────────── │
│ เซตใหญ่ 10 ชิ้น ×1                      │
│ กุ้ง ×3 · หมู ×4 · ปูอัด ×3              │
│ น้ำจิ้มสุกี้ ×2 · ไม่ใส่ผักชี             │
│ ───────────────────────────────────── │
│ หน้าตึก 3 · 12:00–12:15         ฿259  │
│ โอน · รอตรวจสลิป                       │
│ ───────────────────────────────────── │
│ ยังไม่มีคนรับ            [ รับงาน ]     │
└────────────────────────────────────────┘
```
- The code is mono and the largest text on the card.
- The **age timer** counts up: `--ink-muted` under 10 minutes, `--gold-ink` from 10,
  and cancel-red from 20. Show all three variants.
- The claim row reads **"ยังไม่มีคนรับ"** with a **"รับงาน"** primary button, or an
  avatar chip plus **"ฟ้า กำลังทำ"** when someone owns it. Cards claimed by
  someone else get a muted border so the eye skips them.
- Fillings are always visible on the card — never collapsed behind a tap.
- Payment state sits on the card, not one level down.
- A brand-new card carries a temporary gold ring until someone opens or claims it.
- Buttons by column: **รับออเดอร์** / **เริ่มทำ** / **เสร็จแล้ว** / **ส่งมอบแล้ว**.

### C4 — กระดานว่าง (empty board)
**"ยังไม่มีออเดอร์วันนี้"** + **"ออเดอร์ใหม่จะเด้งขึ้นมาเองพร้อมเสียงเตือน"**.
Also design a one-time prompt card: **"แตะเพื่อเปิดเสียงแจ้งเตือน"**.

### C5 — รายละเอียดออเดอร์ / ใบครัว (order detail)
Everything from the card, larger, plus: a per-piece filling list big enough to
read at arm's length, the customer's contact details (delivery orders only), a
**slip thumbnail** that opens full-screen, buttons **"ยืนยันการชำระเงิน"** and
**"ยกเลิกออเดอร์"**, and a timeline of every status change with actor names and
timestamps (**"ฟ้า เปลี่ยนเป็น กำลังทำ · 12:04"**).

### C6 — คีย์ออเดอร์เอง (manual order entry)
The same builder as A2 but in back-office chrome, plus a customer-name field and
a **"รับออเดอร์เลย"** checkbox that skips รอยืนยัน.

### C7 — จัดการเมนู (menu management, superadmin)
Two tabs: **เซต** and **ไส้**. Each is a table on desktop, cards on mobile, with a
square thumbnail, name, price, an active toggle, and edit/delete. Plus an
**"เพิ่มไส้"** dialog with a square image-upload dropzone showing a crop preview.

### C8 — สต็อกวันนี้ (daily stock)
One row per filling: square thumbnail, name, a large mono number for
**คงเหลือ**, a `− +` stepper, and a **"หมดแล้ว"** toggle. Fillings at zero get a
muted row and the ribbon. Header shows **"สต็อกวันที่ 21 ส.ค."** with a
**"รีเซ็ตสต็อกวันนี้"** button.

### C9 — ตั้งค่าร้าน (shop settings)
Grouped sections: **เปิด/ปิดร้าน** (big switch plus a closed-message field),
**จุดนัดรับ** (reorderable list with add/remove), **ช่วงเวลารับ** (slot list with a
capacity field each), **ค่าส่ง** (number input), **รหัสออเดอร์** (see C11).

### C10 — รายงาน (reports, superadmin)
Four stat tiles across the top — **ยอดขายวันนี้**, **จำนวนออเดอร์**, **เงินสด**,
**โอน** — each with a big mono figure and a small comparison line. Below: a bar
chart of daily sales for the last 14 days, a ranked list of best- and worst-
selling fillings, and a table of average time per stage. Chart colors come from
the cool status palette; **do not use gold in charts**.

### C11 — ตั้งค่ารหัสออเดอร์ (order-code settings, superadmin)
Two character pickers, **ตัวอักษรที่ใช้** and **ตัวเลขที่ใช้**, shown as toggleable
chips. A length selector **4 / 5 / 6**. A live read-out
**"รหัสที่เป็นไปได้ 639,584 รหัส"**. A progress meter **"ใช้ไปแล้ว 0.4%"** with
**"พอไปอีกประมาณ 17 ปี"**. A blocklist editor as a chip input.

### C12 — จัดการทีมงาน (staff management, superadmin)
A list of staff — avatar, name, email, a role chip **แอดมิน** / **ซูเปอร์แอดมิน**,
and an active toggle. The superadmin row is visually locked with a small lock icon
and the tooltip **"แก้ไขได้ที่ฐานข้อมูลเท่านั้น"**. Button **"เพิ่มแอดมิน"**.

### C13 — รายการที่ถูกบล็อก (blocked lookups, superadmin)
A table of blocked visitors: a truncated hash, first and last attempt times, an
attempt count, the codes tried, and a **"ปลดล็อก"** button per row. Empty state:
**"ยังไม่มีใครโดนบล็อก"**.

## D. Back-office error states

### D1 — คนอื่นรับไปแล้ว
A toast, not an error dialog: **"ฟ้ารับงานนี้ไปแล้ว"** with a **"ดูออเดอร์"** link.

### D2 — ข้อมูลไม่ตรงกัน
Toast: **"ออเดอร์นี้มีคนอัปเดตไปแล้ว กำลังโหลดใหม่"**.

### D3 — หลุดการเชื่อมต่อ
The connection dot in the top bar turns cancel-red with the label
**"ขาดการเชื่อมต่อ"** and a **"ลองใหม่"** link. A banner underneath reads
**"ข้อมูลอาจไม่ใช่ล่าสุด"**.

---

# PART 4 — Deliverables

For each screen produce the **mobile** layout, and additionally the **desktop**
layout for every C-series screen. Show each screen in **light theme**, and show
the following four in **dark theme** as well: A2 (set builder), A8 (tracking),
C3 (order board), C5 (order detail).

Also produce a one-page component sheet showing, in both themes: the primary
button in default / hover / disabled, the secondary button, the four-box code
input in empty / filled / error, all six status chips, a filling card in normal /
selected / sold-out, and the stepper in all its states.

Keep every color, radius, shadow and Thai string exactly as specified above.
