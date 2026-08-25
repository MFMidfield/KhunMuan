# 01 · Data model

All tables live in the `public` schema unless noted. Every table has
`created_at timestamptz not null default now()`; mutable tables also carry
`updated_at` maintained by a trigger.

## 1. Entity map

```
shop_settings (singleton)
admin_users ──────────────┐
                          │ claimed_by / actor
pickup_points ──┐         │
pickup_slots ───┤         │
delivery_zones ─┤         │
                ▼         ▼
              orders ──< order_items ──< order_item_fillings >── fillings
                 │            │                                     │
                 │            └──< order_item_addons >── addons      │
                 │                                                   │
                 ├──< order_events (audit trail)          filling_stock_daily
                 └──< payments (slip, method, state)
sets ──────────────────────< order_items
```

## 2. Configuration

### `shop_settings` — one row, id fixed to `1`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `int` PK, check `= 1` | Singleton guard |
| `is_open` | `boolean` not null default false | The manual open/close switch |
| `closed_message` | `text` | Shown to customers when closed |
| `delivery_enabled` | `boolean` not null default true | |
| `require_code_on_handover` | `boolean` not null default true | Q14 — `advance_order` demands the order code for `ready → handed_over` |
| `order_code_alphabet` | `text` not null default `'ABCDEFGHJKMNPQRSTUVWXYZ23456789'` | Superadmin-configurable "range" |
| `order_code_length` | `int` not null default 4 | |
| `line_notify_enabled` | `boolean` not null default false | |
| `updated_by` | `uuid` → `admin_users.id` | |

The default alphabet deliberately drops `I`, `L`, `O`, `0`, `1` — characters
people misread and mistype when a code is read aloud across a noisy counter.
31 characters over 4 positions gives **923,521** codes. If the superadmin wants
the full `A–Z0–9` set, that is 36⁴ = **1,679,616**. Both are far more than this
shop will ever consume; see doc 03 for why the size still matters.

### `admin_users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `email` | `text` unique not null, check `= lower(email)` | Matched against the Google OAuth JWT email |
| `display_name` | `text` not null | Shown on claimed order cards |
| `role` | `admin_role` not null default `'admin'` | enum: `superadmin`, `admin` |
| `is_active` | `boolean` not null default true | Soft disable instead of delete |
| `auth_user_id` | `uuid` → `auth.users.id`, nullable | Linked on first successful sign-in |
| `invited_by` | `uuid` → `admin_users.id` | |

**Email is `text`, lower-cased on write — not `citext`.** This looks like a
downgrade and is not. Every security-relevant function in this database runs
with `search_path = ''`, which is what makes a `SECURITY DEFINER` function safe.
citext's `=` operator lives in the `extensions` schema, so with an empty
`search_path` Postgres cannot see it, silently falls back to `text = text`, and
the comparison becomes **case-sensitive without raising anything**. A staff
member whose allow-list address was typed with one capital letter would never be
recognised, and the failure looks exactly like "the allow-list is broken".

A `before insert or update` trigger lower-cases and trims the address instead, so
`"  Somchai@Gmail.com "` and `somchai@gmail.com` cannot become two rows. GoTrue
already stores `auth.users.email` lower-cased, so both sides match with plain
text equality and no extension in the picture.

**Superadmin rule.** Exactly one row may have `role = 'superadmin'`, enforced by
a partial unique index:

```sql
create unique index admin_users_one_superadmin
  on admin_users ((true)) where role = 'superadmin';
```

That row is seeded by migration and cannot be created, modified or deleted
through the API — RLS blocks any write where `role = 'superadmin'` is involved
on either the old or the new row. Changing the superadmin is a deliberate
database operation, exactly as requested.

### `pickup_points`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `name` | `text` not null | e.g. "หน้าตึก 3" |
| `detail` | `text` | Landmark hint |
| `sort_order` | `int` not null default 0 | |
| `is_active` | `boolean` not null default true | |

### `pickup_slots`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `label` | `text` not null | e.g. "12:00–12:15" |
| `starts_at_local` | `time` not null | Used for ordering and cutoff logic |
| `capacity` | `int` | Null = unlimited. Max orders per slot per day |
| `is_active` | `boolean` not null default true | |

Slots are **templates**, not dated rows. The number of orders already booked for
a given `(slot, service_date)` is computed from `orders`, which avoids
generating and pruning thousands of dated slot rows.

### `delivery_zones`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `name` | `text` not null | e.g. "ทั่วมหาลัย", later "หอใน" / "หอนอก" |
| `fee` | `numeric(10,2)` not null check `>= 0` | |
| `sort_order` | `int` not null default 0 | |
| `is_active` | `boolean` not null default true | |

Seeded with **one** row. The checkout hides the zone selector while exactly one
zone is active, so the customer sees what a flat fee would have looked like; the
selector appears on its own once a second zone is added in the back office. This
is why there is no `shop_settings.delivery_fee` — see doc 06 Q7. The fee is read
from the zone at placement time and snapshotted into `orders.delivery_fee`, so
raising a zone's fee never rewrites yesterday's totals.

## 3. Menu

### `sets`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `name` | `text` not null | e.g. "เซตใหญ่ 10 ชิ้น" |
| `description` | `text` | |
| `piece_quota` | `int` not null check `> 0` | The number of pieces the customer distributes |
| `price` | `numeric(10,2)` not null check `>= 0` | Includes all fillings |
| `image_path` | `text` | Storage object path |
| `sort_order` | `int` not null default 0 | |
| `is_active` | `boolean` not null default true | |
| `daily_limit` | `int` | Null = unlimited. Optional cap on sets sold per day |

### `fillings`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `name` | `text` not null | |
| `description` | `text` | |
| `image_path` | `text` not null | Every filling has a real photo |
| `sort_order` | `int` not null default 0 | |
| `is_active` | `boolean` not null default true | Permanently off the menu |
| `default_daily_qty` | `int` | Seeds tomorrow's stock row |
| `max_per_set` | `int` | Optional guard, e.g. "no more than 6 shrimp in one box" |

Note there is no `price` column. All fillings cost the same and that cost is
inside `sets.price`. If that ever changes, add a nullable `surcharge` column —
the schema is not painted into a corner.

### `filling_stock_daily`

| Column | Type | Notes |
|--------|------|-------|
| `filling_id` | `uuid` → `fillings.id`, PK part | |
| `service_date` | `date`, PK part | Local shop date, not UTC |
| `qty_total` | `int` not null | Set by staff each morning, or copied from `default_daily_qty` |
| `qty_remaining` | `int` not null check `>= 0` | Decremented atomically on order placement |

The `check (qty_remaining >= 0)` constraint is the last line of defence against
overselling; the row lock in `place_order` is the first. Both are load-bearing.

### `addons`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `kind` | `addon_group` not null | enum: `sauce`, `utensil`, `packaging` |
| `name` | `text` not null | |
| `price` | `numeric(10,2)` not null default 0 | 0 = free, per the "depends on the item" answer |
| `max_qty` | `int` not null default 5 | Per set |
| `is_active` | `boolean` not null default true | |
| `sort_order` | `int` not null default 0 | |

The column is `kind`, not `group`: `GROUP` is a reserved word in SQL and would
have to be double-quoted at every use site forever.

## 4. Orders

### `orders`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK default `gen_random_uuid()` | Internal key, never shown |
| `code` | `text` unique not null, check `^[A-Z0-9]{3,12}$` | The customer-facing code, see doc 03 |
| `code_seq` | `bigint` unique not null | The counter the code was derived from |
| `service_date` | `date` not null | Shop-local business date |
| `status` | `order_status` not null default `'pending_confirmation'` | enum, see doc 02 |
| `fulfillment` | `fulfillment_type` not null | enum: `pickup`, `delivery` |
| `pickup_point_id` | `uuid` → `pickup_points.id` | Required when `fulfillment = 'pickup'` |
| `pickup_slot_id` | `uuid` → `pickup_slots.id` | Required when `fulfillment = 'pickup'` |
| `delivery_zone_id` | `uuid` → `delivery_zones.id` | Required when `fulfillment = 'delivery'` |
| `delivery_location` | `text` | Required when `fulfillment = 'delivery'` |
| `customer_name` | `text` | Required for delivery |
| `customer_room` | `text` | Required for delivery |
| `customer_phone` | `text` | Required for delivery |
| `note` | `text` | Order-level note |
| `subtotal` | `numeric(10,2)` not null | Sum of item totals |
| `delivery_fee` | `numeric(10,2)` not null default 0 | Snapshot at order time |
| `total` | `numeric(10,2)` not null | `subtotal + delivery_fee` |
| `claimed_by` | `uuid` → `admin_users.id` | Who is cooking it |
| `claimed_at` | `timestamptz` | |
| `created_by_admin` | `uuid` → `admin_users.id` | Set when staff key in a phone order |
| `source` | `order_source` not null default `'web'` | enum: `web`, `admin` |
| `cancelled_reason` | `text` | |
| `version` | `int` not null default 0 | Optimistic concurrency token |

A `check` constraint enforces the conditional-required columns:

```sql
constraint orders_fulfillment_fields check (
  (fulfillment = 'pickup'
     and pickup_point_id is not null and pickup_slot_id is not null)
  or
  (fulfillment = 'delivery'
     and delivery_zone_id is not null and delivery_location is not null
     and customer_name is not null and customer_phone is not null)
)
```

`code` is `text`, not `char(4)`. `order_code_length` is superadmin-configurable,
and a fixed-width column would contradict that the moment the length changed;
`char(n)` also pads with trailing spaces, which turns every comparison into a
small trap. The length is bounded by a check constraint instead.

Prices are **snapshotted** onto the order, never joined live from `sets`. When
the superadmin raises a price next month, last week's revenue must not change.

### `order_items`

One row per configured set in the cart.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `order_id` | `uuid` → `orders.id` on delete cascade | |
| `set_id` | `uuid` → `sets.id` | Reference only; display uses the snapshot |
| `set_name` | `text` not null | Snapshot |
| `piece_quota` | `int` not null | Snapshot |
| `unit_price` | `numeric(10,2)` not null | Snapshot |
| `quantity` | `int` not null default 1 check `> 0` | Identical boxes collapse into one row |
| `line_total` | `numeric(10,2)` not null | `(unit_price + addon total) * quantity` |
| `note` | `text` | Per-box note |
| `sort_order` | `int` not null | Stable display order |

### `order_item_fillings`

| Column | Type | Notes |
|--------|------|-------|
| `order_item_id` | `uuid` → `order_items.id` on delete cascade, PK part | |
| `filling_id` | `uuid` → `fillings.id`, PK part | |
| `filling_name` | `text` not null | Snapshot — the kitchen ticket must survive a rename |
| `qty` | `int` not null check `> 0` | Number of pieces of this filling |

Invariant, validated inside `place_order` and re-checked by a deferred trigger:

```
sum(order_item_fillings.qty) == order_items.piece_quota   -- per item
```

### `order_item_addons`

| Column | Type | Notes |
|--------|------|-------|
| `order_item_id` | `uuid` PK part | |
| `addon_id` | `uuid` PK part | |
| `addon_name` | `text` not null | Snapshot |
| `unit_price` | `numeric(10,2)` not null | Snapshot |
| `qty` | `int` not null check `> 0` | |

### `payments`

One row per order. Split out so payment history is auditable and the orders
table stays readable.

| Column | Type | Notes |
|--------|------|-------|
| `order_id` | `uuid` PK → `orders.id` | |
| `method` | `payment_method` not null | enum: `cash`, `transfer` |
| `state` | `payment_state` not null default `'unpaid'` | enum: `unpaid`, `slip_uploaded`, `paid`, `refunded` |
| `slip_path` | `text` | Storage object path |
| `slip_uploaded_at` | `timestamptz` | |
| `confirmed_by` | `uuid` → `admin_users.id` | |
| `confirmed_at` | `timestamptz` | |
| `amount` | `numeric(10,2)` not null | |
| `note` | `text` | e.g. "จ่ายสด 500 ทอน 120" |

`method = 'cash'` starts at `unpaid` and is flipped to `paid` at handover.
`method = 'transfer'` goes `unpaid → slip_uploaded → paid`. This directly
answers failure mode #4: payment state is a column, not a memory.

### `order_events`

Append-only audit log. Every status change, claim, payment confirmation, edit
and cancellation writes one row.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigserial` PK | |
| `order_id` | `uuid` → `orders.id` on delete cascade | |
| `type` | `text` not null | `created`, `accepted`, `claimed`, `status_changed`, `payment_confirmed`, `edited`, `cancelled` |
| `from_status` / `to_status` | `order_status` | Nullable |
| `actor_admin_id` | `uuid` → `admin_users.id` | Null when the customer acted |
| `actor_label` | `text` not null | `'customer'` or the admin display name, snapshotted |
| `payload` | `jsonb` | Diff for edits |
| `created_at` | `timestamptz` not null default now() | |

This log is what lets the superadmin answer "who cancelled this and when", and
it is the raw material for the average-time-per-stage report.

## 5. Enums

```sql
create type admin_role      as enum ('superadmin','admin');
create type order_status    as enum ('pending_confirmation','accepted','cooking',
                                     'ready','handed_over','cancelled','rejected');
create type fulfillment_type as enum ('pickup','delivery');
create type order_source    as enum ('web','admin');
create type payment_method  as enum ('cash','transfer');
create type payment_state   as enum ('unpaid','slip_uploaded','paid','refunded');
create type addon_group     as enum ('sauce','utensil','packaging');
```

## 6. Indexes worth having on day one

```sql
create index on orders (service_date, status);         -- the board query
create index on orders (status) where status in
  ('pending_confirmation','accepted','cooking','ready'); -- active board, partial
create index on orders (created_at desc);
create unique index on orders (code);
create index on order_items (order_id);
create index on order_item_fillings (order_item_id);
create index on order_events (order_id, created_at desc);
create index on filling_stock_daily (service_date);
```

The partial index on active statuses matters more than it looks: the back-office
board polls/subscribes constantly and should never scan the full history.

## 7. Service date

"Today" is a shop concept, not a UTC concept. A helper keeps it in one place:

```sql
create or replace function shop_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Bangkok')::date
$$;
```

Every default, every report grouping and every stock lookup goes through it.
If the shop ever sells past midnight, this is the single function to change.
