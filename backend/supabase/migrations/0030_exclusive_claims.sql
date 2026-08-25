-- 0030 · Claiming becomes a shop setting
-- Plan: docs/plan/02-order-lifecycle.md §2
--
-- Claiming was written for a six-person shift where two people cooking the same
-- order is a real and expensive mistake. It is the wrong shape for a shift where
-- two people share one tablet and simply pick up whatever is next: there, the
-- ownership check is not a safety net, it is a door that keeps locking on the
-- person standing at it.
--
-- So it becomes a switch. `exclusive_claims` on, the default, is everything
-- doc 02 §2 describes. Off, anyone may move any order, and the guards that
-- raise CLAIMED_BY_SOMEONE_ELSE simply do not fire.
--
-- What does *not* change with the switch is the record. The order is still
-- stamped with whoever accepted or started it, because "who cooked this" is a
-- question the shop asks after the fact regardless of whether the system was
-- enforcing anything at the time. The board hides the row; the row is still
-- written.

alter table public.shop_settings
  add column exclusive_claims boolean not null default true;

comment on column public.shop_settings.exclusive_claims is
  'On: an order belongs to whoever took it and nobody else may move it '
  '(doc 02 §2). Off: everyone may move everything, and claimed_by becomes a '
  'record of who acted rather than a lock. Default on.';

-- ---------------------------------------------------------------------------
-- Flipping it
-- ---------------------------------------------------------------------------

-- An ordinary admin power, like open/close and for the same reason: the person
-- on shift when the shape of the shift changes has to be able to change it
-- without phoning the owner. RLS on shop_settings is superadmin-only, so — as
-- with toggle_shop — the write happens inside a SECURITY DEFINER function
-- rather than through PostgREST.
create or replace function public.set_exclusive_claims(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin   public.admin_users;
  current boolean;
  cleared int := 0;
begin
  admin := private.current_admin();
  if admin.id is null then
    raise exception 'NOT_STAFF';
  end if;

  select exclusive_claims into current from public.shop_settings where id = 1;

  -- A no-op tap must not clear the board's claims. Without this, tapping the
  -- switch on the mode it is already in would drop everyone's work.
  if current = p_enabled then
    return jsonb_build_object('exclusive_claims', p_enabled, 'cleared', 0);
  end if;

  update public.shop_settings
     set exclusive_claims = p_enabled,
         updated_by       = admin.id
   where id = 1;

  -- Every live claim is dropped on the way through, in both directions.
  --
  -- Switching off, a claim that no longer means anything must not sit on a card
  -- implying it does. Switching on, claims recorded while nothing was enforcing
  -- them would suddenly start locking people out of orders they were already
  -- working on — the mode change would hand out ownership nobody asked for.
  --
  -- The version bump is deliberate: every open board is now holding a stale row
  -- and has to refetch before its next write, which is exactly what
  -- expected_version is for.
  with released as (
    update public.orders
       set claimed_by = null, claimed_at = null, version = version + 1
     where claimed_by is not null
       and status in ('pending_confirmation', 'accepted', 'cooking', 'ready')
    returning id
  )
  insert into public.order_events (order_id, type, actor_admin_id, actor_label, payload)
  select id, 'released', admin.id, admin.display_name,
         jsonb_build_object('reason', 'claim_mode_changed', 'exclusive_claims', p_enabled)
    from released;

  get diagnostics cleared = row_count;

  return jsonb_build_object('exclusive_claims', p_enabled, 'cleared', cleared);
end;
$$;

revoke all on function public.set_exclusive_claims(boolean) from public;
grant execute on function public.set_exclusive_claims(boolean) to authenticated;

-- Staff already read the whole settings row; anon holds a column-level grant
-- and this column is not in it. The customer has no business knowing how the
-- kitchen divides its work.

-- ---------------------------------------------------------------------------
-- advance_order — the two ownership guards become conditional
-- ---------------------------------------------------------------------------
--
-- Only the two `CLAIMED_BY_SOMEONE_ELSE` raises changed. The implicit claims
-- from 0027 and the slip handling from 0028 are untouched; the body is restated
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
  --
  -- This runs in both modes. With exclusive_claims off the stamp is a record of
  -- who acted rather than a lock, and the shop still wants that record.
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
  -- another person is an error only while the shop is enforcing ownership: two
  -- people cooking one order is what claiming exists to prevent, and a shop
  -- that has turned claiming off has said it would rather have the door open.
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

grant execute on function public.advance_order(
  uuid, public.order_status, int, uuid, text, text, boolean) to authenticated;
