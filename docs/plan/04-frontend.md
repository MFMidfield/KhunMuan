# 04 · Frontend

## 1. Routes

### Customer (public, no auth)

| Path | Screen | Notes |
|------|--------|-------|
| `/` | Landing | First impression: what the shop is, the order button, contact, staff entrance |
| `/menu` | Menu | Set cards, shop-closed banner, cart badge |
| `/build/:setId` | Set builder | The core interaction — quota allocation |
| `/cart` | Cart | Edit quantities, remove, re-open builder |
| `/checkout` | Checkout | Fulfillment, contact, payment method; QR + slip when paying by transfer |
| `/checkout/slip/:code` | Slip upload | Re-upload after the order exists |
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
| `/admin/settings` | Open/close, contact channels, pickup points, slots, delivery fee, order limits, handover code | superadmin (open/close: admin) |
| `/admin/reports` | Daily sales, top/bottom fillings, stage times | superadmin |
| `/admin/staff` | Admin allow-list | superadmin |

A route guard reads the session, looks up `admin_users` by email, and redirects
on `is_active = false` or no row. The guard is convenience only — RLS is the
real boundary (doc 05).

### Why `/` is not the menu any more

The menu held `/` through Phases 1–4 and it was the wrong screen to open on. A
grid of set cards answers "what can I buy" and nothing else: not what this shop
is, not whether it is taking orders right now, and not how to reach a person
when something has gone wrong with an order already placed. A first-time visitor
arriving from a poster or a friend's link got a price list.

`/` is now a landing page and the menu moved to `/menu`. The landing page is the
only screen in the app whose job is persuasion rather than a task, and it does
four things in this order, because that is the order a phone reads them in:

1. **Open or closed, and what the shop sells.** The open state is a chip with a
   dot and a word, in the cool status palette — never gold, which means *brand*
   everywhere in this app and never *state*.
2. **The order button.** Gold fill, ink text, 1.5px ink edge — the primary
   button construction, rendered as an `<a>` because it is a navigation. One of
   them, in the hero. There was briefly a second copy below the contact card for
   readers who had scrolled past the first; the side nav made it redundant,
   because the menu link is now one tap away from anywhere on the page.
3. **Contact — phone, email, Instagram.** All three come from `shop_settings`
   (migration 0025) and are edited in `/admin/settings`. Each is a whole-row
   link: `tel:`, `mailto:`, and the profile URL. A channel the shop has not
   filled in renders as nothing at all, not as an empty row.
4. **The staff entrance**, as a small footer link. Six people use it; everyone
   else must not wonder whether they were supposed to sign in.

The page renders without waiting on a query. The settings read decorates it —
the chip, the closed message, the contact rows — but the hero and the order
button are there while the request is in flight and still there if it fails. A
landing page that shows a spinner has failed at the one thing it exists to do.

The Instagram handle is stored **bare, without the leading `@`**, and both the
display `@` and the URL are built from it. The admin field strips a typed `@`
rather than rejecting it: everyone types it, the check constraint forbids it,
and refusing the most natural input to teach a storage detail helps nobody.

### The customer shell is a side nav

The header carries two things: the wordmark, and the button that opens the
drawer. Cart, my orders and the light/dark toggle used to sit beside them and
now live in the drawer. Four controls competing for the top of a 360px screen
was three too many, and none of the three that moved is touched on the way *in*
to an order — they are the things you reach for after one exists.

Non-negotiable details, in the order they will be broken:

- **The cart count rides the menu button.** Folding the cart behind a drawer
  otherwise hides the one piece of state a customer needs at a glance: that
  something is waiting in it. The badge is the same gold-fill, ink-edge chip the
  header used before, moved.
- **One drawer at every width.** No permanent rail above `lg`. A rail takes a
  column out of every customer screen, and the builder grid and the checkout
  summary were both laid out against the full container width.
- **The drawer closes on the tap, not on the pathname.** Same as the back
  office's `เพิ่มเติม` sheet, and for the same reason: the tap is the event, and
  a navigation that does not change the path would leave the drawer hanging over
  the page it just took you to.
- **Escape closes it, the backdrop closes it, and the body does not scroll
  underneath it.** The scroll lock restores the previous value rather than
  clearing it.
- The theme control is a **full-width row** inside the drawer rather than the
  round `ThemeToggle` button. Same action and the same label; a 44px circle in a
  list of rows reads as a stray control. `ThemeToggle` itself is unchanged and
  still used by the back office and the login screen.

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

**One filtered list, at every width.** A sticky chip row — `ทั้งหมด` plus one
chip per status, each carrying its count — and below it the cards for whatever
is selected. `ทั้งหมด` is the default. The chip row sticks under the header, so
the filter stays reachable however far the list has been scrolled; it is now the
only way to narrow the board.

Width changes how many cards fit on a row and nothing else: one on a phone, two
from `sm`, three from `xl`. Cards keep their status badge even when a single
status is selected, because the filter is at the top of a page that scrolls and
a card has to say what it is without scrolling back up.

Drag is not an interaction here at all; each card has explicit action buttons.
Drag-and-drop on a shared realtime board with six users invites accidents.

This replaced a Kanban board that was three different DOM trees behind a JS
breakpoint — one list on a phone, two columns on a tablet with a pair switch,
four on a desktop. Four columns fit on a desktop and nowhere else, and on the
two smaller layouts the column a card sat in was already not the thing anyone
looked at: the chip row was. Filtering was what staff were doing anyway, so it
became the only mechanism. `useBreakpoint()` is no longer used by the board; the
layout is plain CSS again, as §9 prefers.

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
- There is no `[ รับงาน ]` button any more (0027): accepting an order claims it.
  The primary button is `[ เริ่มทำ ]` in the accepted column and
  `[ เสร็จแล้ว ]` in the cooking column.
- **A transfer order is confirmed, not accepted** (0029). In `รอยืนยัน` its
  primary button reads `ตรวจสลิป / ยืนยันจ่าย` rather than `รับออเดอร์`, because
  since 0028 the slip is already attached and the first real question is whether
  the money arrived. It opens a dialog that shows the slip inline — a decision
  that can be taken without looking at the evidence is one that will be — with
  the confirm button dead for three seconds. Confirming marks the payment paid
  and accepts the order in **one** RPC; the half-done state, paid but still
  pending, looks to everyone who arrives later like a customer who paid and was
  ignored. Rejecting from that dialog goes straight into the reason dialog,
  which is itself the second confirmation and cannot be submitted without a
  reason. Cash orders are unchanged: there is nothing to look at, so they keep
  the plain `รับออเดอร์`.

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
Since the checkout screen takes the slip up front, an order reaching this state
means the customer re-opened the page to replace a slip, or staff keyed the
order in.

A `rejected` or `cancelled` order shows **why** (0029): the label the shop
picked, and — for the device that placed the order — the note staff typed with
it. One word and no explanation is the version of this screen that generates a
phone call.

### Confirm dialogs

Two irreversible actions on the customer side get a `ConfirmDialog`: placing an
order and cancelling one. Its confirm button is dead for three seconds and the
countdown is *in the button's label*, not beside it — a disabled button is
skipped by some screen readers, so a separate countdown would go unread. Backing
out is never delayed; making it slow to leave a dialog is a dark pattern, and
closing changes nothing.

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

Dark values are redefined under `:root[data-theme="dark"]` and nowhere else.
There is deliberately no `@media (prefers-color-scheme: dark)` block — see
**Theme** below.

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

Both surfaces ship light and dark. **Light is the default, on every device.**
Both the customer app and the back office carry a manual toggle whose choice is
stored in `localStorage`. The kitchen works under varying light and the toggle
costs almost nothing once the tokens exist.

First load used to follow the device — `prefers-color-scheme`, no stamp on the
root element, a third `system` state in the provider. It does not any more, and
the change is worth stating rather than leaving as a diff. The shop's first
impression should not depend on a setting the shop cannot see or check, and a
phone in dark mode is usually there from a system-wide schedule rather than a
decision anyone made about this page. Someone who wants dark is still one tap
from it, and the choice is remembered.

Mechanically that means three things, and all three have to hold together:

- The root element is **always stamped**. The pre-paint script in `index.html`
  writes `data-theme="light"` unless `localStorage` holds exactly `'dark'`, so
  nothing is left to a media query on the first paint.
- The provider is **two states, not three**. `system` is gone from
  `ThemeChoice`; a stored `'system'` from an older deploy reads back as light.
- `index.css` carries **no `prefers-color-scheme` block at all**. That query
  would be the one remaining path to a dark first paint nobody asked for — and
  with JavaScript off, the one nothing could correct afterwards.

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

## 9. Responsive system

**Mobile first, and that is an authoring rule, not a slogan.** Base styles
describe the phone. Every larger screen is an additive `sm:` / `md:` / `lg:`
override. `max-*` variants that shrink a desktop design down are not used
anywhere; if a rule needs one, the base was written for the wrong device.

Both audiences need all three sizes. Customers order on phones but check on
laptops. Staff run the shift on phones in the kitchen, on an iPad at the
counter, and on a desktop when the owner does the books.

### Breakpoints

| Name | Width | Device it is really about |
|------|-------|---------------------------|
| base | <640px | Phone, portrait. **The default.** |
| `sm` | ≥640px | Large phone, phone landscape, small tablet portrait |
| `md` | ≥768px | Tablet — iPad portrait |
| `lg` | ≥1024px | Desktop, iPad landscape with a keyboard |

Nothing branches below `sm`. A 320px phone and a 430px phone get the same
layout with a fluid width.

### Rules that apply to every screen

- **Touch targets ≥44px everywhere**, not only in the back office. Buttons are
  `min-h-11`; so is every input, chip and icon button.
- **Inputs are ≥16px.** iOS zooms the whole page when a focused field is
  smaller, and the page never zooms back.
- **Safe areas.** `viewport-fit=cover` on the meta tag, and `pt-safe` /
  `pb-safe` / `pb-tabbar` utilities. The bottom inset is the one that matters:
  without it the admin tab bar sits on the iPhone home indicator, and staff
  mis-tap in a rush.
- **The page never scrolls sideways.** Anything intrinsically wide — the board's
  filter chip row, a report table, a long code — scrolls inside its own
  container.
- **Sticky, not fixed, for headers.** The one fixed element in the whole app is
  the admin tab bar.
- **Text wraps, containers do not.** Long set names, notes and email addresses
  get `break-words`; a card must never be widened by its contents.
- **One thumb.** Anything a phone user taps repeatedly — steppers, claim
  buttons, the primary action — sits in the lower half of the screen.

### Per-screen behaviour

**Customer.** Container widens in steps to `max-w-5xl`; individual screens
narrow further where a single reading column beats spreading out.

| Screen | Phone | Tablet | Desktop |
|--------|-------|--------|---------|
| Shell | Sticky header: wordmark + menu button carrying the cart count. Side drawer holds menu, cart, my orders, theme | Same | Same — the drawer does not become a rail |
| Landing | Hero stacked, buttons full width, steps 1 per row | Buttons side by side, steps 3 per row | Same, larger hero type |
| Menu | 1 set card per row, full-bleed photo | 2 per row | 3 per row |
| Set builder | 2 filling cards per row, sticky quota header, sticky total bar above the safe area | 3 per row, quota header still sticky | 4 per row, quota header and summary in a right-hand rail |
| Cart | Stacked rows, quantity stepper right-aligned | Same, wider | Same, capped width |
| Checkout | One column, one section per card, sticky total + submit bar | One column, wider cards | Two columns — form left, order summary sticky right |
| Slip upload | Full-width camera/file button, QR fills the width | Centred, capped | Centred, capped |
| Tracking | Vertical stepper full width, code centred and large | Same, capped `max-w-xl` | Same, capped |
| My orders | Stacked cards | 2 per row | 2 per row, capped |

**Back office.**

| Screen | Phone | Tablet | Desktop |
|--------|-------|--------|---------|
| Shell | Sticky header + **fixed bottom tab bar**: `บอร์ด`, `คีย์ออเดอร์`, `สต็อก`, `เพิ่มเติม` | Same tab bar, wider content | No tab bar; every link inline in the header |
| Board | Sticky filter chips, 1 card per row | Same chips, 2 per row | Same chips, 3 per row |
| Order detail | Full-screen, actions in a sticky bottom bar | Full-screen, wider | Two columns — ticket left, actions and history right |
| Key in an order | One field per row, one section at a time | Two fields per row | Two columns |
| Stock | One filling per row, stepper right-aligned, ≥44px | 2 per row | Table |
| Settings / staff / menu admin | Stacked cards, one field per row | 2 per row | Table with inline edit |
| Reports | Stacked figure cards, charts full width and scrollable | 2 per row | Grid |

### The tab bar

Seven back-office links do not fit a phone. The three a cook touches during a
shift — board, key in an order, stock — get a thumb-reachable tab each; the
owner's four sit behind one `เพิ่มเติม` sheet. The sheet also carries sign-out,
so it is shown even to a plain admin whose sheet would otherwise be empty —
otherwise there is no way to sign out of a phone at all.

Above `lg` the bar disappears and the links move inline into the header, where a
mouse is already travelling and vertical space is worth more than reach.

### Testing floor

Before a screen is considered done it is checked at **360×640** (small Android),
**390×844** (iPhone), **768×1024** (iPad portrait) and **1440×900**, in light
and dark, with the phone width also checked in landscape. A screen that has only
ever been seen in a desktop browser window is not finished.
