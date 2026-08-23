# 07 · Build plan

Doc 06 says *what* each phase contains and *why* it comes when it does. This
document is the working checklist: the concrete files, in order, with the exit
test that closes each phase. Tick items here as they land.

Nothing in this document overrides docs 00–06. Where it disagrees with them,
they win and this file is wrong.

## 0. Where the repository actually stands

Phase 0 is **complete**. See §Phase 0 below for what each step produced and what
was verified.

| | State |
|---|---|
| Version control | `main`, remote `github.com/MFMidfield/KhunMuan` |
| `backend/supabase/` | migrations 0001–0009, `db reset` clean from empty |
| `frontend/` | Tailwind v4 + router + Query + i18n + tokens + auth guard; `npm run build` clean |
| `docs/PROJECT_MAP.md` | written |

## 1. What is still outstanding

Q4–Q7 and Q10–Q13 used to live here as data the shop had to hand over. They are
gone: they became back-office screens, and the owner enters them. Doc 06 records
why and what it cost.

| Ref | Outstanding | Blocks |
|-----|-------------|--------|
| Q1 | Logo as SVG/AI/PSD or the designer's real hex; a transparent-background version; a 512px square for the PWA icon | Nothing today. Phase 4 PWA |
| Q9b | Blocklist — the specific mixed letter+digit patterns to exclude beyond the seeded `*666` suffix | Nothing. Superadmin-editable, and the mixed-character rule already makes the ugly cases unreachable |
| Q16 | LINE OA — is there an account? A Messaging API channel? Group push or per-person? | Phase 3 |
| Q18 | Slip retention period (90 days proposed) | Phase 3 |
| Q19 | Report periods beyond daily; CSV/Excel export | Phase 4 |
| Q20 | Per-set cost, for profit rather than revenue | Phase 4 |

Two things are outstanding that are not questions:

- **Nobody has looked at any screen.** There is no browser driver in the
  environment these were built in. Every route responds, every module
  transforms, the types and the lint and the build are clean, and not one pixel
  has been seen. The four widths in doc 04 §9 are the gate.
- **The superadmin address in `0008`** is real now, but the migration is still
  the only way to set it. That is by design (doc 03) and worth re-reading before
  the first cloud deploy.

## 2. Decisions settled since doc 06 was written

- **Shop name** — the interface says **คุณม้วน**; Latin spelling **khunmuan**.
- **Delivery fee** — `delivery_zones` table seeded with one row; the checkout
  hides the selector while only one zone is active. `shop_settings.delivery_fee`
  is gone. Doc 01 §2, doc 06 Q7.
- **Handover** — `shop_settings.require_code_on_handover`, default `true`;
  enforced inside `advance_order`, not in the UI. Doc 06 Q14.
- **Superadmin email** — placeholder in the migration until the owner supplies
  the real one. Doc 06 Q2.

## Phase 0 — Foundations ✅

### 0.1 Repository

- [x] Root `.gitignore` covering `node_modules/`, `.DS_Store`, `dist/`, every
      `.env*` except `.env.example`, and the Supabase local state directories
- [x] `.DS_Store` untracked (`git rm --cached`); `backend/supabase/.env`
      confirmed never tracked
- [x] Repo already existed on `main` with a GitHub remote — no `git init` needed

### 0.2 Backend skeleton

- [x] `backend/package.json` pins the Supabase CLI (2.115.0) with
      `start` / `reset` / `types` scripts, so nobody has to install it globally
- [x] `0001_extensions_enums.sql` — `private` schema, the seven enums,
      `private.set_updated_at()`
- [x] `0002_config.sql` — `shop_settings` (incl. `require_code_on_handover`),
      `admin_users` + one-superadmin partial unique index, `shop_today()`,
      `private.current_admin()` / `is_admin()` / `is_superadmin()`, and the
      auth-linking triggers
- [x] `0003_locations.sql` — `pickup_points`, `pickup_slots`, `delivery_zones`
- [x] `0004_menu.sql` — `sets`, `fillings`, `addons`, `filling_stock_daily`
- [x] `0005_orders.sql` — `orders` and children, `payments`, `order_events`,
      `order_code_seq`
- [x] `0006_indexes.sql` — doc 01 §6, plus an index on every foreign key
- [x] `0007_updated_at.sql` — the trigger on all twelve mutable tables
- [x] `0008_seed_superadmin.sql` — the placeholder row, loudly commented
- [x] `supabase db reset` applies all nine cleanly from empty

### 0.3 RLS floor

- [x] `0009_rls.sql` — RLS enabled on all fifteen tables
- [x] Grants written table by table (`auto_expose_new_tables` is off, so a
      missing grant means the table is simply unreachable) and revoked from
      future objects by default
- [x] The superadmin guard: `role <> 'superadmin'` on both `using` and
      `with check`
- [x] Column-scoped `update` grant on `orders`, no `update` at all on
      `payments` — see the correction recorded in doc 05 §2

### 0.4 Frontend skeleton

- [x] Tailwind v4 (Vite plugin), React Router v7 data router, TanStack Query,
      RHF + Zod, i18next
- [x] Scaffold `App.tsx` / `App.css` deleted; `index.css` is the token layer
- [x] Full light and dark token sets from doc 04 §6, exposed to Tailwind through
      `@theme inline` so utilities resolve `var(--…)` at runtime. Tailwind names
      them `gold-fill` and `gold-ink`, so `text-gold-fill` reads as wrong on
      sight
- [x] Theme: device by default (no stamp), manual toggle stamps `data-theme`,
      stored raw in `localStorage` and applied by a pre-paint script so the
      wrong theme never flashes
- [x] IBM Plex Sans Thai + IBM Plex Mono; `.tnum` for codes, prices and timers
- [x] `lib/`: `supabase`, `queryClient` (+ central query keys), `i18n` with the
      Thai dictionary and an English stub, `theme`, `storage` (every
      `localStorage` read wrapped and Zod-validated)
- [x] `components/ui/`: Button (gold fill, ink text, **1.5px ink outline**),
      Card, Input, Spinner, StatusBadge, ThemeToggle
- [x] `app/router.tsx` — every route from doc 04 §1, real screens where they
      exist and typed placeholders elsewhere. No string literal in JSX anywhere,
      placeholders included
- [x] Google sign-in page, `RequireAdmin` guard with a `superadminOnly` variant,
      admin shell with role-filtered navigation
- [x] `npm run types` regenerates `src/types/database.ts`; `npm run build` clean

### 0.6 Responsive system (added after 0.5)

Doc 04 §9. Mobile-first as an authoring rule — base styles are the phone, every
larger screen is an additive `sm:` / `md:` / `lg:`, no `max-*` shrink-downs.

- [x] Breakpoint contract and per-screen behaviour for **all three sizes**,
      written for every screen in the route table, including the Phase 1 and 2
      ones not built yet, so they are built to it rather than retrofitted
- [x] Tablet, which doc 04 never covered: the board now gets 2 Kanban columns
      with a pair switch instead of falling back to the phone list
- [x] Admin shell: fixed bottom tab bar on phone and tablet (board, key in an
      order, stock, more), inline header nav on desktop. The "more" sheet is
      shown even to a plain admin, because it carries sign-out
- [x] `viewport-fit=cover` plus `pt-safe` / `pb-safe` / `pb-tabbar` utilities —
      without them the tab bar sits on the iPhone home indicator
- [x] 16px minimum on every input, so iOS does not zoom the page on focus
- [x] `scroll-strip` / `snap-item` utilities for chip rows; the page body never
      scrolls sideways
- [x] `useBreakpoint()` for the board only — the one case where the layouts are
      different DOM rather than different styling

### 0.5 Exit test

**Verified, at the layer that matters.** The guard is convenience; the database
is the boundary, so the test was run against the API with forged JWTs for four
identities rather than by clicking around:

| Caller | `orders` | `admin_users` | Writes |
|--------|----------|---------------|--------|
| anon | `401` — not granted | `401` | insert refused |
| signed in, not staff | `200 []` — RLS returns nothing | `200 []` | update matches 0 rows |
| staff admin | rows visible | rows visible | cannot demote or delete the superadmin, cannot invite, cannot edit a finished order, cannot forge an `order_events` row |
| superadmin | rows visible | rows visible | can correct a finished order and invite an admin; **cannot** create a second superadmin |

Neither role can `PATCH` `status`, `total`, `version` or payment state at all —
those are RPC-only by grant, not merely by policy.

Two bugs were found and fixed by running this rather than assuming it:

1. `authenticated` had no `usage` on the `private` schema, so `is_admin()` threw
   for everyone. Every policy would have failed closed — safe, but useless.
2. Emails compared case-**sensitively**. `search_path = ''` hides citext's `=`
   operator, so the comparison silently degraded to `text = text` and any
   allow-list address with a capital letter would never have matched. Emails are
   now lower-cased `text`, normalised by trigger. Doc 01 §2 records why.

**Not verified locally:** the Google sign-in round trip. The credentials are in
`backend/supabase/.env` and `config.toml` now redirects to the Vite dev port,
but completing it needs a human at a Google consent screen. Run
`cd backend && npm run start`, `cd frontend && npm run dev`, open
`/admin/login`, and sign in with an address that is in `admin_users`.

## Phase 1 — Menu and ordering

**Blocked on Q4, Q5, Q6, Q7, Q9b, Q10.** The order-code work below is the one
part that can start immediately, and it is also the riskiest, so start there.

### 1.1 Order code ✅

Migration `0010_order_code.sql`, test `supabase/tests/order_code_property.sql`,
run with `npm run test:order-code`.

- [x] `order_code_blocklist` — pattern plus `exact` / `prefix` / `suffix` /
      `contains`, superadmin-only in both directions. Seeded with the `*666`
      suffix rule and **nothing else**: the rest of Q9b is still an open
      question and is not invented here
- [x] Keyed Feistel over `[0, M)` with cycle-walking, then unranking into the
      mixed set — **in that order**. The key is 32 random bytes generated per
      database, so codes are not comparable across environments
- [x] `private.next_order_code()` returning `(seq, code, epoch)`
- [x] `code_epoch` on both `shop_settings` and `orders`, so an alphabet or
      length change leaves history interpretable
- [x] Sizing derived from the configured alphabet, never hard-coded — asserted
      for lengths 4, 5 and 6
- [x] Length bound tightened from 3–12 to 4–6: 3 leaves only 17,112 usable
      codes and 12 overflows the Feistel's integer domain

**Property test results — full domain walk, ~40s:**

```
domain: alphabet=ABCDEFGHJKMNPQRSTUVWXYZ23456789 letters=23 digits=8 length=4
        M=639584 half_bits=10
ok · 639584 inputs produced 639584 distinct codes, zero collisions
ok · every code contains at least one letter and one digit
ok · every code is 4 characters
ok · no code uses I, L, O, 0, 1 or anything else off-alphabet
ok · FUCK, 6666 and AAAA are unreachable
ok · average cycle-walk iterations: 1.639
ok · length 4 → M=639584 half_bits=10
ok · length 5 → M=22160040 half_bits=13
ok · length 6 → M=739205648 half_bits=15
ok · 20000 length-5 codes sampled, all distinct and correctly shaped
ok · blocked code skipped; the sequence advances rather than redrawing
ok · the seeded *666 suffix rule matches suffixes and nothing else
```

`M`, `half_bits` and the 1.639 walk average match doc 03 §4 exactly.

Two defects in the doc 03 §5 sketch were found in the process, both fixed in the
migration and worth knowing about before reading the sketch again:

1. `hmac(text, bytea, text)` does not exist. pgcrypto offers
   `hmac(text,text,text)` and `hmac(bytea,bytea,text)`; mixing them selects
   neither overload. The data argument goes through `convert_to(…, 'UTF8')`.
2. `for pat in 1 .. n loop` declares its **own** loop variable, shadowing the
   one in `declare`. The pattern index was therefore NULL by the time the
   mixed-radix decomposition needed it. The loop is hand-rolled instead.

### 1.2 Ordering — backend done, frontend next

Migration `0011_place_order.sql`, tests `backend/tests/place_order.test.mjs`,
run with `npm run test:orders`.

- [x] `place_order` (`SECURITY DEFINER`): validates the cart, recomputes every
      price server-side, locks `filling_stock_daily` in `filling_id` order,
      decrements, enforces `sum(fillings.qty) = piece_quota` per item, snapshots
      names and prices, resolves the zone fee, allocates the code, writes
      `order_events.created`, and honours an idempotency key
- [x] `cancel_order(code, client_token)` — only while `pending_confirmation`,
      restores stock through `private.restore_stock`, and answers identically
      whether the code or the token was wrong so a prober learns nothing
- [x] `orders.client_request_id` (unique) and `orders.client_token`, returned
      once by the RPC and never selectable
- [x] `sets.daily_limit` and `pickup_slots.capacity` actually enforced — both
      columns existed and neither did anything
- [x] `lookup_order(code, client_token)` — two views from one function. With the
      token: everything. With the code alone: status, contents, pickup point,
      slot and total, and **never** the name, room, phone or delivery address.
      24-hour expiry after the order stops being in flight
- [ ] `seed.sql` holds a **[DEV] fixture, not shop data**. Q4–Q7 and Q11–Q12 are
      still open, and the prefix is what will make the replacement obvious
- [x] Menu screen — 1 card per row on a phone, 2 on a tablet, 3 on a desktop,
      shop-closed banner, cart badge in the header
- [x] Set builder (doc 04 §2): sticky quota header with a progress bar, chosen
      fillings as a tappable chip row, 2/3/4 filling cards per row, sauces and
      utensils, note, sticky action bar. Out-of-stock fillings are **dimmed and
      labelled `หมดวันนี้`, never hidden**, and every disabled `+` says which of
      the three caps it hit — quota, `max_per_set`, or today's stock
- [x] Cart — quantity steppers, per-line edit that reopens the builder with the
      line loaded, remove, running subtotal
- [x] Checkout — pickup/delivery, contact block only for delivery, payment
      method, server-error codes mapped to Thai sentences that name the chip to
      change, idempotency key generated once per checkout rather than per click
- [x] Checkout hides the zone selector while exactly one zone is active
- [x] Tracking page — the code at 3rem with a copy button, a five-node vertical
      stepper, contents, payment state, and a cancel button that only exists
      while the window is open
- [x] "My orders" from `localStorage`, plus a code lookup box that **rejects**
      `I L O 0 1` with a hint rather than silently correcting them
- [ ] Realtime on the tracking page. It polls every 10s for now; the customer
      channel arrives with the `track` Edge Function in Phase 3, which is also
      where the rate limit that makes a public lookup safe lives
- [ ] Slip upload — needs the `slips` bucket and a signed-upload Edge Function,
      both Phase 3

**Checks that run:**

```
backend  npm run test:orders       35 assertions, all passing
backend  npm run test:order-code   full domain walk, all properties hold
frontend npm run build             clean
```

Plus three project rules verified by grep after every change: no string literal
in JSX, no hard-coded hex outside `index.css`, no `max-*` breakpoint variants.
All 122 literal `t()` keys in the app resolve against `th.ts`.

**Not verified:** rendered output. There is no browser driver attached to this
environment, so the build, the type check, every module's Vite transform and
every route's response were checked, but nobody has looked at the screens. They
need a pass at the four widths in doc 04 §9 before Phase 1 can be called done.

**35 assertions, all passing, exercised over REST as the anonymous client** —
not through psql as a superuser, which would skip the grants and RLS that are
half of what makes the function safe. Covers the happy path, idempotent replay,
a lying `client_total`, add-on and delivery-fee arithmetic, ten validation
rejections, stock decrement and restoration, and case-insensitive cancellation.

The concurrency assertions are the ones worth keeping:

```
12 concurrent orders, 3 in stock → exactly 3 succeed
the losers all get OUT_OF_STOCK, none get a deadlock or a 500
stock lands on exactly zero
every winner got a distinct code
slot capacity 2 holds under 6 concurrent orders
a daily set limit of 2 holds under 5 concurrent orders
```

The last two only pass because of a fix the tests forced: **counting and then
checking is not a limit**. Six simultaneous orders all read "zero taken" and all
six got into a slot with capacity 2. Both caps now take an advisory lock first,
in a fixed global order — slot, then sets, then the stock rows — so no cycle can
form.

### 1.3 Exit test

An order placed on a phone lands in the database with the correct total, correct
snapshots, stock decremented, and a code that survives being read aloud.

## Phase 2 — Back office ✅

**Blocked on Q11, Q12, Q13, Q15.**

- [ ] `claim_order` / release, with `expected_version` on every mutation
- [ ] `advance_order` with guarded transitions; when
      `require_code_on_handover` is true it refuses `ready → handed_over`
      without the order's own code
- [ ] `set_payment` — slip viewing, manual confirmation
- [ ] Order board: Kanban on desktop, list on mobile; age timers, claim owner on
      every card, sound plus highlight on arrival
- [ ] Manual order entry (`source = 'admin'`)
- [ ] Open/close switch, daily stock screen, `set_stock`
- [ ] Rejection reasons per Q15
- [ ] **Exit:** a full shift runs on the app with paper as backup only

## Phase 3 — Operations hardening

**Blocked on Q16, Q17, Q18.**

- [ ] Rate limiting: 5 lookups/min/IP, 15-minute block after three misses,
      signed-in staff exempt, superadmin can see and unblock
- [ ] `track` Edge Function — code-only lookups never return name, room or phone
- [ ] Slip upload via signed URLs; retention job
- [ ] LINE OA outbox table + `line-notify` Edge Function
- [ ] Daily rollover job seeding tomorrow's `filling_stock_daily`
- [ ] **Exit:** paper backup retired

## Phase 4 — Reporting and polish

**Blocked on Q19, Q20, and the logo assets from Q1.**

- [ ] Daily sales, per-filling popularity, per-stage timing from `order_events`
- [ ] Menu management UI with image upload and cropping
- [ ] Staff management UI
- [ ] Empty states, error states, offline banner, PWA install prompt
- [ ] **Exit:** the superadmin stops asking anyone for numbers

## Phase 5 — Later, only if wanted

English translation pass · customer-facing LINE notifications · slip
auto-verification · pre-orders for a future date.

## Next

1. **Phase 1.1 — the order code.** Needs no shop data except the Q9b blocklist,
   and it is the riskiest thing in the build. Start here while Q4–Q7 and Q10 are
   collected from the shop.
2. **Phase 1.2** once the menu data arrives.

One thing worth doing before either: replace the superadmin placeholder in
`0008` with the real address (Q2) and run `npm run reset`, so local development
stops running against an account nobody can sign in as.
