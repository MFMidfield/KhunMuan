# 02 · Order lifecycle

## 1. State machine

```
                    ┌──────────────┐
     customer  ───► │   pending_   │ ──── admin rejects ───► rejected  (terminal)
     places order   │ confirmation │ ──── customer cancels ► cancelled (terminal)
                    └──────┬───────┘
                           │ admin accepts (and thereby claims)
                           ▼
                    ┌──────────────┐
                    │   accepted   │ ──── admin cancels ───► cancelled
                    └──────┬───────┘
                           │ the claimer starts
                           ▼
                    ┌──────────────┐
                    │   cooking    │ ──── admin cancels ───► cancelled
                    └──────┬───────┘
                           │ done
                           ▼
                    ┌──────────────┐
                    │    ready     │
                    └──────┬───────┘
                           │ handed to customer (payment must be `paid`)
                           ▼
                    ┌──────────────┐
                    │ handed_over  │  (terminal)
                    └──────────────┘
```

### Transition table

| From | To | Who | Guard |
|------|----|-----|-------|
| `pending_confirmation` | `accepted` | admin | shop context only; claims the order for the accepter. For a transfer order the board goes through `confirm_payment_and_accept`, which marks the payment paid and calls `advance_order` in the same transaction (0029) |
| `pending_confirmation` | `rejected` | admin | reason required; restores stock |
| `pending_confirmation` | `cancelled` | customer | **only** state where the customer may cancel; restores stock |
| `accepted` | `cooking` | admin | must be the claimer, or claim happens implicitly |
| `accepted` \| `cooking` | `cancelled` | admin | reason required; restores stock |
| `cooking` | `ready` | admin | must be the claimer |
| `ready` | `handed_over` | admin | `payments.state = 'paid'`, or admin explicitly overrides with a note |
| `ready` | `cooking` | admin | correction path — "we need to remake this" |

Everything else is rejected by the RPC. The client never writes `orders.status`
directly; RLS denies `update` on the column.

### Why `pending_confirmation` exists at all

The shop is not always able to take a given order: a filling may be gone, the
slot may be full, the customer may have written something impossible. Having an
explicit acceptance step means the customer's tracking page can honestly say
"waiting for the shop to confirm" instead of implying work has started. It is
also the only window in which the customer can cancel without a conversation,
which is exactly the boundary the owner asked for.

## 2. Claiming — the fix for duplicated and dropped work

`claim_order(order_id)` sets `claimed_by` and `claimed_at` in a single
conditional update:

```sql
update orders
   set claimed_by = current_admin_id(),
       claimed_at = now(),
       version    = version + 1
 where id = p_order_id
   and claimed_by is null;
-- 0 rows affected → someone else got there first
```

The zero-row case is not an error the user should see as a red toast. The UI
re-reads the row and shows "รับไปแล้วโดย <name>" — the honest outcome, not a
failure.

Rules:

- **Accepting an order claims it** (migration 0027). Whoever reads an order and
  decides the shop can make it is the person who then makes it, so there is no
  separate "รับงาน" button and no accepted-but-unclaimed state to explain. The
  claim happens inside `advance_order`, not as a second call the client could
  fail to make.
- Claiming is **required** before moving an order into `cooking`. The "เริ่มทำ"
  button performs claim-and-advance in one RPC when the order is unclaimed,
  which is the path an order takes after being released.
- Any admin can **release** their own claim. The superadmin can force-release
  anyone's — for the case where a phone died mid-shift. A released order goes
  back to unclaimed and the next person to tap "เริ่มทำ" takes it.
- `claim_order` still exists and is still granted; nothing in the board calls it
  now. It is the only path that claims without also moving the order.
- A claim older than 45 minutes on an order still in `accepted` gets a visual
  stale marker on the board. It is not auto-released; a silent auto-release
  would recreate the double-cooking problem it is meant to prevent.
- `claimed_by` renders as an avatar/initials chip on the card, visible to all six
  staff in realtime. This is the whole mechanism: the answer to "is anyone on
  this?" must be readable in under a second, from across the kitchen, on a phone.

## 3. Placing an order — `place_order`

A single `SECURITY DEFINER` function, called by the anonymous client with a JSON
payload. Steps, all inside one transaction:

1. **Shop check.** `shop_settings.is_open` must be true. Otherwise raise
   `SHOP_CLOSED`.
2. **Validate structure** against a Zod-mirrored shape: at least one item, every
   item references an active set, `sum(filling qty) == set.piece_quota`, every
   filling active, every addon active and within `max_qty`, `max_per_set`
   respected.
3. **Validate fulfillment.** For pickup: point and slot active, and the slot's
   remaining capacity for `shop_today()` is > 0. For delivery: name, phone and
   location present, `delivery_enabled` true.
3a. **The slip, for a transfer** (migration 0028). A public caller paying by
   transfer must send a `slip_path`, or the call raises `SLIP_REQUIRED`; the
   order is created with `payments.state = 'slip_uploaded'` rather than
   `unpaid`. Staff keying in a phone order are exempt — they do not have the
   customer's slip in front of them, and refusing would push those orders back
   onto paper. The path must be one `slip-staging-url` issued and nobody has
   claimed, and a file must have arrived at it: see doc 05 §5.
4. **Lock and decrement stock.** For each distinct filling across all items,
   ordered by `filling_id` to give every concurrent transaction the same lock
   order and eliminate deadlocks:

   ```sql
   select qty_remaining from filling_stock_daily
    where filling_id = f and service_date = shop_today()
      for update;
   ```

   If the row is missing, the filling is treated as unlimited for the day only
   if `default_daily_qty is null`; otherwise the row is created from
   `default_daily_qty` on the fly. If `qty_remaining < needed`, raise
   `OUT_OF_STOCK` with the filling name so the UI can point at the exact chip
   the customer must change.
5. **Recompute the price server-side** from the snapshot values it just read.
   The client-sent total is compared and, if it differs, the server value wins
   and the discrepancy is logged. Client arithmetic is a display convenience,
   never an authority.
6. **Allocate the order code** (doc 03) and insert `orders`, `order_items`,
   `order_item_fillings`, `order_item_addons`, `payments`, and a `created`
   row in `order_events`.
7. **Return** `{ code, id, total, status }`.

The function is idempotent-friendly: the client generates a UUID
`client_request_id`, stored with a unique index, so a retry after a dropped
connection returns the existing order instead of creating a twin. Campus wifi
makes this less optional than it sounds.

## 4. Stock restoration

Cancellation and rejection call `restore_stock(order_id)`, which adds the
quantities back to `filling_stock_daily` — but **only** if the order's
`service_date` equals `shop_today()`. Restoring stock to a past day would
corrupt yesterday's numbers for no benefit.

Stock is never restored on `handed_over`. Obviously.

## 5. Customer cancellation

`cancel_order(code, client_token)` succeeds only when:

- the order's status is `pending_confirmation`, and
- the supplied code matches, and
- the request passes rate limiting (doc 05).

Any other state returns `CANCEL_WINDOW_CLOSED`, and the tracking page swaps the
cancel button for a line telling the customer to contact the shop. The button
disappearing on its own, live, the moment staff accept the order, is a small
detail that prevents a lot of confusion.

## 6. Admin-entered orders

Phone orders are entered through the same cart UI inside the back office, with
two differences: `source = 'admin'`, `created_by_admin` set, and the order may
be created directly in `accepted` state. It uses the same `place_order`
function, so stock and pricing behave identically. There is exactly one code
path for creating an order — a second one would drift.

## 7. New-order alerting

Three channels, all triggered by the same insert:

1. **Realtime + sound.** The back-office board subscribes to `orders` inserts.
   On a new row it plays a short chime and animates the card in. Browsers block
   autoplay until the user interacts, so the board shows a one-time "แตะเพื่อเปิด
   เสียง" prompt on mount and stores consent in `localStorage`.
2. **Card highlight.** New cards carry an unacknowledged ring until someone
   opens or claims them. The board title also drives `document.title` — an
   unread count in the tab label is free and works when the tab is in the
   background.
3. **LINE OA push.** A Postgres trigger enqueues a job; an Edge Function reads
   the queue and calls the LINE Messaging API `push`/`multicast` to the staff
   group. Kept asynchronous on purpose — LINE being slow or down must never
   block or fail an order insert.

## 8. Reporting queries

Daily sales, from `orders` joined to `payments`:

```sql
select service_date,
       count(*) filter (where status = 'handed_over')          as completed,
       count(*) filter (where status in ('cancelled','rejected')) as lost,
       sum(total) filter (where status = 'handed_over')        as revenue,
       sum(total) filter (where status = 'handed_over'
                            and p.method = 'cash')             as cash,
       sum(total) filter (where status = 'handed_over'
                            and p.method = 'transfer')         as transfer
  from orders o join payments p on p.order_id = o.id
 group by service_date order by service_date desc;
```

Average time per stage, from `order_events` — this is why the audit log is
append-only and timestamped:

```sql
select date_trunc('day', created_at) as day,
       to_status,
       avg(created_at - lag(created_at) over (partition by order_id
                                              order by created_at))
  from order_events
 where type = 'status_changed'
 group by 1, 2;
```
