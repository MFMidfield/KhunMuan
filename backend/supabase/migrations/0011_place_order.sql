-- 0011 · place_order, cancel_order, restore_stock
-- Plan: docs/plan/02-order-lifecycle.md §3–§5
--
-- The client's write surface for ordering is exactly one function. It is
-- SECURITY DEFINER because the caller is anonymous and must never be able to
-- set a price, a status or a stock number — and because decrementing stock for
-- every filling in every set has to be one transaction or nothing.
--
-- Errors are raised with a machine-readable code as the MESSAGE and the
-- specifics in DETAIL, so the UI can point at the exact chip a customer has to
-- change rather than showing a sentence it cannot parse.

-- ---------------------------------------------------------------------------
-- Columns the ordering flow needs
-- ---------------------------------------------------------------------------

-- Idempotency. The client generates this before its first attempt; a retry
-- after a dropped connection returns the existing order instead of a twin.
-- Campus wifi makes this less optional than it sounds.
alter table public.orders add column client_request_id uuid;
create unique index orders_client_request_id_key
  on public.orders (client_request_id)
  where client_request_id is not null;

-- Held in the ordering device's localStorage and returned exactly once. A
-- lookup carrying it sees the full order; a lookup with the code alone never
-- sees customer_name, customer_room or customer_phone (doc 03 §8).
alter table public.orders add column client_token uuid not null default gen_random_uuid();

comment on column public.orders.client_token is
  'Returned once, at placement. Never selectable by anon — orders has no public '
  'select policy at all; it travels back through the RPC result only.';

-- ---------------------------------------------------------------------------
-- Stock restoration
-- ---------------------------------------------------------------------------

create or replace function private.restore_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using detail = p_order_id::text;
  end if;

  -- Restoring stock to a past day would corrupt yesterday's numbers for no
  -- benefit: the kitchen already cooked from yesterday's tray.
  if o.service_date <> public.shop_today() then
    return;
  end if;

  update public.filling_stock_daily s
     set qty_remaining = least(s.qty_total, s.qty_remaining + agg.needed)
    from (
      select oif.filling_id, sum(oif.qty * oi.quantity)::int as needed
        from public.order_item_fillings oif
        join public.order_items oi on oi.id = oif.order_item_id
       where oi.order_id = p_order_id
       group by oif.filling_id
    ) agg
   where s.filling_id = agg.filling_id
     and s.service_date = o.service_date;
end;
$$;

revoke all on function private.restore_stock(uuid) from public;

-- ---------------------------------------------------------------------------
-- place_order
-- ---------------------------------------------------------------------------

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

  insert into public.payments (order_id, method, state, amount)
  values (new_order.id, payment_method, 'unpaid', grand_total);

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

comment on function public.place_order(jsonb) is
  'The only way an order is created. Recomputes every price server-side, locks '
  'stock in filling_id order, allocates the code, and writes the audit row — '
  'all in one transaction.';

grant execute on function public.place_order(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- cancel_order
-- ---------------------------------------------------------------------------

create or replace function public.cancel_order(p_code text, p_client_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders
   where code = upper(btrim(p_code))
     and client_token = p_client_token
   for update;

  -- Same response whether the code is wrong or the token is: a caller probing
  -- codes must not learn which half they got right.
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if o.status <> 'pending_confirmation' then
    raise exception 'CANCEL_WINDOW_CLOSED' using detail = o.status::text;
  end if;

  update public.orders
     set status = 'cancelled',
         cancelled_reason = 'ลูกค้ายกเลิกเอง',
         version = version + 1
   where id = o.id;

  perform private.restore_stock(o.id);

  insert into public.order_events
    (order_id, type, from_status, to_status, actor_label)
  values (o.id, 'cancelled', o.status, 'cancelled', 'customer');

  return jsonb_build_object('id', o.id, 'code', o.code, 'status', 'cancelled');
end;
$$;

grant execute on function public.cancel_order(text, uuid) to anon, authenticated;
