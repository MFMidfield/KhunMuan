-- 0027 · Accepting an order is taking it
-- Plan: docs/plan/02-order-lifecycle.md §2
--
-- The board used to separate "the shop confirms this order" from "I am the one
-- cooking it": accepting left the order unclaimed, and a second tap on รับงาน
-- put a name on it. In the shop the two are the same act — whoever reads the
-- order and decides it can be made is the person who then makes it — so the
-- second tap was a button that only ever repeated a decision already taken, and
-- an order sitting accepted-but-unclaimed was a state nobody meant to create.
--
-- The implicit claim already existed for `accepted → cooking`. This moves the
-- first one earlier: `pending_confirmation → accepted` now claims too. The
-- cooking branch stays, because a claim can still be released, and the person
-- who picks the order back up should not need a separate tap either.
--
-- Only the claim block changes; the rest of the body is 0013's, restated
-- because `create or replace function` has no partial form.

create or replace function public.advance_order(
  p_order_id         uuid,
  p_to_status        public.order_status,
  p_expected_version int,
  p_reason_id        uuid default null,
  p_note             text default null,
  p_code             text default null,
  p_override_payment boolean default false
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

  allowed := case
    when o.status = 'pending_confirmation' and p_to_status in ('accepted', 'rejected') then true
    when o.status = 'accepted'  and p_to_status in ('cooking', 'cancelled') then true
    when o.status = 'cooking'   and p_to_status in ('ready', 'cancelled')   then true
    -- ready → cooking is the correction path: "we need to remake this".
    when o.status = 'ready'     and p_to_status in ('handed_over', 'cooking') then true
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
  if p_to_status = 'accepted' and o.claimed_by is null then
    update public.orders
       set claimed_by = admin.id, claimed_at = now()
     where id = p_order_id and claimed_by is null;
    insert into public.order_events (order_id, type, actor_admin_id, actor_label)
    values (p_order_id, 'claimed', admin.id, admin.display_name);
    select * into o from public.orders where id = p_order_id;
  end if;

  -- The same implicit claim on the way into cooking, which is what an order
  -- released and picked up by someone else goes through. Here a claim held by
  -- another person *is* an error: two people cooking one order is the thing
  -- claiming exists to prevent.
  if p_to_status = 'cooking' and o.status = 'accepted' then
    if o.claimed_by is null then
      update public.orders
         set claimed_by = admin.id, claimed_at = now()
       where id = p_order_id and claimed_by is null;
      insert into public.order_events (order_id, type, actor_admin_id, actor_label)
      values (p_order_id, 'claimed', admin.id, admin.display_name);
      select * into o from public.orders where id = p_order_id;
    elsif o.claimed_by <> admin.id then
      raise exception 'CLAIMED_BY_SOMEONE_ELSE'
        using detail = (select display_name from public.admin_users where id = o.claimed_by);
    end if;
  end if;

  if p_to_status = 'ready' and o.claimed_by is distinct from admin.id then
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

    select * into pay from public.payments where order_id = p_order_id;
    if pay.state <> 'paid' and not p_override_payment then
      raise exception 'PAYMENT_NOT_SETTLED' using detail = pay.state::text;
    end if;
    if pay.state <> 'paid' and p_override_payment
       and coalesce(btrim(p_note), '') = '' then
      -- Overriding is allowed; overriding silently is not. The note is what
      -- makes "payment amnesia" recoverable at the end of the shift.
      raise exception 'OVERRIDE_NOTE_REQUIRED';
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
      when p_to_status = 'handed_over' and p_override_payment
        then jsonb_build_object('payment_override', true, 'note', p_note)
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

-- `claim_order` keeps its grant. Nothing on the board calls it any more, but it
-- is the only path that claims without also moving the order, and removing a
-- granted RPC is a decision about the API rather than about this button.
