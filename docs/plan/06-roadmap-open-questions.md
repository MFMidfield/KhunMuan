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
- Order board: Kanban on desktop, two columns on tablet, list on mobile
- Claim / release, guarded transitions, age timers, sound and highlight
- Payment confirmation, slip viewing
- Manual order entry
- Open/close switch, daily stock screen
- **Menu, settings and staff management** — promoted from Phase 4 when Q4–Q13
  became configuration rather than answers
- **Exit:** a full shift can be run on the app with paper as backup only

### Phase 3 — Operations hardening
- Rate limiting and the `track` Edge Function
- Slip upload via signed URLs, retention job
- LINE OA outbox + `line-notify`
- Daily rollover job
- **Exit:** paper backup retired

### Phase 4 — Reporting and polish
- Daily sales, per-filling popularity, stage timing
- ~~Menu management UI~~ and ~~staff management UI~~ — moved to Phase 2
- Image cropping on upload, and the resize-to-WebP Edge Function
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

### The shape of Q4–Q13 changed

**These are no longer questions.** They were framed as lists the shop had to
hand over before the corresponding phase could start — the sets, the fillings,
the sauces, the delivery fee, the pickup points, the slots, the staff. Every one
of them is a thing that *changes*: a filling comes off the menu, a price goes
up, a slot moves half an hour, someone joins in October. Data that changes does
not belong in a migration that needs a developer, and answering them once would
only have deferred the problem to the first time an answer went stale.

So they become **back-office screens** instead. The tables already existed and
already carried superadmin-only write policies from migration 0009; what was
missing was the UI and, for three of them, the fact that they were rules rather
than rows. Migration 0016 adds those three and the storage the photos need.

The cost is honest and worth stating: the menu-management and staff screens were
Phase 4 work, and this promotes them into Phase 2. In exchange, nothing is
blocked on an email any more.

`seed.sql` stays a `[DEV]` fixture for local development and always will be.

### Blocking Phase 1

**Q4 — The actual sets.** **RESOLVED as configuration** — `/admin/menu`.

**Q5 — The actual fillings.** **RESOLVED as configuration** — `/admin/menu`,
including the per-filling `max_per_set` cap and the daily default quantity.

**Q6 — Sauces and utensils.** **RESOLVED as configuration** — `/admin/menu`,
with the price and the per-set maximum on each one.

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

The zone name and the fee are entered in `/admin/settings`, not seeded.

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

**Q10 — Minimum order.** **RESOLVED as configuration** — `shop_settings.min_order_total`
and `shop_settings.max_boxes_per_order`, both nullable, both null meaning no
limit, both enforced inside `place_order`. The minimum is compared against the
food subtotal rather than the total: a delivery fee dragging a small order over
the line would be a minimum in name only.

### Blocking Phase 2

**Q11 — Pickup points.** **RESOLVED as configuration** — `/admin/settings`.

**Q12 — Pickup slots.** **RESOLVED as configuration** — `/admin/settings`, with
`capacity` and `cutoff_minutes` on each slot. Null cutoff means no automatic
cutoff at all, which is deliberately not the same as zero: zero closes the slot
exactly at its start time, null leaves it open until staff switch it off.

**Staff are exempt from the cutoff.** Someone phoning at 11:58 for the 12:00
slot is a conversation the shop has already agreed to, and refusing it would
only send the order back onto paper.

**Q13 — Staff emails.** **RESOLVED as configuration** — `/admin/staff`. The
superadmin row still comes from migration 0008 and still cannot be created or
changed through the API; everyone else is added and removed on that screen.

**Q13b — Shop contact channels.** **RESOLVED as configuration** —
`shop_settings.contact_phone`, `contact_email` and `contact_instagram`, added in
migration 0025 and edited on `/admin/settings`. The landing page at `/` leads
with them, and a channel the shop leaves blank renders as nothing rather than as
an empty row, so a shop with no Instagram simply has no Instagram line.

The three carry format checks in the database because the page turns each one
into a link. A value that cannot become a working link is worse than a missing
one: a customer taps it, nothing happens, and they conclude the shop is shut.
The Instagram handle is stored bare — no leading `@`, which the URL cannot carry
anyway — and the admin field strips a typed one rather than refusing it.

**Q14 — Handover confirmation.** **RESOLVED** — make it a switch, not a fixed
rule: `shop_settings.require_code_on_handover`, **default `true`**. With it on,
`advance_order` refuses the `ready → handed_over` transition unless the caller
passes the order's own code, and the board shows a small code field on the
handover button. With it off, one tap finishes the order.

Default `true` because failure mode #3 (wrong handover) is one of the four the
whole system exists to remove; the shop can turn it off after a shift if the
seconds cost more than the mistakes. The check lives inside `advance_order`, so
turning it off cannot be faked from the client either way.

The switch shipped without a control: it existed in the column and in
`advance_order` from the start, but nothing in the back office could move it, so
"we do not want to type the code" had no answer short of a hand-written
`update`. It is now in `/admin/settings` → กติกา, superadmin-only — turning off
the one check that the person collecting the box is the person who ordered it is
a shop decision, not a shift decision.

**Q15 — Rejection reasons.** A free-text field, or a fixed list ("ของหมด",
"คิวเต็ม", "ปิดร้านแล้ว")? A fixed list makes the report useful.

### Blocking Phase 3

**Q16 — LINE OA.** Does the shop already have an Official Account? A Messaging
API channel? Is the target a group chat the bot has been invited to, or
individual pushes to each staff member?

**Q17 — PromptPay QR.** **RESOLVED** — one static image, uploaded in the back
office and stored at `shop_settings.promptpay_qr_path` in the public `menu`
bucket. Per-order generation was offered and declined: one image the shop can
see and check beats a generator that has to stay correct, and the exact amount
is already on the tracking page beside it.

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
