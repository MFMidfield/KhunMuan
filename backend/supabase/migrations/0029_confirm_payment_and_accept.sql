-- 0029 · Confirming a transfer is how a transfer order gets accepted
-- Plan: docs/plan/02-order-lifecycle.md §2, docs/plan/04-frontend.md §3
--
-- Since 0028 a transfer order arrives with its slip already attached, which
-- changes what the first tap on the board means. For a cash order the question
-- is "can we make this?". For a transfer order the question is "did the money
-- arrive?" — and once staff have looked at the slip and answered yes, making
-- them tap accept as a separate action is asking the same question twice.
--
-- So the board offers one button for those orders and it does both things. Both
-- in one transaction, because the half-done state is the bad one: a payment
-- marked paid on an order still sitting in pending_confirmation looks, to
-- everyone who comes along later, exactly like a customer who paid and was
-- ignored.

create or replace function public.confirm_payment_and_accept(
  p_order_id         uuid,
  p_expected_version int
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin public.admin_users;
  o     public.orders;
  pay   public.payments;
begin
  admin := private.current_admin();
  if admin.id is null then
    raise exception 'NOT_STAFF';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- Checked here as well as inside advance_order, so a stale board loses the
  -- race before the payment is touched rather than after.
  if o.version <> p_expected_version then
    raise exception 'STALE_ORDER' using detail = o.version::text;
  end if;

  if o.status <> 'pending_confirmation' then
    raise exception 'ILLEGAL_TRANSITION'
      using detail = format('%s -> accepted', o.status);
  end if;

  select * into pay from public.payments where order_id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- Only ever forward. Re-confirming something already paid must not rewrite
  -- who confirmed it or when, because that is the record the end-of-shift
  -- reconciliation reads.
  if pay.state <> 'paid' then
    update public.payments
       set state        = 'paid',
           confirmed_by = admin.id,
           confirmed_at = now()
     where order_id = p_order_id;

    insert into public.order_events
      (order_id, type, actor_admin_id, actor_label, payload)
    values (
      p_order_id, 'payment_confirmed', admin.id, admin.display_name,
      jsonb_build_object('from', pay.state, 'to', 'paid', 'with_accept', true)
    );
  end if;

  -- Nested rather than reimplemented. advance_order owns the transition table,
  -- the implicit claim from 0027 and the audit row; a second copy of that here
  -- would be a second thing to keep in step. It resolves the caller from the
  -- JWT exactly as it does when called directly.
  perform public.advance_order(p_order_id, 'accepted', p_expected_version);

  return jsonb_build_object(
    'id', p_order_id,
    'status', 'accepted',
    'payment_state', 'paid',
    'version', o.version + 1
  );
end;
$$;

revoke all on function public.confirm_payment_and_accept(uuid, int) from public;
grant execute on function public.confirm_payment_and_accept(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- lookup_order — the customer is told why
-- ---------------------------------------------------------------------------
--
-- A rejected order previously rendered as the word "ปฏิเสธ" and nothing else,
-- which is the version of this screen that generates a phone call. The reason
-- has been recorded on the row since 0013; it was simply never handed back.
--
-- The picked label goes to any caller who knows the code: it comes from a fixed
-- list the shop wrote, and "ของหมด" tells a stranger nothing about the person
-- who ordered. The free-text note is full-view only, because staff type real
-- sentences into it and a sentence about one order can be about its customer.

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

    'reject_reason', (select r.label from public.order_reject_reasons r
                       where r.id = o.reject_reason_id),
    'reject_note',   case when full_view then o.cancelled_reason end,

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

grant execute on function public.lookup_order(text, uuid) to authenticated;
