-- 0031 · "This one never runs out"
-- Plan: docs/plan/01-data-model.md (filling_stock_daily), docs/plan/04-frontend.md §1
--
-- Unlimited already existed as a state — a filling with no row for today and no
-- `default_daily_qty` is never decremented — but there was no way back into it.
-- `set_stock` upserts, so once a row exists for today the only numbers on offer
-- are numbers, and a filling the shop makes to order (sauce, rice) had to be
-- given a fake ceiling every morning.
--
-- Deleting the row would not have worked. `place_order` re-creates it from
-- `default_daily_qty` the moment the next order touches that filling, so an
-- unlimited that lasts until the next customer is not an unlimited. The state
-- has to be written down, which is what the column below is for.
--
-- It is deliberately two changes in one action: the daily default is cleared
-- *and* today's row is marked. "Unlimited" that came back tomorrow morning when
-- the rollover job ran would be the same trap in a slower form.

alter table public.filling_stock_daily
  add column unlimited boolean not null default false;

comment on column public.filling_stock_daily.unlimited is
  'Today this filling is not counted: place_order skips it entirely. The '
  'qty columns are kept rather than zeroed, so switching back to a number '
  'still subtracts what has already been sold today.';

-- ---------------------------------------------------------------------------
-- set_stock_unlimited
-- ---------------------------------------------------------------------------

create or replace function public.set_stock_unlimited(p_filling_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin   public.admin_users;
  today   date := public.shop_today();
  row_out public.filling_stock_daily;
begin
  admin := private.current_admin();
  if admin.id is null then
    raise exception 'NOT_STAFF';
  end if;

  if not exists (select 1 from public.fillings where id = p_filling_id) then
    raise exception 'FILLING_UNAVAILABLE';
  end if;

  -- The half that outlives today. Without it the rollover job seeds a fresh
  -- ceiling tomorrow morning and the shop has to come back and press this
  -- again every day, which is not what "ไม่จำกัด" means to the person pressing
  -- it. Putting a daily default back is a menu decision, and lives on the menu
  -- screen where the rest of the filling is edited.
  update public.fillings
     set default_daily_qty = null
   where id = p_filling_id;

  -- The qty columns are carried through untouched on conflict. They are the
  -- record of what today has already sold, and the shop may well come back and
  -- put a number on this filling again this afternoon.
  insert into public.filling_stock_daily
    (filling_id, service_date, qty_total, qty_remaining, unlimited)
  values (p_filling_id, today, 0, 0, true)
  on conflict (filling_id, service_date) do update
    set unlimited = true
  returning * into row_out;

  return jsonb_build_object(
    'filling_id', p_filling_id,
    'unlimited', true,
    'sold_today', greatest(0, row_out.qty_total - row_out.qty_remaining)
  );
end;
$$;

revoke all on function public.set_stock_unlimited(uuid) from public;
grant execute on function public.set_stock_unlimited(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- set_stock — putting a number back turns counting on again
-- ---------------------------------------------------------------------------

create or replace function public.set_stock(p_filling_id uuid, p_qty_total int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin    public.admin_users;
  today    date := public.shop_today();
  consumed int;
  row_out  public.filling_stock_daily;
begin
  admin := private.current_admin();
  if admin.id is null then
    raise exception 'NOT_STAFF';
  end if;

  if p_qty_total < 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  select greatest(0, qty_total - qty_remaining) into consumed
    from public.filling_stock_daily
   where filling_id = p_filling_id and service_date = today
   for update;

  -- Staff are setting today's tray size, not today's remainder. What has
  -- already been sold stays sold, so the new remainder is the new total minus
  -- what is gone — never the new total outright, which would silently re-sell
  -- food that is already in boxes.
  --
  -- That rule is why `unlimited` keeps the qty columns instead of zeroing them:
  -- a filling switched to unlimited at noon and back to 40 at two has still
  -- sold whatever it sold this morning.
  insert into public.filling_stock_daily
    (filling_id, service_date, qty_total, qty_remaining, unlimited)
  values (p_filling_id, today, p_qty_total, p_qty_total, false)
  on conflict (filling_id, service_date) do update
    set qty_total     = excluded.qty_total,
        qty_remaining = greatest(0, excluded.qty_total - coalesce(consumed, 0)),
        -- A number is the opposite of unlimited; setting one is how the shop
        -- says to start counting again.
        unlimited     = false
  returning * into row_out;

  return jsonb_build_object(
    'filling_id', p_filling_id,
    'qty_total', row_out.qty_total,
    'qty_remaining', row_out.qty_remaining,
    'unlimited', false
  );
end;
$$;

grant execute on function public.set_stock(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- place_order — skip a filling that is not being counted
-- ---------------------------------------------------------------------------
--
-- One added branch, in section 4. The rest is 0028's body, restated because
-- `create or replace function` has no partial form.

create or replace function public.place_order(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s               public.shop_settings;
  today           date := public.shop_today();
  admin           public.admin_users;
  request_id      uuid;
  existing        public.orders;

  fulfillment     public.fulfillment_type;
  payment_method  public.payment_method;
  zone            public.delivery_zones;
  point           public.pickup_points;
  slot            public.pickup_slots;
  slot_taken      int;

  slip_path       text;
  staged          public.staged_slips;

  item            jsonb;
  item_index      int := 0;
  set_row         public.sets;
  -- `record`, not the table row types: both loops below select the table's
  -- columns *plus* the requested qty, and a typed row variable has no room for
  -- the extra field.
  filling_row     record;
  addon_row       record;
  piece_sum       int;
  addon_total     numeric(10, 2);
  line_total      numeric(10, 2);
  subtotal        numeric(10, 2) := 0;
  delivery_fee    numeric(10, 2) := 0;
  grand_total     numeric(10, 2);
  client_total    numeric(10, 2);

  need            record;
  stock           public.filling_stock_daily;
  default_qty     int;

  code_row        record;
  new_order       public.orders;
  new_item_id     uuid;
begin
  ---------------------------------------------------------------------------
  -- 0 · Idempotency, before anything else has a chance to have side effects
  ---------------------------------------------------------------------------
  request_id := (p_payload ->> 'client_request_id')::uuid;
  if request_id is null then
    raise exception 'MISSING_REQUEST_ID';
  end if;

  select * into existing from public.orders where client_request_id = request_id;
  if found then
    return jsonb_build_object(
      'id', existing.id,
      'code', existing.code,
      'total', existing.total,
      'status', existing.status,
      'client_token', existing.client_token,
      'replayed', true
    );
  end if;

  ---------------------------------------------------------------------------
  -- 1 · Shop check
  ---------------------------------------------------------------------------
  select * into s from public.shop_settings where id = 1;

  -- Staff keying in a phone order do so through this same function, and the
  -- shop being closed to the public must not stop them.
  admin := private.current_admin();

  if not s.is_open and admin.id is null then
    raise exception 'SHOP_CLOSED' using detail = coalesce(s.closed_message, '');
  end if;

  ---------------------------------------------------------------------------
  -- 2 · Fulfillment
  ---------------------------------------------------------------------------
  fulfillment := (p_payload ->> 'fulfillment')::public.fulfillment_type;
  payment_method := (p_payload ->> 'payment_method')::public.payment_method;

  if fulfillment is null or payment_method is null then
    raise exception 'INVALID_PAYLOAD' using detail = 'fulfillment, payment_method';
  end if;

  if fulfillment = 'pickup' then
    select * into point from public.pickup_points
     where id = (p_payload ->> 'pickup_point_id')::uuid and is_active;
    if not found then
      raise exception 'PICKUP_POINT_UNAVAILABLE';
    end if;

    select * into slot from public.pickup_slots
     where id = (p_payload ->> 'pickup_slot_id')::uuid and is_active;
    if not found then
      raise exception 'PICKUP_SLOT_UNAVAILABLE';
    end if;

    if slot.capacity is not null then
      -- Counting and then checking is not a capacity limit without this: six
      -- concurrent transactions all read zero taken and all six get in. The
      -- lock is taken before any of the per-set locks below, so the global
      -- order is always slot → sets and no cycle can form.
      perform pg_advisory_xact_lock(hashtext('slot:' || slot.id::text));

      select count(*) into slot_taken
        from public.orders o
       where o.pickup_slot_id = slot.id
         and o.service_date = today
         and o.status not in ('cancelled', 'rejected');
      if slot_taken >= slot.capacity then
        raise exception 'SLOT_FULL' using detail = slot.label;
      end if;
    end if;
  else
    if not s.delivery_enabled then
      raise exception 'DELIVERY_DISABLED';
    end if;

    select * into zone from public.delivery_zones
     where id = (p_payload ->> 'delivery_zone_id')::uuid and is_active;
    if not found then
      raise exception 'DELIVERY_ZONE_UNAVAILABLE';
    end if;

    if coalesce(btrim(p_payload ->> 'delivery_location'), '') = ''
       or coalesce(btrim(p_payload ->> 'customer_name'), '') = ''
       or coalesce(btrim(p_payload ->> 'customer_phone'), '') = '' then
      raise exception 'INVALID_PAYLOAD'
        using detail = 'delivery_location, customer_name, customer_phone';
    end if;

    delivery_fee := zone.fee;
  end if;

  ---------------------------------------------------------------------------
  -- 2a · The slip, for a transfer
  ---------------------------------------------------------------------------
  --
  -- Required of the public, not of staff. A customer paying by transfer has the
  -- slip in their hand at the moment they order; someone at the counter keying
  -- in a phone order does not, and refusing them would only push those orders
  -- back onto paper.
  slip_path := nullif(btrim(p_payload ->> 'slip_path'), '');

  if payment_method = 'transfer' and slip_path is null and admin.id is null then
    raise exception 'SLIP_REQUIRED';
  end if;

  if slip_path is not null then
    if payment_method <> 'transfer' then
      raise exception 'INVALID_PAYLOAD' using detail = 'slip_path without transfer';
    end if;

    -- Locked and re-checked for `order_id is null` in the same statement: two
    -- tabs submitting the same staged slip must not both attach it, and this is
    -- the only place that could happen.
    select * into staged from public.staged_slips
     where path = slip_path and order_id is null
     for update;

    -- Deliberately one error for "we never issued this path", "it belongs to an
    -- order already" and "it expired". A caller poking at paths learns nothing
    -- about which of the three it hit.
    if not found then
      raise exception 'SLIP_NOT_STAGED';
    end if;

    -- The row proves we issued the path; this proves a file arrived at it. A
    -- signed upload URL that was requested and never used would otherwise
    -- produce an order pointing at nothing.
    if not exists (
      select 1 from storage.objects
       where bucket_id = 'slips' and name = slip_path
    ) then
      raise exception 'SLIP_NOT_UPLOADED';
    end if;
  end if;

  ---------------------------------------------------------------------------
  -- 3 · Structure, and the price, computed from what the server just read
  ---------------------------------------------------------------------------
  if jsonb_typeof(p_payload -> 'items') <> 'array'
     or jsonb_array_length(p_payload -> 'items') = 0 then
    raise exception 'EMPTY_CART';
  end if;

  -- Serialise on the sets involved, in a fixed order, before taking any row
  -- locks. Six staff and a lunch rush will produce concurrent placements; a
  -- consistent global lock order is what stops them deadlocking each other.
  perform pg_advisory_xact_lock(hashtext('set:' || set_id))
     from (select distinct (i ->> 'set_id') as set_id
             from jsonb_array_elements(p_payload -> 'items') i
            order by 1) locked;

  -- sets.daily_limit, checked once per distinct set across the whole cart. Two
  -- boxes of the same set with different fillings are two rows, and checking
  -- them one at a time would let the pair through together.
  for need in
    select (i ->> 'set_id')::uuid as set_id,
           sum((i ->> 'quantity')::int)::int as wanted
      from jsonb_array_elements(p_payload -> 'items') i
     group by 1
  loop
    select * into set_row from public.sets where id = need.set_id;
    continue when not found or set_row.daily_limit is null;

    select coalesce(sum(oi.quantity), 0) into slot_taken
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.set_id = need.set_id
       and o.service_date = today
       and o.status not in ('cancelled', 'rejected');

    if slot_taken + need.wanted > set_row.daily_limit then
      raise exception 'SET_DAILY_LIMIT_REACHED'
        using detail = format('%s: %s of %s sold', set_row.name, slot_taken,
                              set_row.daily_limit);
    end if;
  end loop;

  for item in select * from jsonb_array_elements(p_payload -> 'items') loop
    item_index := item_index + 1;

    select * into set_row from public.sets
     where id = (item ->> 'set_id')::uuid and is_active;
    if not found then
      raise exception 'SET_UNAVAILABLE' using detail = coalesce(item ->> 'set_id', '');
    end if;

    if coalesce((item ->> 'quantity')::int, 0) < 1 then
      raise exception 'INVALID_QUANTITY' using detail = set_row.name;
    end if;

    -- Every piece of the quota must be accounted for, exactly. This is the
    -- invariant that stops failure mode #2 at the door.
    select coalesce(sum((f ->> 'qty')::int), 0) into piece_sum
      from jsonb_array_elements(coalesce(item -> 'fillings', '[]'::jsonb)) f;

    if piece_sum <> set_row.piece_quota then
      raise exception 'QUOTA_MISMATCH'
        using detail = format('%s: %s of %s', set_row.name, piece_sum, set_row.piece_quota);
    end if;

    for filling_row in
      select f.*, (e ->> 'qty')::int as want
        from jsonb_array_elements(item -> 'fillings') e
        join public.fillings f on f.id = (e ->> 'filling_id')::uuid
    loop
      if not filling_row.is_active then
        raise exception 'FILLING_UNAVAILABLE' using detail = filling_row.name;
      end if;
      if filling_row.max_per_set is not null and filling_row.want > filling_row.max_per_set then
        raise exception 'MAX_PER_SET_EXCEEDED'
          using detail = format('%s: %s > %s', filling_row.name, filling_row.want,
                                filling_row.max_per_set);
      end if;
    end loop;

    -- A filling id that does not exist is silently dropped by the join above,
    -- which would let the quota check pass against fewer pieces than claimed.
    if (select count(*) from jsonb_array_elements(item -> 'fillings')) <>
       (select count(*)
          from jsonb_array_elements(item -> 'fillings') e
          join public.fillings f on f.id = (e ->> 'filling_id')::uuid) then
      raise exception 'FILLING_UNAVAILABLE' using detail = set_row.name;
    end if;

    addon_total := 0;
    for addon_row in
      select a.*, (e ->> 'qty')::int as want
        from jsonb_array_elements(coalesce(item -> 'addons', '[]'::jsonb)) e
        join public.addons a on a.id = (e ->> 'addon_id')::uuid
    loop
      if not addon_row.is_active then
        raise exception 'ADDON_UNAVAILABLE' using detail = addon_row.name;
      end if;
      if addon_row.want < 1 or addon_row.want > addon_row.max_qty then
        raise exception 'ADDON_QTY_INVALID'
          using detail = format('%s: %s (max %s)', addon_row.name, addon_row.want,
                                addon_row.max_qty);
      end if;
      addon_total := addon_total + addon_row.price * addon_row.want;
    end loop;

    line_total := (set_row.price + addon_total) * (item ->> 'quantity')::int;
    subtotal := subtotal + line_total;
  end loop;

  grand_total := subtotal + delivery_fee;

  -- Client arithmetic is a display convenience, never an authority. When the
  -- two disagree the server wins and the disagreement is recorded, because it
  -- means a price changed under a customer mid-order — or someone is probing.
  client_total := (p_payload ->> 'client_total')::numeric;

  ---------------------------------------------------------------------------
  -- 4 · Lock and decrement stock, in filling_id order
  ---------------------------------------------------------------------------
  for need in
    select (e ->> 'filling_id')::uuid as filling_id,
           sum((e ->> 'qty')::int * (i ->> 'quantity')::int)::int as needed
      from jsonb_array_elements(p_payload -> 'items') i
      cross join lateral jsonb_array_elements(i -> 'fillings') e
     group by 1
     order by 1
  loop
    select * into stock from public.filling_stock_daily
     where filling_id = need.filling_id and service_date = today
     for update;

    if not found then
      select default_daily_qty into default_qty
        from public.fillings where id = need.filling_id;

      -- No stock row and no default: the filling is unlimited for today.
      if default_qty is null then
        continue;
      end if;

      insert into public.filling_stock_daily
        (filling_id, service_date, qty_total, qty_remaining)
      values (need.filling_id, today, default_qty, default_qty)
      on conflict (filling_id, service_date) do nothing;

      select * into stock from public.filling_stock_daily
       where filling_id = need.filling_id and service_date = today
       for update;
    end if;

    -- The row exists and says not to count this one (0031). The same outcome
    -- as having no row at all, said out loud so that clearing the daily default
    -- is not the only way to express it.
    if stock.unlimited then
      continue;
    end if;

    if stock.qty_remaining < need.needed then
      raise exception 'OUT_OF_STOCK'
        using detail = (select name from public.fillings where id = need.filling_id);
    end if;

    update public.filling_stock_daily
       set qty_remaining = qty_remaining - need.needed
     where filling_id = need.filling_id and service_date = today;
  end loop;

  ---------------------------------------------------------------------------
  -- 5 · Allocate the code and write everything
  ---------------------------------------------------------------------------
  select * into code_row from private.next_order_code();

  insert into public.orders (
    code, code_seq, code_epoch, service_date, status, fulfillment,
    pickup_point_id, pickup_slot_id,
    delivery_zone_id, delivery_location,
    customer_name, customer_room, customer_phone, note,
    subtotal, delivery_fee, total,
    source, created_by_admin, client_request_id
  ) values (
    code_row.out_code, code_row.out_seq, code_row.out_epoch, today,
    'pending_confirmation', fulfillment,
    point.id, slot.id,
    zone.id, nullif(btrim(p_payload ->> 'delivery_location'), ''),
    nullif(btrim(p_payload ->> 'customer_name'), ''),
    nullif(btrim(p_payload ->> 'customer_room'), ''),
    nullif(btrim(p_payload ->> 'customer_phone'), ''),
    nullif(btrim(p_payload ->> 'note'), ''),
    subtotal, delivery_fee, grand_total,
    case when admin.id is null then 'web' else 'admin' end::public.order_source,
    admin.id, request_id
  )
  returning * into new_order;

  item_index := 0;
  for item in select * from jsonb_array_elements(p_payload -> 'items') loop
    item_index := item_index + 1;

    select * into set_row from public.sets where id = (item ->> 'set_id')::uuid;

    select coalesce(sum(a.price * (e ->> 'qty')::int), 0) into addon_total
      from jsonb_array_elements(coalesce(item -> 'addons', '[]'::jsonb)) e
      join public.addons a on a.id = (e ->> 'addon_id')::uuid;

    insert into public.order_items (
      order_id, set_id, set_name, piece_quota, unit_price, quantity,
      line_total, note, sort_order
    ) values (
      new_order.id, set_row.id, set_row.name, set_row.piece_quota, set_row.price,
      (item ->> 'quantity')::int,
      (set_row.price + addon_total) * (item ->> 'quantity')::int,
      nullif(btrim(item ->> 'note'), ''), item_index
    )
    returning id into new_item_id;

    -- Names are snapshotted: the kitchen ticket has to survive a rename.
    insert into public.order_item_fillings (order_item_id, filling_id, filling_name, qty)
    select new_item_id, f.id, f.name, (e ->> 'qty')::int
      from jsonb_array_elements(item -> 'fillings') e
      join public.fillings f on f.id = (e ->> 'filling_id')::uuid;

    insert into public.order_item_addons (order_item_id, addon_id, addon_name, unit_price, qty)
    select new_item_id, a.id, a.name, a.price, (e ->> 'qty')::int
      from jsonb_array_elements(coalesce(item -> 'addons', '[]'::jsonb)) e
      join public.addons a on a.id = (e ->> 'addon_id')::uuid;
  end loop;

  -- Never straight to `paid`, exactly as in attach_slip: a slip is a claim, and
  -- confirming it is a decision a human makes on the board.
  insert into public.payments (order_id, method, state, amount, slip_path, slip_uploaded_at)
  values (
    new_order.id, payment_method,
    -- Cast spelled out: a CASE over two string literals is `text`, and the
    -- column is an enum.
    (case when slip_path is null then 'unpaid' else 'slip_uploaded' end)::public.payment_state,
    grand_total, slip_path,
    case when slip_path is null then null else now() end
  );

  if slip_path is not null then
    update public.staged_slips
       set order_id = new_order.id
     where id = staged.id;

    insert into public.order_events (order_id, type, actor_label, payload)
    values (new_order.id, 'slip_uploaded', 'customer',
            jsonb_build_object('path', slip_path, 'staged', true));
  end if;

  insert into public.order_events (order_id, type, to_status, actor_admin_id, actor_label, payload)
  values (
    new_order.id, 'created', 'pending_confirmation', admin.id,
    coalesce(admin.display_name, 'customer'),
    case
      when client_total is not null and client_total <> grand_total
        then jsonb_build_object('client_total', client_total, 'server_total', grand_total)
      else null
    end
  );

  return jsonb_build_object(
    'id', new_order.id,
    'code', new_order.code,
    'total', new_order.total,
    'status', new_order.status,
    'client_token', new_order.client_token,
    'replayed', false
  );
end;
$$;

grant execute on function public.place_order(jsonb) to anon, authenticated;
