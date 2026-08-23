-- 0016 · Everything the shop owns becomes back-office configuration
-- Plan: docs/plan/06-roadmap-open-questions.md Q4–Q13, Q17
--
-- Q4–Q7 and Q11–Q13 were open questions waiting on lists from the shop: the
-- sets, the fillings, the sauces, the delivery fee, the pickup points, the
-- slots, the staff. The answer is that they should never have been answers.
-- They are all things that change — a filling comes off the menu, a price goes
-- up, a slot moves, someone joins — and anything that changes belongs in the
-- back office, not in a migration that needs a developer.
--
-- The tables already exist and already carry superadmin-only write policies
-- from 0009, so most of this migration is not about the lists. It is about the
-- three things that were rules rather than rows, plus the storage the menu
-- photos and the PromptPay QR need.

-- ---------------------------------------------------------------------------
-- Q10 · Minimum order and quantity cap
-- ---------------------------------------------------------------------------

alter table public.shop_settings
  add column min_order_total numeric(10, 2) check (min_order_total >= 0),
  add column max_boxes_per_order int check (max_boxes_per_order > 0);

comment on column public.shop_settings.min_order_total is
  'Null means no minimum. Compared against the food subtotal, not the total: '
  'a delivery fee pushing a small order over the line would be a minimum in '
  'name only.';

comment on column public.shop_settings.max_boxes_per_order is
  'Null means no cap. Counts boxes, not order lines — ten of one set is ten '
  'boxes for the kitchen however it was entered.';

-- ---------------------------------------------------------------------------
-- Q12 · Slot cutoff
-- ---------------------------------------------------------------------------

alter table public.pickup_slots
  add column cutoff_minutes int check (cutoff_minutes >= 0);

comment on column public.pickup_slots.cutoff_minutes is
  'How many minutes before the slot starts ordering closes for it. Null means '
  'no automatic cutoff at all — the slot stays orderable until staff switch it '
  'off, which is a deliberate choice and not the same as zero. Zero closes it '
  'exactly at the start time.';

-- ---------------------------------------------------------------------------
-- Q17 · PromptPay QR — one static image, uploaded in the back office
-- ---------------------------------------------------------------------------

alter table public.shop_settings
  add column promptpay_qr_path text;

comment on column public.shop_settings.promptpay_qr_path is
  'Object path in the `menu` bucket. One static image the shop uploads, not a '
  'per-order generated code: the amount is on the tracking page beside it, and '
  'a single image is one thing to get right instead of a generator to keep '
  'correct.';

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu', 'menu', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- menu: public read, superadmin write — set and filling photos plus the
-- PromptPay QR. `slips` arrives in Phase 3 and is private.

-- Anyone may look at the menu; it is the menu.
create policy menu_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu');

-- Only the superadmin uploads, replaces or removes a photo. The 5 MB cap and
-- the mime allow-list above are enforced by storage itself, so a policy cannot
-- be the only thing standing between the bucket and a 200 MB video.
create policy menu_super_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu' and (select public.is_superadmin()));

create policy menu_super_update on storage.objects
  for update to authenticated
  using (bucket_id = 'menu' and (select public.is_superadmin()))
  with check (bucket_id = 'menu' and (select public.is_superadmin()));

create policy menu_super_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu' and (select public.is_superadmin()));

-- ---------------------------------------------------------------------------
-- place_order enforces the three new rules
-- ---------------------------------------------------------------------------
--
-- Only the changed sections are commented; the rest is 0011 unchanged.

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
  now_local       timestamp := (now() at time zone 'Asia/Bangkok');
  admin           public.admin_users;
  request_id      uuid;
  existing        public.orders;

  fulfillment     public.fulfillment_type;
  payment_method  public.payment_method;
  zone            public.delivery_zones;
  point           public.pickup_points;
  slot            public.pickup_slots;
  slot_taken      int;
  box_count       int;

  item            jsonb;
  item_index      int := 0;
  set_row         public.sets;
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

  select * into s from public.shop_settings where id = 1;

  admin := private.current_admin();

  if not s.is_open and admin.id is null then
    raise exception 'SHOP_CLOSED' using detail = coalesce(s.closed_message, '');
  end if;

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

    -- Q12. Staff are exempt: someone phoning at 11:58 for the 12:00 slot is a
    -- conversation the shop already agreed to, and refusing it would only send
    -- them to write it on paper.
    if slot.cutoff_minutes is not null and admin.id is null then
      if now_local > ((today + slot.starts_at_local)
                      - make_interval(mins => slot.cutoff_minutes)) then
        raise exception 'SLOT_CLOSED' using detail = slot.label;
      end if;
    end if;

    if slot.capacity is not null then
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

  if jsonb_typeof(p_payload -> 'items') <> 'array'
     or jsonb_array_length(p_payload -> 'items') = 0 then
    raise exception 'EMPTY_CART';
  end if;

  -- Q10, the cap half. Counted before any work is done, because rejecting a
  -- forty-box order after locking forty stock rows is rude to everyone else
  -- ordering at the same moment.
  select coalesce(sum((i ->> 'quantity')::int), 0) into box_count
    from jsonb_array_elements(p_payload -> 'items') i;

  if s.max_boxes_per_order is not null and box_count > s.max_boxes_per_order then
    raise exception 'TOO_MANY_BOXES'
      using detail = format('%s > %s', box_count, s.max_boxes_per_order);
  end if;

  perform pg_advisory_xact_lock(hashtext('set:' || set_id))
     from (select distinct (i ->> 'set_id') as set_id
             from jsonb_array_elements(p_payload -> 'items') i
            order by 1) locked;

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

  -- Q10, the minimum half. Against the subtotal: a delivery fee dragging a
  -- small order over the line would be a minimum in name only.
  if s.min_order_total is not null and subtotal < s.min_order_total then
    raise exception 'BELOW_MINIMUM'
      using detail = format('%s < %s', subtotal, s.min_order_total);
  end if;

  grand_total := subtotal + delivery_fee;
  client_total := (p_payload ->> 'client_total')::numeric;

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

grant execute on function public.place_order(jsonb) to anon, authenticated;
