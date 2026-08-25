-- 0012 · lookup_order
-- Plan: docs/plan/03-order-code.md §7–§8, docs/plan/05-backend-security.md §3
--
-- `orders` has no public select policy at all, so this function is the only way
-- a customer ever sees their order. Two views come out of it:
--
--   with the client_token   the device that placed the order — everything
--   with the code alone     status, contents, pickup point, slot and total, and
--                           NEVER customer_name, customer_room or customer_phone
--
-- A scanner that gets lucky on a code learns what someone ordered, not who they
-- are. That is what caps the damage in doc 03 §8.
--
-- Rate limiting is NOT here. The client IP is not visible to a plain RPC, so
-- the limit lives in the `track` Edge Function that wraps this (Phase 3). Until
-- that lands, this function is callable at whatever rate the network allows.

create or replace function public.lookup_order(
  p_code         text,
  p_client_token uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o        public.orders;
  full_view boolean;
  result   jsonb;
begin
  select * into o from public.orders where code = upper(btrim(p_code));

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- 24-hour expiry after the order stopped being in flight. This shrinks the
  -- live target set to what is actually cookable, which is the single biggest
  -- lever on the enumeration risk.
  if o.status in ('handed_over', 'cancelled', 'rejected')
     and o.updated_at < now() - interval '24 hours' then
    raise exception 'ORDER_EXPIRED';
  end if;

  full_view := (p_client_token is not null and p_client_token = o.client_token)
               or public.is_admin();

  select jsonb_build_object(
    'id', o.id,
    'code', o.code,
    'status', o.status,
    'service_date', o.service_date,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'fulfillment', o.fulfillment,
    'note', o.note,
    'subtotal', o.subtotal,
    'delivery_fee', o.delivery_fee,
    'total', o.total,
    'can_cancel', o.status = 'pending_confirmation' and full_view,
    'full_view', full_view,

    'pickup_point', (select jsonb_build_object('name', p.name, 'detail', p.detail)
                       from public.pickup_points p where p.id = o.pickup_point_id),
    'pickup_slot',  (select jsonb_build_object('label', s.label)
                       from public.pickup_slots s where s.id = o.pickup_slot_id),
    'delivery_zone',(select jsonb_build_object('name', z.name)
                       from public.delivery_zones z where z.id = o.delivery_zone_id),

    -- The three fields that identify a person, and the free-text location that
    -- usually contains a room number, are withheld unless the caller proves it
    -- is the device that placed the order.
    'delivery_location', case when full_view then o.delivery_location end,
    'customer_name',     case when full_view then o.customer_name end,
    'customer_room',     case when full_view then o.customer_room end,
    'customer_phone',    case when full_view then o.customer_phone end,

    'payment', (select jsonb_build_object('method', pm.method, 'state', pm.state)
                  from public.payments pm where pm.order_id = o.id),

    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'set_name', oi.set_name,
               'piece_quota', oi.piece_quota,
               'quantity', oi.quantity,
               'unit_price', oi.unit_price,
               'line_total', oi.line_total,
               'note', oi.note,
               'fillings', coalesce((
                 select jsonb_agg(jsonb_build_object('name', f.filling_name, 'qty', f.qty)
                          order by f.filling_name)
                   from public.order_item_fillings f
                  where f.order_item_id = oi.id), '[]'::jsonb),
               'addons', coalesce((
                 select jsonb_agg(jsonb_build_object('name', a.addon_name, 'qty', a.qty,
                                                     'unit_price', a.unit_price)
                          order by a.addon_name)
                   from public.order_item_addons a
                  where a.order_item_id = oi.id), '[]'::jsonb)
             ) order by oi.sort_order)
        from public.order_items oi
       where oi.order_id = o.id), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.lookup_order(text, uuid) to anon, authenticated;
