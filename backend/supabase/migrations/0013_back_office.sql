-- 0013 · Back office: claiming, guarded transitions, payment, stock, open/close
-- Plan: docs/plan/02-order-lifecycle.md §1–§2, docs/plan/05-backend-security.md §3
--
-- Six people work this board at once on flaky campus wifi. Every function here
-- is written for that: transitions take an expected_version, claiming is a
-- single conditional update, and losing a race is a normal outcome the UI can
-- explain rather than an error it has to apologise for.

-- ---------------------------------------------------------------------------
-- Rejection and cancellation reasons — doc 06 Q15
-- ---------------------------------------------------------------------------
--
-- A fixed list plus an optional free-text detail. The list is what makes the
-- report groupable; the free text is what stops staff picking a wrong-but-close
-- option because the right one is missing.

create table public.order_reject_reasons (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.order_reject_reasons
  for each row execute function private.set_updated_at();

-- The four the plan already names (doc 06 Q15). Superadmin-editable, so this is
-- a starting list rather than shop data invented here.
insert into public.order_reject_reasons (label, sort_order) values
  ('ของหมด', 1),
  ('คิวเต็ม', 2),
  ('ปิดร้านแล้ว', 3),
  ('ติดต่อลูกค้าไม่ได้', 4);

alter table public.orders
  add column reject_reason_id uuid references public.order_reject_reasons (id);

create index orders_reject_reason_id_idx on public.orders (reject_reason_id);

comment on column public.orders.cancelled_reason is
  'Free-text detail only. The groupable reason is reject_reason_id; this is the '
  'sentence a human added next to it, and it is null for a customer cancelling '
  'their own order.';

alter table public.order_reject_reasons enable row level security;

grant select on public.order_reject_reasons to authenticated;
grant insert, update, delete on public.order_reject_reasons to authenticated;

create policy order_reject_reasons_admin_read on public.order_reject_reasons
  for select to authenticated
  using ((select public.is_admin()));

create policy order_reject_reasons_super_write on public.order_reject_reasons
  for all to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

-- ---------------------------------------------------------------------------
-- Customer cancellation, corrected
-- ---------------------------------------------------------------------------
--
-- 0011 wrote a Thai sentence into cancelled_reason. That column is now the
-- free-text detail a staff member types, and a customer types nothing — the
-- order_events row already records that the customer was the actor, which is
-- where the board should read it from. A UI string does not belong in the
-- database.

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
         version = version + 1
   where id = o.id;

  perform private.restore_stock(o.id);

  insert into public.order_events
    (order_id, type, from_status, to_status, actor_label)
  values (o.id, 'cancelled', o.status, 'cancelled', 'customer');

  return jsonb_build_object('id', o.id, 'code', o.code, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- Claiming
-- ---------------------------------------------------------------------------

create or replace function public.claim_order(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin   public.admin_users;
  claimed int;
  o       public.orders;
  owner   text;
begin
  admin := private.current_admin();
  if admin.id is null then
    raise exception 'NOT_STAFF';
  end if;

  -- One conditional update. Losing this race is the normal case when six people
  -- are looking at the same new order, so it is reported as an outcome — "รับไป
  -- แล้วโดย X" — and never as a red error.
  update public.orders
     set claimed_by = admin.id,
         claimed_at = now(),
         version    = version + 1
   where id = p_order_id
     and claimed_by is null
     and status in ('pending_confirmation', 'accepted', 'cooking', 'ready');

  get diagnostics claimed = row_count;

  select * into o from public.orders where id = p_order_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if claimed = 1 then
    insert into public.order_events (order_id, type, actor_admin_id, actor_label)
    values (p_order_id, 'claimed', admin.id, admin.display_name);
  end if;

  select a.display_name into owner
    from public.admin_users a where a.id = o.claimed_by;

  return jsonb_build_object(
    'claimed', claimed = 1,
    'claimed_by', o.claimed_by,
    'claimed_by_name', owner,
    'version', o.version
  );
end;
$$;

grant execute on function public.claim_order(uuid) to authenticated;

create or replace function public.release_order(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin public.admin_users;
  o     public.orders;
begin
  admin := private.current_admin();
  if admin.id is null then
    raise exception 'NOT_STAFF';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- Anyone may drop their own claim; only the superadmin may drop someone
  -- else's, for the phone-died-mid-shift case.
  if o.claimed_by is distinct from admin.id and not public.is_superadmin() then
    raise exception 'NOT_YOUR_CLAIM';
  end if;

  update public.orders
     set claimed_by = null, claimed_at = null, version = version + 1
   where id = p_order_id;

  insert into public.order_events (order_id, type, actor_admin_id, actor_label)
  values (p_order_id, 'released', admin.id, admin.display_name);

  return jsonb_build_object('id', p_order_id, 'claimed', false);
end;
$$;

grant execute on function public.release_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- advance_order — the only way orders.status ever changes
-- ---------------------------------------------------------------------------

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

  -- Claiming is required before work starts, and the "เริ่มทำ" button does
  -- claim-and-advance in one call — hence the implicit claim here rather than
  -- an error the user has to resolve by tapping a different button first.
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

grant execute on function public.advance_order(
  uuid, public.order_status, int, uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- set_payment
-- ---------------------------------------------------------------------------

create or replace function public.set_payment(
  p_order_id uuid,
  p_state    public.payment_state,
  p_note     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin public.admin_users;
  pay   public.payments;
begin
  admin := private.current_admin();
  if admin.id is null then
    raise exception 'NOT_STAFF';
  end if;

  select * into pay from public.payments where order_id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  update public.payments
     set state        = p_state,
         confirmed_by = case when p_state = 'paid' then admin.id else confirmed_by end,
         confirmed_at = case when p_state = 'paid' then now() else confirmed_at end,
         note         = coalesce(nullif(btrim(p_note), ''), note)
   where order_id = p_order_id;

  insert into public.order_events
    (order_id, type, actor_admin_id, actor_label, payload)
  values (
    p_order_id, 'payment_confirmed', admin.id, admin.display_name,
    jsonb_build_object('from', pay.state, 'to', p_state, 'note', p_note)
  );

  return jsonb_build_object('order_id', p_order_id, 'state', p_state);
end;
$$;

grant execute on function public.set_payment(uuid, public.payment_state, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_stock
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
  insert into public.filling_stock_daily
    (filling_id, service_date, qty_total, qty_remaining)
  values (p_filling_id, today, p_qty_total, p_qty_total)
  on conflict (filling_id, service_date) do update
    set qty_total     = excluded.qty_total,
        qty_remaining = greatest(0, excluded.qty_total - coalesce(consumed, 0))
  returning * into row_out;

  return jsonb_build_object(
    'filling_id', p_filling_id,
    'qty_total', row_out.qty_total,
    'qty_remaining', row_out.qty_remaining
  );
end;
$$;

grant execute on function public.set_stock(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- toggle_shop
-- ---------------------------------------------------------------------------

create or replace function public.toggle_shop(p_is_open boolean, p_message text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin public.admin_users;
begin
  admin := private.current_admin();
  if admin.id is null then
    raise exception 'NOT_STAFF';
  end if;

  update public.shop_settings
     set is_open        = p_is_open,
         closed_message = coalesce(nullif(btrim(p_message), ''), closed_message),
         updated_by     = admin.id
   where id = 1;

  return jsonb_build_object('is_open', p_is_open);
end;
$$;

grant execute on function public.toggle_shop(boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Take the back office away from anon
-- ---------------------------------------------------------------------------
--
-- `create function` grants EXECUTE to PUBLIC by default, which means anon can
-- reach every function above unless it is revoked. They all fail closed with
-- NOT_STAFF, so this is not a hole — but an anonymous caller should not be able
-- to probe which order ids exist by watching NOT_STAFF turn into
-- ORDER_NOT_FOUND, and a function anon can call is a function anon can rate you
-- out of. Only place_order, cancel_order and lookup_order are public, and they
-- are public deliberately.

revoke all on function public.claim_order(uuid) from public;
revoke all on function public.release_order(uuid) from public;
revoke all on function public.advance_order(
  uuid, public.order_status, int, uuid, text, text, boolean) from public;
revoke all on function public.set_payment(uuid, public.payment_state, text) from public;
revoke all on function public.set_stock(uuid, int) from public;
revoke all on function public.toggle_shop(boolean, text) from public;

grant execute on function public.claim_order(uuid) to authenticated;
grant execute on function public.release_order(uuid) to authenticated;
grant execute on function public.advance_order(
  uuid, public.order_status, int, uuid, text, text, boolean) to authenticated;
grant execute on function public.set_payment(uuid, public.payment_state, text) to authenticated;
grant execute on function public.set_stock(uuid, int) to authenticated;
grant execute on function public.toggle_shop(boolean, text) to authenticated;
