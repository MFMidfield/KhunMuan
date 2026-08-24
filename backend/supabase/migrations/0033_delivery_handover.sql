-- 0033 · A delivery leaves the shop before it reaches anyone, and nothing
--        leaves unpaid any more
-- Plan: docs/plan/02-order-lifecycle.md §1
--
-- Two changes to the same function.
--
-- **`ready` stopped meaning one thing.** For a pickup order it means the box is
-- on the shelf waiting for its customer. For a delivery it meant that too, and
-- then meant it for the next twenty minutes while somebody was out on a bike
-- with it — the board could not tell "cooked, still here" from "cooked, gone,
-- nearly there", which is the difference the shop is asked about on the phone.
-- Delivery orders now go `ready → out_for_delivery → handed_over`, and the
-- middle step is not optional: `ready → handed_over` is refused for them.
-- Pickup is untouched, because a pickup order never travels.
--
-- **The payment override is gone.** `advance_order` used to accept
-- `p_override_payment` plus a note, letting staff hand over an unpaid order and
-- explain afterwards. It existed for the case where money moved and the system
-- did not know it — but the honest fix for that is to mark the payment paid,
-- which is one tap away on the same card, and the override was the only path in
-- the system by which food left the shop with no record of being paid for.
--
-- The money is still required at handover and nowhere earlier. A delivery goes
-- out with cash uncollected by design; it is collected at the door, and the
-- rider marks it paid before tapping `ส่งมอบแล้ว`.

-- The signature changes, so the old one goes rather than being left behind as a
-- second callable path with the override still in it.
drop function if exists public.advance_order(
  uuid, public.order_status, int, uuid, text, text, boolean);

create or replace function public.advance_order(
  p_order_id         uuid,
  p_to_status        public.order_status,
  p_expected_version int,
  p_reason_id        uuid default null,
  p_note             text default null,
  p_code             text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin    public.admin_users;
  s        public.shop_settings;
  o        public.orders;
  pay      public.payments;
  allowed  boolean;
begin
  admin := private.current_admin();
  if admin.id is null then
    raise exception 'NOT_STAFF';
  end if;

  select * into s from public.shop_settings where id = 1;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- Two people tapping "เสร็จแล้ว" a second apart is normal on a six-person
  -- realtime board. The second tap must be a clear no-op, not a silent
  -- double-write.
  if o.version <> p_expected_version then
    raise exception 'STALE_ORDER' using detail = o.version::text;
  end if;

  if o.status = p_to_status then
    raise exception 'ALREADY_IN_STATUS' using detail = o.status::text;
  end if;

  -- `ready` forks on fulfillment. A delivery must pass through
  -- out_for_delivery; a pickup has no such step, because the box never leaves
  -- the shop until the customer is standing there.
  allowed := case
    when o.status = 'pending_confirmation' and p_to_status in ('accepted', 'rejected') then true
    when o.status = 'accepted'  and p_to_status in ('cooking', 'cancelled') then true
    when o.status = 'cooking'   and p_to_status in ('ready', 'cancelled')   then true
    -- ready → cooking is the correction path: "we need to remake this".
    when o.status = 'ready'     and p_to_status = 'cooking' then true
    when o.status = 'ready'     and p_to_status = 'handed_over'
         and o.fulfillment = 'pickup' then true
    when o.status = 'ready'     and p_to_status = 'out_for_delivery'
         and o.fulfillment = 'delivery' then true
    -- Out on the road: it arrives, or it comes back and is cancelled. There is
    -- no re-cooking something that is already on a bike.
    when o.status = 'out_for_delivery' and p_to_status in ('handed_over', 'cancelled') then true
    else false
  end;

  if not allowed then
    raise exception 'ILLEGAL_TRANSITION'
      using detail = format('%s -> %s', o.status, p_to_status);
  end if;

  -- Ending an order needs a reason from the list. Free text alone would make
  -- the report ungroupable; no reason at all makes it useless.
  if p_to_status in ('rejected', 'cancelled') then
    if p_reason_id is null then
      raise exception 'REASON_REQUIRED';
    end if;
    if not exists (select 1 from public.order_reject_reasons
                    where id = p_reason_id and is_active) then
      raise exception 'REASON_UNKNOWN';
    end if;
  end if;

  -- Accepting takes the order. Deliberately silent when it is already claimed:
  -- accepting is a decision about the order, not about who cooks it, so a claim
  -- that somehow already exists is left alone rather than turned into an error
  -- that stops the shop from confirming.
  --
  -- This runs in both claim modes. With exclusive_claims off the stamp is a
  -- record of who acted rather than a lock, and the shop still wants that.
  if p_to_status = 'accepted' and o.claimed_by is null then
    update public.orders
       set claimed_by = admin.id, claimed_at = now()
     where id = p_order_id and claimed_by is null;
    insert into public.order_events (order_id, type, actor_admin_id, actor_label)
    values (p_order_id, 'claimed', admin.id, admin.display_name);
    select * into o from public.orders where id = p_order_id;
  end if;

  -- The same implicit claim on the way into cooking, which is what an order
  -- released and picked up by someone else goes through. A claim held by
  -- another person is an error only while the shop is enforcing ownership.
  if p_to_status = 'cooking' and o.status = 'accepted' then
    if o.claimed_by is null then
      update public.orders
         set claimed_by = admin.id, claimed_at = now()
       where id = p_order_id and claimed_by is null;
      insert into public.order_events (order_id, type, actor_admin_id, actor_label)
      values (p_order_id, 'claimed', admin.id, admin.display_name);
      select * into o from public.orders where id = p_order_id;
    elsif o.claimed_by <> admin.id and s.exclusive_claims then
      raise exception 'CLAIMED_BY_SOMEONE_ELSE'
        using detail = (select display_name from public.admin_users where id = o.claimed_by);
    end if;
  end if;

  -- Finishing the cooking is the claimer's call. Taking it out on a bike is
  -- not: the rider is often not the cook, and an ownership check there would
  -- only stop the person holding the bag.
  if p_to_status = 'ready' and s.exclusive_claims
     and o.claimed_by is distinct from admin.id then
    raise exception 'CLAIMED_BY_SOMEONE_ELSE'
      using detail = coalesce(
        (select display_name from public.admin_users where id = o.claimed_by), '');
  end if;

  if p_to_status = 'handed_over' then
    -- Doc 06 Q14. Enforced here, not in the UI: turning the switch off must be
    -- a shop decision, not something a client can fake.
    if s.require_code_on_handover
       and upper(btrim(coalesce(p_code, ''))) <> o.code then
      raise exception 'CODE_REQUIRED';
    end if;

    -- No override, and no note that makes one acceptable. If the money did
    -- arrive, say so — set_payment is one tap away on the same card, and it
    -- records who confirmed it and when. That is the record the end-of-shift
    -- reconciliation reads, and an override wrote nothing into it.
    select * into pay from public.payments where order_id = p_order_id;
    if pay.state <> 'paid' then
      raise exception 'PAYMENT_NOT_SETTLED' using detail = pay.state::text;
    end if;
  end if;

  update public.orders
     set status           = p_to_status,
         reject_reason_id = case when p_to_status in ('rejected', 'cancelled')
                                 then p_reason_id else reject_reason_id end,
         cancelled_reason = case when p_to_status in ('rejected', 'cancelled')
                                 then nullif(btrim(p_note), '') else cancelled_reason end,
         version          = version + 1
   where id = p_order_id;

  if p_to_status in ('rejected', 'cancelled') then
    perform private.restore_stock(p_order_id);
  end if;

  insert into public.order_events
    (order_id, type, from_status, to_status, actor_admin_id, actor_label, payload)
  values (
    p_order_id, 'status_changed', o.status, p_to_status, admin.id, admin.display_name,
    case
      when p_to_status in ('rejected', 'cancelled')
        then jsonb_build_object('reason_id', p_reason_id, 'note', p_note)
      else null
    end
  );

  return jsonb_build_object(
    'id', p_order_id,
    'status', p_to_status,
    'version', o.version + 1
  );
end;
$$;

revoke all on function public.advance_order(
  uuid, public.order_status, int, uuid, text, text) from public;
grant execute on function public.advance_order(
  uuid, public.order_status, int, uuid, text, text) to authenticated;
