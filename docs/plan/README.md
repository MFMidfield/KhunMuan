# KhunMuan — System Plan

Draft v0.1 · 2026-08-21

Ordering web app for a custom suki-roll shop operating inside a university campus.
Customers build sets from a free-choice filling quota, pay cash or bank transfer,
and follow their order status live. Staff run the kitchen from a shared back-office
board that prevents duplicated and dropped orders.

## Documents

| # | File | Contents |
|---|------|----------|
| 00 | [overview.md](./00-overview.md) | Goals, users, scope, non-goals, tech stack |
| 01 | [data-model.md](./01-data-model.md) | Tables, relationships, constraints, seed data |
| 02 | [order-lifecycle.md](./02-order-lifecycle.md) | State machine, claiming, stock, cancellation |
| 03 | [order-code.md](./03-order-code.md) | 4-character code generation and its security model |
| 04 | [frontend.md](./04-frontend.md) | Routes, screens, component tree, design tokens |
| 05 | [backend-security.md](./05-backend-security.md) | Auth, RLS, realtime, storage, edge functions |
| 06 | [roadmap-open-questions.md](./06-roadmap-open-questions.md) | Build phases and what is still undecided |
| 07 | [build-plan.md](./07-build-plan.md) | The working checklist: files, order, exit tests |

## Status of this draft

Requirements were gathered in a structured interview. Everything marked
**DECIDED** below came from that interview. Everything in document 06 is still
open and must be answered before the corresponding phase starts.

### Decided so far

- Real shop, real usage. No hard deadline.
- Single product line: suki rolls, sold as sets.
- A set is a **piece quota**: buy a 10-piece set, choose the filling of each of
  the 10 pieces independently. All fillings cost the same; the price lives on
  the set.
- Add-ons beyond fillings: dipping sauces (type + quantity), eating utensils /
  packaging, and a free-text note. Whether each add-on costs extra is
  configured per add-on in the back office.
- Cart: one order may contain several sets, paid together.
- Two fulfillment modes: **pickup** at a shop-defined meeting point with a
  shop-defined time slot, or **delivery** where the customer names their own
  location and pays a fee. The fee comes from a `delivery_zones` table seeded
  with one row; the checkout hides the zone selector while only one zone is
  active, so per-zone pricing later costs a back-office row, not a migration.
- Identity: every customer gives a **name** — it is what the counter calls out
  when a box is ready, and a pickup order used to carry nothing but a code
  (0034). Room/class and phone are required for delivery and optional for
  pickup. No customer login at all.
- Order identity: a single 4-character code, globally unique forever, alphabet
  `A–Z 2–9` minus `I L O 0 1`, and **every code mixes letters and digits** —
  which makes all-letter profanity, repeated characters and all-digit unlucky
  numbers structurally impossible. 639,584 usable codes. Alphabet, length and
  blocklist are superadmin-configurable. The code is both the label and the
  tracking key; there is no token in the link.
- Code lookup is rate limited hard: 5 per minute per IP, three misses triggers a
  15-minute block. Signed-in staff are exempt, and so is the device that placed
  the order — it holds the `client_token`, so it is enumerating nothing (0035).
  **Any admin** sees the blocked list at `/admin/blocked` and can unblock.
  Code-only lookups never reveal a customer's name, room or phone.
- Payment: cash on handover, or bank/PromptPay transfer where the customer
  uploads a slip and an admin confirms it manually. The slip is taken at
  checkout, before the order is placed, and a public transfer order without one
  is refused by `place_order` (0028).
- Status flow: `pending_confirmation → accepted → cooking → ready → handed_over`.
- Customers may cancel only before the shop accepts.
- Handover may require the customer's code to be read back before staff can mark
  `handed_over` — `shop_settings.require_code_on_handover`, default on, enforced
  inside `advance_order`.
- The shop is **คุณม้วน** in the interface, **khunmuan** in Latin.
- `/` is a **landing page**, not the menu: open/closed, what the shop sells, the
  order button (twice), the shop's phone, email and Instagram, and a small staff
  entrance in the footer. The menu moved to `/menu`. The three contact channels
  live in `shop_settings` and are edited in the back office; a blank one is
  simply not shown. See doc 04 §1.
- Customer tracking page updates live (Supabase Realtime). No push, no SMS.
- Back office: Google OAuth, allow-listed emails only. Two roles: `superadmin`
  (one hard-locked email, editable only in the DB) and `admin`.
- Six staff work concurrently on a mix of phones and desktops.
- Duplicate/dropped-order prevention: explicit **claim** ("รับงาน") that shows
  who owns each order.
- New-order alerting: in-browser sound, card highlight, and a LINE OA push to
  the staff group.
- Stock: per-filling daily remaining quantity, decremented the moment an order
  is placed successfully.
- Shop open/closed is a manual switch in the back office.
- Every filling has a real photo, uploadable from the back office.
- UI language: Thai first, i18n scaffolding in place for a future English pass.
  Typeface: IBM Plex Sans Thai, with IBM Plex Mono for codes and figures.
- Deployment: Supabase Cloud + Vercel (local Supabase for development).
- Visual identity **locked**: soft gold `#F5D68A` as a fill only, `#B45309` as
  the gold used for text, near-black `#101720` ink, slate-biased neutrals, all
  status colours cool. Primary button is gold with a 1.5px dark outline — the
  same construction the logo uses on its letterforms, and the only way a soft
  yellow control meets the 3:1 non-text contrast rule. 16px card corners, 12px
  buttons, near-hairline shadows, square 1:1 filling photos, logo used whole
  everywhere including the favicon. Light and dark both ship; **light is the
  default on every device**, with a manual toggle on both surfaces. Doc 04 §6
  has why the device preference stopped getting a vote.
- The customer shell is a **side nav**: the header holds the wordmark and the
  button that opens it, and the drawer holds home, the menu link, the cart, my
  orders and the light/dark toggle. The cart count rides the menu button so it is still
  visible with the drawer shut. Same drawer at every width — no permanent rail
  on a desktop. See doc 04 §1.