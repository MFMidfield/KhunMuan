# 05 · Backend & security

## 1. Auth model

| Who | Mechanism |
|-----|-----------|
| Customer | No Supabase session at all. Reads the public menu through the `anon` key; writes only through public RPCs |
| Admin / superadmin | Supabase Auth with the Google provider. The JWT's `email` claim is matched against `admin_users` |

### Why staff authorisation is not a JWT claim

The obvious shortcut is to stamp a `role` custom claim on the JWT. It is
rejected here because a JWT lives for an hour: revoking a staff member's access
would not take effect until their token expired. Instead every policy resolves
the role from `admin_users` at query time, so removing someone is immediate.

```sql
create or replace function private.current_admin()
returns public.admin_users
language sql stable security definer set search_path = '' as $$
  select a.* from public.admin_users a
   where a.email = lower((select auth.jwt()) ->> 'email')
     and a.is_active
   limit 1
$$;

create or replace function public.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select (private.current_admin()).id is not null $$;

create or replace function public.is_superadmin() returns boolean
language sql stable set search_path = '' as $$
  select (private.current_admin()).role = 'superadmin' $$;
```

Three details in there are load-bearing:

- **`private`, not `public`.** `current_admin()` bypasses RLS by design, so it
  is not exposed through the Data API. `EXECUTE` is granted to `authenticated`
  and to nobody else; it can only ever return the caller's own row.
- **`search_path = ''`** on every one of them, which is what stops a
  `SECURITY DEFINER` function from being hijacked by a shadowed table name.
- **`lower(...)`, not a `citext` cast.** With an empty `search_path` the citext
  `=` operator is invisible and the comparison silently degrades to a
  case-sensitive `text = text`. See doc 01 §2.

The lookup is cheap and hits a unique index; if it ever shows up in a profile,
cache it per-transaction rather than moving it into the token.

### First sign-in

Google OAuth succeeds for any Google account — Supabase has no idea who is
staff. The gate is a database trigger on `auth.users`: if the new user's email
is not in `admin_users`, the trigger records nothing and the app's route guard
signs them straight back out with `ไม่มีสิทธิ์เข้าใช้งาน`. Matching rows get
`auth_user_id` linked. Access is granted by adding an email to the allow-list
*first*, which is the correct order.

## 2. RLS policies

RLS is enabled on every table. Nothing is readable or writable by default.

### RLS is only the second gate

This project runs with `auto_expose_new_tables` off, so a table is unreachable
through the Data API until it is `GRANT`ed by name. Every table therefore passes
two independent checks: **GRANT** decides whether the role may touch the table at
all, **RLS** decides which rows.

That distinction is load-bearing, because a policy cannot restrict *columns*.
`for update` covers every column in the row, so an RLS-only rule would still let
any signed-in admin `PATCH` `status`, `total` or `version` straight past
`place_order` and `advance_order` — exactly what the policies below claim to
prevent. The columns a human legitimately corrects on a live ticket are granted
explicitly and nothing else is:

```sql
grant select, delete on orders to authenticated;
grant update (note, cancelled_reason, customer_name, customer_room,
              customer_phone, delivery_location, delivery_zone_id,
              pickup_point_id, pickup_slot_id)
  on orders to authenticated;

-- payments carries the money: read only, state moves through set_payment()
grant select on payments to authenticated;
```

Everything carrying money, ownership or state is reachable only through a
`SECURITY DEFINER` function, which also writes the matching `order_events` row.
This applies to the superadmin too — there is no API path to `orders.status`.

RLS is **not** forced (`force row level security`). The order logic runs in
`SECURITY DEFINER` functions owned by `postgres`, and forcing RLS would subject
those functions to the very policies they exist to enforce correctly.

### Menu tables (`sets`, `fillings`, `addons`, `pickup_points`, `pickup_slots`)

```sql
-- Public can read only what is currently on the menu
create policy menu_public_read on fillings
  for select to anon, authenticated
  using (is_active);

-- Admins read everything including deactivated items
create policy menu_admin_read on fillings
  for select to authenticated using (is_admin());

-- Only the superadmin edits the menu
create policy menu_super_write on fillings
  for all to authenticated
  using (is_superadmin()) with check (is_superadmin());
```

### `filling_stock_daily`

Public `select` for today only — the builder needs to know what has run out.
`update` restricted to admins, and only through `set_stock()` so an audit row is
written.

### `orders` and children

```sql
-- No public select at all. Tracking goes through an RPC.
create policy orders_admin_read on orders
  for select to authenticated using (is_admin());

-- Status/claim changes only via RPC; direct updates are blocked
create policy orders_admin_update on orders
  for update to authenticated
  using (is_admin() and status not in ('handed_over','cancelled','rejected'))
  with check (is_admin());

-- Only the superadmin touches finished orders
create policy orders_super_update_final on orders
  for update to authenticated
  using (is_superadmin()) with check (is_superadmin());

create policy orders_super_delete on orders
  for delete to authenticated using (is_superadmin());
```

Note the asymmetry: a normal admin cannot edit an order once it is
`handed_over`. That is the requested rule and it is also good hygiene — the
sales report is built on those rows.

### `admin_users`

```sql
create policy admins_read on admin_users
  for select to authenticated using (is_admin());

create policy admins_super_write on admin_users
  for all to authenticated
  using (is_superadmin() and role <> 'superadmin')
  with check (is_superadmin() and role <> 'superadmin');
```

The `role <> 'superadmin'` clause on both `using` and `with check` is what makes
the superadmin row untouchable through the API — it cannot be edited, deleted,
or duplicated. Combined with the partial unique index from doc 01, the only way
to change who the superadmin is, is a direct database statement. Exactly as
specified.

### `order_events`

`select` for admins, `insert` for nobody. Rows are written only by
`SECURITY DEFINER` functions. An audit log the application can write to
arbitrarily is not an audit log.

## 3. Public RPCs

| Function | Caller | Purpose |
|----------|--------|---------|
| `place_order(payload jsonb)` | anon | Create an order (doc 02 §3) |
| `lookup_order(code text, token text)` | anon | Tracking view, rate limited |
| `cancel_order(code text, token text)` | anon | Only while `pending_confirmation` |
| `attach_slip(code, token, path)` | anon | Record an uploaded slip |
| `claim_order(id)` / `release_order(id)` | admin | Ownership |
| `advance_order(id, to_status, expected_version)` | admin | Guarded transition |
| `set_payment(id, state, note)` | admin | Payment confirmation |
| `set_stock(filling_id, qty)` | admin | Daily stock |
| `toggle_shop(is_open)` | admin | Open/close |

`advance_order` takes `expected_version` and fails with `STALE_ORDER` if it does
not match. On a six-person realtime board, two people tapping "เสร็จแล้ว" a
second apart is normal, and the second tap must be a no-op with a clear message,
not a silent double-write.

## 4. Rate limiting

`lookup_order` and `cancel_order` are the enumeration surface (doc 03 §8). The
limits below are the strict tier, as chosen.

A `code_lookup_attempts` table records `(ip_hash, code, hit boolean, created_at)`.
Before doing any work the RPC checks:

| Condition | Result |
|-----------|--------|
| More than **5 attempts** from this IP hash in 60 s | `RATE_LIMITED` |
| **3 misses** from this IP hash in 60 s | Blocked for **15 minutes** |
| Global miss rate above threshold | Circuit breaker: `RATE_LIMITED` for everyone, plus an alert on the back-office board |

The client IP is only available to an Edge Function, not to a plain RPC, so
tracking lookups route through `/functions/v1/track`, which hashes the IP with a
server-side salt and passes the hash down. The raw IP is never stored.

Attempt rows older than 24 hours are deleted by a `pg_cron` job.

### Signed-in admins are exempt

`is_admin()` short-circuits the whole check. Staff search from the orders table
directly, where RLS already scopes what they can see, so enumeration is not a
threat model for them. This also means a locked-out customer can always be
helped: they call the shop, and staff look the order up with no limit.

### The blocked list

Blocking by IP hash catches honest typists too, so two things soften it:

1. The rate-limit screen shown to the customer displays the shop's **phone
   number and LINE** so they can just ask.
2. The superadmin gets a **blocked list** screen: IP hash, first and last
   attempt, attempt count, which codes were tried, and a one-tap **unblock**.

`unblock_ip(ip_hash)` is a superadmin-only RPC that deletes the offending
attempt rows. The IP hash is opaque and expires with the log, so this is a way
to undo a false positive, not a way to identify a person.

A repeated-offender alert surfaces on the board when one IP hash trips the block
more than a few times — that pattern is a script, not a typist.

## 5. Storage

Two buckets:

| Bucket | Access | Contents |
|--------|--------|----------|
| `menu` | public read, superadmin write | Set and filling photos |
| `slips` | **private**, no public read | Customer transfer slips |

Slips are the sensitive one. They carry names, partial account numbers and
amounts. Policies:

- Anonymous clients get a **short-lived signed upload URL** from an Edge
  Function, scoped to a single object path derived from the order id. They cannot
  list the bucket, cannot read any object, and cannot overwrite another order's
  slip.
- Admins read slips through short-lived signed URLs generated per view, never a
  public link.
- Uploads are capped at 5 MB and restricted to `image/jpeg`, `image/png`,
  `image/webp` and `application/pdf` by both the Edge Function and a bucket
  policy.
- A `pg_cron` job deletes slip objects older than 90 days. Keeping payment
  screenshots indefinitely is a liability with no upside.

Menu images are resized to a max edge of 1600px and converted to WebP on upload
by the Edge Function. Filling photos are the heaviest thing on the customer's
first paint and campus wifi is not fast.

## 6. Edge Functions

| Function | Trigger | Job |
|----------|---------|-----|
| `track` | HTTP, public | IP-hashing wrapper for `lookup_order` |
| `slip-upload-url` | HTTP, public | Issue a scoped signed upload URL |
| `line-notify` | Queue drain (`pg_cron`, every 15s) | Push new-order messages to the LINE staff group |
| `daily-rollover` | `pg_cron`, 04:00 Asia/Bangkok | Seed `filling_stock_daily` from `default_daily_qty`; optionally close the shop |

### LINE notification

A trigger on `orders` insert writes to `notification_outbox`. `line-notify`
drains it, calls the LINE Messaging API, and marks rows sent, with retry and a
dead-letter state after 5 failures. The outbox pattern is deliberate: the LINE
API being down must never roll back an order, and a customer must never see an
error because a notification failed.

Message content is deliberately thin — code, set summary, pickup point, total —
and links back to the board. No customer phone numbers in a group chat.

Secrets (`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_GROUP_ID`) live in Supabase Function
secrets, never in the repo.

## 7. Realtime

Publication limited to what the board actually needs:

```sql
alter publication supabase_realtime add table orders, order_items, filling_stock_daily;
```

Realtime respects RLS, so the anonymous customer channel cannot subscribe to
`orders` broadly. Customer tracking instead subscribes to a **broadcast** channel
named after the order id, and the server broadcasts on status change. The
customer's code never becomes a subscription filter that could be brute-forced
over a websocket.

## 8. Environments and secrets

| Env | Supabase | Frontend |
|-----|----------|----------|
| local | `supabase start` (`backend/supabase/`) | `vite dev` |
| preview | Supabase branch DB | Vercel preview per PR |
| prod | Supabase Cloud project | Vercel production |

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` reach the browser.
- The service-role key is used exclusively inside Edge Functions.
- `app.order_code_key` is set per-database and differs between environments.
  Codes are therefore not comparable across environments, which is correct.
- Migrations are the only way schema changes reach production —
  `supabase db push` in CI, never a dashboard edit.

## 9. Backups and recovery

Supabase Cloud daily backups plus a `pg_dump` to object storage before every
production migration. The recovery drill worth actually rehearsing once: restore
yesterday's dump into a scratch project and confirm the order board renders. An
untested backup is a rumour.
