# 04 · Frontend

## 1. Routes

### Customer (public, no auth)

| Path | Screen | Notes |
|------|--------|-------|
| `/` | Menu | Set cards, shop-closed banner, cart badge |
| `/build/:setId` | Set builder | The core interaction — quota allocation |
| `/cart` | Cart | Edit quantities, remove, re-open builder |
| `/checkout` | Checkout | Fulfillment, contact, payment method |
| `/checkout/slip/:code` | Slip upload | Only for `method = 'transfer'` |
| `/o/:code` | Tracking | Live status; cancel button while pending |
| `/my-orders` | Device order list | Reads codes from `localStorage` |

### Back office (Google OAuth required)

| Path | Screen | Role |
|------|--------|------|
| `/admin/login` | Sign in with Google | — |
| `/admin` | Order board | admin |
| `/admin/orders/:id` | Order detail / kitchen ticket | admin |
| `/admin/new` | Key in a phone order | admin |
| `/admin/menu` | Sets, fillings, add-ons, photos | superadmin |
| `/admin/stock` | Today's remaining quantities | admin |
| `/admin/settings` | Open/close, pickup points, slots, delivery fee | superadmin (open/close: admin) |
| `/admin/reports` | Daily sales, top/bottom fillings, stage times | superadmin |
| `/admin/staff` | Admin allow-list | superadmin |

A route guard reads the session, looks up `admin_users` by email, and redirects
on `is_active = false` or no row. The guard is convenience only — RLS is the
real boundary (doc 05).

## 2. The set builder — the screen that matters most

This is where failure mode #2 ("wrong filling") is either prevented or created.
Requirements:

- The quota is always visible: a persistent header reading `เลือกแล้ว 6 / 10 ชิ้น`
  with a progress bar. It never scrolls away.
- Each filling is a card with its real photo, a name, and a stepper (`− 0 +`).
- Fillings that are out of stock for today render dimmed with a `หมดวันนี้`
  ribbon and disabled steppers — never hidden. A customer who cannot find
  yesterday's favourite assumes the app is broken; one who sees it greyed out
  understands immediately.
- `+` disables when the quota is full or `max_per_set` is reached, with the
  reason as a tooltip/inline hint rather than a silent dead button.
- The "เพิ่มลงตะกร้า" button stays disabled until `selected == quota`, and its
  label states what is missing: `เลือกอีก 4 ชิ้น`. A disabled button that does not
  say why is a dead end.
- Below the fillings: sauce selection (stepper per sauce, price shown when
  non-zero), utensils/packaging (checkbox or stepper), and a note field with a
  short placeholder of real examples.
- A sticky summary bar on mobile shows the running item total.

Chosen fillings also render as a compact chip row at the top — `กุ้ง ×3`,
`หมู ×2` — tappable to decrement. On a 10-piece set the stepper grid alone is
too easy to lose track of.

## 3. The order board — the screen that runs the shop

Layout is **responsive by role of the device, not by breakpoint alone**:

- **Desktop (≥1024px):** four Kanban columns — `รอยืนยัน`, `รับแล้ว`, `กำลังทำ`,
  `รอรับ`. Drag is *not* the primary interaction; each card has explicit action
  buttons. Drag-and-drop on a shared realtime board with six users invites
  accidents.
- **Mobile (<1024px):** a single scrollable list with a sticky status filter
  chip row, newest-relevant first. Six staff on phones need one column and big
  tap targets, not four squeezed ones.

The same data, two presentations, one `useOrderBoard()` hook.

### Card anatomy

```
┌─────────────────────────────────────────┐
│  K7P2      ● รอยืนยัน        ⏱ 3 นาที   │
│  ─────────────────────────────────────  │
│  เซตใหญ่ 10 ชิ้น ×1                      │
│  กุ้ง ×3 · หมู ×4 · ปูอัด ×3             │
│  🥣 น้ำจิ้มสุกี้ ×2   📝 ไม่ใส่ผักชี      │
│  ─────────────────────────────────────  │
│  📍 หน้าตึก 3 · 12:00–12:15             │
│  💵 โอน · รอตรวจสลิป          ฿259      │
│  ─────────────────────────────────────  │
│  👤 ยังไม่มีคนรับ        [ รับงาน ]      │
└─────────────────────────────────────────┘
```

Non-negotiable details:

- **Age timer** counts up from `created_at` and turns amber past 10 minutes, red
  past 20. This is the entire defence against dropped orders — a card that has
  been sitting has to look wrong.
- **Claim chip** shows the owner's name or `ยังไม่มีคนรับ`. Cards claimed by
  someone else get a muted border so your eye skips them.
- **Payment state** is on the card, not one tap away. It is a top-four failure
  mode; it gets top-level pixels.
- **Fillings are always visible** on the card, never collapsed. Opening a detail
  view to see what to cook is one tap too many during a rush.
- The `[ รับงาน ]` button becomes `[ เริ่มทำ ]` once claimed by you, and
  `[ เสร็จแล้ว ]` in the cooking column.

### Realtime

One Supabase Realtime channel subscribed to `orders` and `order_items` for
`service_date = today`. Events patch the TanStack Query cache directly rather
than triggering a refetch, so the board does not flicker under load. A
heartbeat indicator in the header shows connection state — when campus wifi
drops, staff must know the board is stale, and a reconnect triggers a full
refetch to reconcile anything missed.

## 4. Tracking page

A vertical stepper with five nodes matching the status enum, the current node
pulsing. Above it: the code in a large monospace-ish treatment, because that is
what the customer will be asked for at the counter. Below: the order contents,
the pickup point and slot or delivery location, the total, and payment state.

While `pending_confirmation`, a `ยกเลิกออเดอร์` button with a confirm dialog.
The button removes itself the instant the shop accepts — via the same realtime
subscription — which is a quietly important piece of expectation-setting.

For `transfer` orders that are still `unpaid`, the page leads with the upload
prompt and the shop's PromptPay QR. Nothing else on the page competes with it.

## 5. State management

| Kind of state | Where it lives |
|---------------|----------------|
| Menu, orders, stock, settings | TanStack Query, keyed by entity |
| Cart | React context + `localStorage`, Zod-validated on read |
| My order codes | `localStorage` array of `{ code, token, createdAt }` |
| Builder draft | Local component state, lifted to the cart on add |
| Sound consent, board layout preference | `localStorage` |

`localStorage` reads are wrapped in try/catch and validated with Zod. A private
window, a cleared cache, or a schema change from an older deploy must degrade to
an empty cart, never to a crash.

## 6. Design system

Locked. Derived from the shop logo — golden yellow, black, white — with a
cool slate-blue neutral base. Live reference with real contrast numbers:
the **พาเลตต์คุณม้วน** artifact.

Tailwind v4 with tokens as CSS custom properties on `:root`, so the same names
work in Tailwind classes and in raw CSS.

```css
:root {
  --ground:      #F7F8FA;   /* page background, slate-biased off-white */
  --surface:     #FFFFFF;   /* cards, sheets, modals */
  --surface-2:   #EFF2F6;
  --ink:         #101720;   /* body text, text on gold, primary button edge */
  --ink-muted:   #5A6675;
  --border:      #E3E7EC;
  --border-strong: #CDD5DE;

  --gold:        #F5D68A;   /* FILL ONLY — never text */
  --gold-hover:  #EFC65F;
  --gold-edge:   #101720;   /* 1.5px outline on the primary button */
  --gold-ink:    #B45309;   /* TEXT ONLY — links, order-age timer */
  --gold-wash:   #FDF6E4;

  --st-pending-fg:#334155;  --st-pending-bg:#E2E8F0;
  --st-accept-fg: #155E75;  --st-accept-bg: #CFF3FB;
  --st-cook-fg:   #1E40AF;  --st-cook-bg:   #DBE7FE;
  --st-ready-fg:  #065F46;  --st-ready-bg:  #D1FAE9;
  --st-done-fg:   #475569;  --st-done-bg:   #F1F5F9;
  --st-cancel-fg: #991B1B;  --st-cancel-bg: #FEE2E2;

  --r-card: 16px;
  --r-btn:  12px;
  --shadow: 0 1px 2px rgb(16 23 32 / .04);
}
```

Dark values are redefined under `@media (prefers-color-scheme: dark)` guarded as
`:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]` so
an explicit toggle wins in both directions.

### The two-gold rule

This is the single most important thing to get right, and the easiest to get
wrong six months from now:

- **`--gold` is a fill, never a colour for text.** On white it measures 1.19:1.
  Anything set in gold on a light surface is unreadable.
- **`--gold-ink` is text, never a fill.** 5.02:1 on white.
- In dark mode the two **swap roles** — `--gold` becomes an excellent text
  colour (13.21:1 on the dark ground) and `--gold-ink` disappears, so the token
  is redefined to `#F2CE74`. Never hard-code either value.

### The outlined primary button

`--gold` against `--ground` is 1.33:1. WCAG 1.4.11 requires 3:1 for the boundary
of an interactive control, so a plain gold button dissolves into the page even
though its label is perfectly legible at 12.76:1.

The fix comes from the logo itself: every letter of "คุณม้วน" is a yellow form
with a heavy dark outline — nothing floats unbounded on white. The primary
button follows the same rule: `--gold` fill, `--ink` text, **1.5px `--ink`
outline**. The edge measures 16.96:1, and the result reads as a sticker, which
suits the friendly-rounded direction.

Secondary buttons are solid `--ink` with `--ground` text and need no outline.

### Status colours are all cool

Nothing in the status set touches yellow or orange, so gold retains exactly one
meaning in the interface: *this is the brand*, never *this is a state*. Pending
is a hollow-dot slate chip (deliberately inert); accepted → cooking → ready runs
cyan → blue → green so progress reads without reading words; handed-over is the
faintest chip in the set because finished work must not compete with unfinished
work; cancelled stays red, because fighting the universal danger colour helps
nobody. Every chip carries a dot, a colour and a word — colour alone fails for
colour-blind staff and in bad kitchen lighting.

All pairs measure between 6.18:1 and 8.40:1 in light mode, 6.24:1 and 9.85:1 in
dark.

### Typography

`IBM Plex Sans Thai` for everything, from Google Fonts, with a
`"Noto Sans Thai", system-ui` fallback stack. `IBM Plex Mono` for order codes,
prices and timers. Tabular numerals wherever digits line up or tick, so nothing
jitters as it updates.

### Theme

Both surfaces ship light and dark. **First load follows the device** —
`prefers-color-scheme`, no stamp on the root element. Both the customer app and
the back office carry a manual toggle whose choice is stored in `localStorage`
and stamps `data-theme`. The kitchen works under varying light and the toggle
costs almost nothing once the tokens exist.

### Imagery

Filling photos are **square, 1:1**, centre-cropped on upload. They tile evenly in
the builder grid, look right at any column count, and stay easy to shoot
consistently on a phone.

The logo is used whole — full circle, face included — everywhere it appears,
including as the favicon at 32px where it will be indistinct. That was a
deliberate call: brand recognition over icon legibility.

### Principles

- **Minimal, modern, clean, and friendly.** Generous whitespace, 16px card
  corners, 12px buttons, shadows so light they read as barely more than a
  hairline. One accent colour. No gradients, no decorative illustration.
- **The page is light.** No large black areas anywhere in the customer app —
  black appears as text and as the primary button's outline, nothing more.
- **Photos carry the visual weight.** The chrome around them stays quiet.
- **Touch targets ≥ 44px** in the back office. It is used with wet hands, fast.
- **Motion is functional only** — a new card sliding in, a status node advancing.
  Nothing decorative animates.

## 6b. The order-code input

Four separate boxes, not one text field. Each holds one character, uppercases on
keystroke, auto-advances forward on entry and backward on delete, and accepts a
full pasted code across all four. Characters outside the alphabet (`I L O 0 1`)
are rejected with an inline hint rather than silently corrected — guessing a
user's intent on an access key is worse than asking.

The confirmation screen after ordering shows the code large and centred with a
copy button and a save-image button, and the code is written to `localStorage`
so returning to the site surfaces it again without any typing.

## 7. Internationalisation

Thai ships first; the scaffolding goes in from day one because retrofitting is
worse than building it.

- `react-i18next` with `th` as default and `en` stubbed.
- No string literals in JSX. `t('cart.empty')`, always.
- Namespaces per feature: `menu`, `cart`, `checkout`, `tracking`, `admin`,
  `common`.
- Dates and currency through `Intl` with an explicit `th-TH` locale, never
  hand-formatted.
- Content typed by staff — set names, filling names, notes — is **not**
  translated. It is data, and it stays in whatever language it was entered in.

## 8. Accessibility floor

- Every filling image has a meaningful `alt`.
- Steppers are real `<button>`s with `aria-label`s; the quota counter is an
  `aria-live="polite"` region so a screen reader announces progress.
- Colour contrast at WCAG AA against both `--bg` and `--surface`. The yellow
  accent will need a dark text pairing — yellow on white fails contrast, and the
  palette work has to account for that from the start.
- Full keyboard operation of the back office. Six staff, some on laptops, and
  keyboard-driven claiming is measurably faster than a trackpad.
