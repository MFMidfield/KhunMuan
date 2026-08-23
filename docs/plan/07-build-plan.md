# 07 · Build plan

Doc 06 says *what* each phase contains and *why* it comes when it does. This
document is the working checklist: the concrete files, in order, with the exit
test that closes each phase. Tick items here as they land.

Nothing in this document overrides docs 00–06. Where it disagrees with them,
they win and this file is wrong.

## 0. Where the repository actually stands

| | State |
|---|---|
| `frontend/` | Vite + React 19 + TS scaffold, untouched `App.tsx`/`App.css` |
| `backend/supabase/` | `config.toml` only — no `migrations/`, no `functions/`, no `seed.sql` |
| Version control | **not initialised** — `git log` reports "not a git repository" |
| `docs/PROJECT_MAP.md` | does not exist yet |

So Phase 0 starts from a genuinely empty backend, and step one is `git init`.

## 1. Data still needed from the shop

These block the phase named beside them. Everything else can proceed without
them. No placeholder values get invented in their place — an unanswered item
means the seed file carries an obvious dummy that is clearly marked, never a
plausible-looking guess.

| Ref | Needed | Blocks |
|-----|--------|--------|
| Q2 | The real superadmin Google address, replacing `SUPERADMIN_EMAIL_PLACEHOLDER@example.com` in the seed migration | Cloud deploy (local dev is fine without it) |
| Q1 | Logo as SVG/AI/PSD or the designer's real hex; transparent-background version; 512px square for the PWA icon | Phase 0 polish, Phase 4 PWA |
| Q4 | The sets — names, piece quotas, prices | Phase 1 |
| Q5 | The fillings — full list, and any needing `max_per_set` | Phase 1 |
| Q6 | Sauces and utensils — full list, which carry a charge, how much | Phase 1 |
| Q7 | Name and fee for the single seeded delivery zone | Phase 1 |
| Q9b | Blocklist seed — the specific mixed letter+digit patterns to exclude | Phase 1 |
| Q10 | Minimum order and per-order quantity cap, if any | Phase 1 |
| Q11 | Real pickup points | Phase 2 |
| Q12 | Real pickup slots, capacities, and how long before a slot ordering closes | Phase 2 |
| Q13 | Initial staff email allow-list | Phase 2 |
| Q15 | Rejection reasons — fixed list or free text | Phase 2 |
| Q16 | LINE OA — existing account? Messaging API channel? group push or per-person? | Phase 3 |
| Q17 | PromptPay QR — static image or generated per order with the amount | Phase 3 |
| Q18 | Slip retention period (90 days proposed) | Phase 3 |
| Q19 | Report periods beyond daily; CSV/Excel export | Phase 4 |
| Q20 | Per-set cost, for profit rather than revenue | Phase 4 |

## 2. Decisions settled since doc 06 was written

- **Shop name** — the interface says **คุณม้วน**; Latin spelling **khunmuan**.
- **Delivery fee** — `delivery_zones` table seeded with one row; the checkout
  hides the selector while only one zone is active. `shop_settings.delivery_fee`
  is gone. Doc 01 §2, doc 06 Q7.
- **Handover** — `shop_settings.require_code_on_handover`, default `true`;
  enforced inside `advance_order`, not in the UI. Doc 06 Q14.
- **Superadmin email** — placeholder in the migration until the owner supplies
  the real one. Doc 06 Q2.

## Phase 0 — Foundations

**Buildable today, start to finish.** Nothing here waits on shop data.

### 0.1 Repository

- [ ] `git init`, `.gitignore` at the root covering `node_modules/`, `.DS_Store`,
      `backend/supabase/.branches/`, `backend/supabase/.temp/`,
      `backend/supabase/.env`, `frontend/.env*`
- [ ] Confirm `backend/supabase/.env` is untracked — it exists on disk already
- [ ] First commit of the plan docs as they stand

### 0.2 Backend skeleton

- [ ] `supabase start` against the existing `config.toml`; record the local
      anon key and API URL
- [ ] `backend/supabase/migrations/0001_enums.sql` — the seven enums from doc 01 §5
- [ ] `0002_config.sql` — `shop_settings` (with `require_code_on_handover`),
      `admin_users` + the one-superadmin partial unique index, `shop_today()`
- [ ] `0003_locations.sql` — `pickup_points`, `pickup_slots`, `delivery_zones`
- [ ] `0004_menu.sql` — `sets`, `fillings`, `addons`, `filling_stock_daily`
- [ ] `0005_orders.sql` — `orders` (incl. `delivery_zone_id`, the fulfillment
      check constraint, `version`), `order_items`, `order_item_fillings`,
      `order_item_addons`, `payments`, `order_events`
- [ ] `0006_indexes.sql` — doc 01 §6 verbatim
- [ ] `0007_updated_at.sql` — the shared `updated_at` trigger, applied to every
      mutable table
- [ ] `0008_seed_superadmin.sql` — one `admin_users` row,
      `SUPERADMIN_EMAIL_PLACEHOLDER@example.com`, with a comment marking it as
      the single line to edit before any cloud deploy
- [ ] `supabase db reset` runs clean from empty

### 0.3 RLS floor

Written now, before any table has data, so nothing is ever briefly public.

- [ ] `0009_rls.sql` — `enable row level security` on **every** table
- [ ] Staff read/write policies keyed on `admin_users` (doc 05 §2)
- [ ] The superadmin guard: reject any write where `role = 'superadmin'` appears
      on either the old or the new row
- [ ] Deny-by-default confirmed — a bare anon client can read nothing yet

### 0.4 Frontend skeleton

- [ ] Tailwind v4, React Router v7 data router, TanStack Query, RHF + Zod
- [ ] Delete the scaffold `App.css`; replace `index.css` with the token layer
- [ ] Design tokens as CSS variables (doc 04 §6): `--gold #F5D68A` **fill only**,
      `--gold-ink #B45309` **text only**, `--ink #101720`, the cool status ramp,
      and their dark-mode swap. No hardcoded hex anywhere but this file.
- [ ] Theme: follow the device on first load, manual toggle, choice persisted
- [ ] IBM Plex Sans Thai + IBM Plex Mono; `tabular-nums` on codes, prices, timers
- [ ] `lib/supabase.ts`, `lib/queryClient.ts`, `lib/i18n.ts` with the Thai
      dictionary — **every** string via `t()`, none inline in JSX
- [ ] `components/ui/`: Button (gold fill + `--ink` text + **1.5px `--ink`
      border**, the border is load-bearing, not decoration), Card (16px radius),
      Input, Badge, Spinner
- [ ] `app/router.tsx` with the route shells from doc 04 §1
- [ ] Google OAuth sign-in, `admin_users` allow-list check, route guard on
      `/admin/*`
- [ ] `npm run supabase:types` script writing `src/types/database.ts`, committed

### 0.5 Exit test

Sign in as the seeded superadmin (using the placeholder address locally) and
land on an empty order board. Sign in with any other Google account and be
refused — refused by RLS, verified by querying directly with that session's
token, not merely hidden by the router.

## Phase 1 — Menu and ordering

**Blocked on Q4, Q5, Q6, Q7, Q9b, Q10.** The order-code work below is the one
part that can start immediately, and it is also the riskiest, so start there.

### 1.1 Order code — do this first

- [ ] `order_code_config` / blocklist storage, superadmin-editable
- [ ] Keyed Feistel over `[0, M)` with cycle-walking, then unranking into the
      mixed letters-and-digits set — **in that order**; swapping the two produces
      collisions, doc 03 §4
- [ ] `next_order_code()` consuming `code_seq`
- [ ] Property test: walk the full domain, assert **639,584** codes, all
      distinct, every one containing at least one letter and at least one digit
- [ ] Blocklist filter applied after unranking, seeded from Q9b

### 1.2 Ordering

- [ ] `seed.sql` — real sets, fillings, addons, the one delivery zone (Q4–Q7)
- [ ] `place_order` (`SECURITY DEFINER`): validate the cart, recompute every
      price server-side, lock `filling_stock_daily` rows, decrement, enforce
      `sum(fillings.qty) = piece_quota` per item, snapshot names and prices,
      resolve the zone fee, allocate the code, write `order_events.created`,
      honour an idempotency key
- [ ] `cancel_order` — customer-side, permitted only while
      `pending_confirmation`
- [ ] Menu screen, set builder (doc 04 §2), cart, checkout
- [ ] Checkout hides the zone selector while exactly one zone is active
- [ ] Tracking page on Realtime, code stored in `localStorage` for "my orders"

### 1.3 Exit test

An order placed on a phone lands in the database with the correct total, correct
snapshots, stock decremented, and a code that survives being read aloud.

## Phase 2 — Back office

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

## Suggested order of the next few sessions

1. Phase 0.1–0.3 — repo, migrations, RLS. Self-contained, no shop data needed.
2. Phase 0.4–0.5 — tokens, UI primitives, auth guard. Ends on a real exit test.
3. Phase 1.1 — the order code and its property test, while Q4–Q6 are collected.
4. Phase 1.2 once the menu data arrives.
