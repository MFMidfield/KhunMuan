# 06 · Roadmap & open questions

## 1. Build phases

There is no deadline, so the ordering optimises for **being usable early** and
for putting the risky parts first.

### Phase 0 — Foundations
- Tailwind v4, router, TanStack Query, i18n scaffolding, Supabase client
- Design tokens (blocked on the logo palette — placeholder until then)
- Migrations for enums, config, menu tables, `admin_users`; seed data
- Google OAuth + `admin_users` allow-list + route guard
- **Exit:** a superadmin can sign in and see an empty board; nobody else can

### Phase 1 — Menu and ordering (customer)
- Menu screen, set builder, cart, checkout
- `place_order` with stock locking, price recomputation, idempotency key
- Order code generation (doc 03), including a property test asserting no
  collisions over a full walk of the domain
- Tracking page with realtime status
- **Exit:** an order placed on a phone appears in the database, correctly priced,
  with stock decremented

### Phase 2 — Back office
- Order board: Kanban on desktop, list on mobile
- Claim / release, guarded transitions, age timers, sound and highlight
- Payment confirmation, slip viewing
- Manual order entry
- Open/close switch, daily stock screen
- **Exit:** a full shift can be run on the app with paper as backup only

### Phase 3 — Operations hardening
- Rate limiting and the `track` Edge Function
- Slip upload via signed URLs, retention job
- LINE OA outbox + `line-notify`
- Daily rollover job
- **Exit:** paper backup retired

### Phase 4 — Reporting and polish
- Daily sales, per-filling popularity, stage timing
- Menu management UI with image upload and cropping
- Staff management UI
- Empty states, error states, offline banner, PWA install prompt
- **Exit:** the superadmin stops asking anyone for numbers

### Phase 5 — Later, only if wanted
- English translation pass
- Customer-facing LINE notifications
- Slip auto-verification
- Pre-orders for a future date

## 2. Open questions — must be answered before the phase that needs them

### Blocking Phase 0

**Q1 — Logo source file.** ~~Palette~~ **RESOLVED** — palette locked, see doc 04
§6. Still outstanding: `#F5D68A` was derived from a yellow sampled by eye off the
supplied JPG. If an SVG, an AI/PSD, or the designer's actual hex exists, send it
and the whole ramp gets recomputed. Also needed: a transparent-background version
for placing the logo on the light ground, and a 512px square for the PWA icon.

**Q2 — Superadmin email.** **PARTIALLY RESOLVED** — the owner will supply the
exact Google account themselves. Until then the seed migration carries the
literal placeholder `SUPERADMIN_EMAIL_PLACEHOLDER@example.com` and a comment
naming it as the one line to edit. Local development works against the
placeholder; **the real address must replace it before the first push to
Supabase Cloud**, because the superadmin row cannot be created through the API
afterwards.

**Q3 — Shop name and domain.** **RESOLVED** — the interface says **คุณม้วน**;
the Latin spelling for the domain and for asset names is **khunmuan**. The
top-level domain is still to be bought and does not block anything.

### Blocking Phase 1

**Q4 — The actual sets.** Names, piece quotas, prices. How many are there?

**Q5 — The actual fillings.** Full list with names. Any that need a
`max_per_set` cap?

**Q6 — Sauces and utensils.** Full list, and which of them carry a charge and
how much.

**Q7 — Delivery fee.** **RESOLVED (shape only)** — build the `delivery_zones`
table from day one and seed it with a **single** zone. The checkout hides the
zone selector whenever exactly one zone is active, so today the customer sees
the same screen a flat fee would have produced: a free-text location field and
one fee. The day the shop wants per-zone pricing, the superadmin adds rows in
the back office and the selector appears by itself — no migration, no code
change, no nullable column bolted onto historical orders.

`shop_settings.delivery_fee` is therefore **removed**; the fee lives on the zone
and is snapshotted onto `orders.delivery_fee` at placement as before. See doc 01
§2 for the table.

Still needed as data, not as a decision: **the zone name and the fee amount** for
that first seeded row.

**Q8 — Order code.** **RESOLVED** — 4 characters, alphabet `A–Z 2–9` minus
`I L O 0 1`, every code must mix letters and digits, 639,584 usable codes. See
doc 03.

**Q9 — Tracking link security.** **RESOLVED** — code-only lookup with strict rate
limiting; the opaque-token-in-link option was considered and declined as less
convenient for customers. Residual risk and the reasoning are recorded in
doc 03 §8 so the trade-off is not lost.

**Q9b — Blocklist seed.** The mixed letter+digit rule already makes all-letter
profanity, repeated characters and all-digit unlucky numbers impossible to
generate (doc 03 §2). What remains is a short list of mixed patterns. Needed: the
specific Thai karaoke spellings and number superstitions the shop wants
excluded — anything beyond an obvious `*666` suffix rule.

**Q10 — Minimum order.** Is there one? Any cap on quantity per order?

### Blocking Phase 2

**Q11 — Pickup points.** The real list, with names people will recognise.

**Q12 — Pickup slots.** The real time slots, and whether each has a capacity.
Also: how long before a slot does ordering for it close?

**Q13 — Staff emails.** The initial admin allow-list.

**Q14 — Handover confirmation.** **RESOLVED** — make it a switch, not a fixed
rule: `shop_settings.require_code_on_handover`, **default `true`**. With it on,
`advance_order` refuses the `ready → handed_over` transition unless the caller
passes the order's own code, and the board shows a small code field on the
handover button. With it off, one tap finishes the order.

Default `true` because failure mode #3 (wrong handover) is one of the four the
whole system exists to remove; the shop can turn it off after a shift if the
seconds cost more than the mistakes. The check lives inside `advance_order`, so
turning it off cannot be faked from the client either way.

**Q15 — Rejection reasons.** A free-text field, or a fixed list ("ของหมด",
"คิวเต็ม", "ปิดร้านแล้ว")? A fixed list makes the report useful.

### Blocking Phase 3

**Q16 — LINE OA.** Does the shop already have an Official Account? A Messaging
API channel? Is the target a group chat the bot has been invited to, or
individual pushes to each staff member?

**Q17 — PromptPay QR.** Static image, or generated per order with the exact
amount encoded? Per-order amounts make slip checking dramatically faster and are
not hard to generate.

**Q18 — Slip retention.** 90 days is proposed. Confirm or change.

### Blocking Phase 4

**Q19 — Report period.** Daily was confirmed. Also weekly and monthly? Export to
CSV/Excel?

**Q20 — Cost tracking.** Is per-set cost known? Without it the report shows
revenue, not profit.

## 3. Decisions deliberately deferred

| Topic | Why deferred |
|-------|--------------|
| Multi-branch | One shop; adding tenancy now costs complexity for a hypothetical |
| Customer accounts | `localStorage` covers "my orders" for the realistic use case |
| Payment gateway | Cash and transfer are what the shop actually takes |
| Native app | A PWA installs to the home screen and updates without a store review |
| Realtime kitchen display on a TV | The board already works on a desktop; revisit if the shop gets a screen |

## 4. Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Code enumeration exposes order contents | Privacy incident | Doc 03 §8 — strict rate limit, 15-min block on 3 misses, names/phones withheld from code-only lookups, 24h expiry. Accepted residual risk |
| Campus wifi drops mid-shift | Board goes stale silently | Connection indicator, refetch on reconnect, paper backup through Phase 2 |
| Six staff racing on one order | Duplicate work | Claiming + `expected_version` + realtime |
| Stock oversell at peak | Angry customer at the counter | Row locks in `place_order` + `check (qty_remaining >= 0)` |
| Supabase free-tier limits | Outage at the worst time | Watch DB size and egress; filling photos are the main driver — resize on upload |
| Photos make first load slow | Abandonment | WebP, responsive `srcset`, lazy loading below the fold |
| Superadmin loses access to their Google account | Locked out of the shop's own system | The superadmin row is DB-editable by design; document the recovery SQL |
