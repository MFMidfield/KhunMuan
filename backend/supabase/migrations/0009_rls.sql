-- 0009 · Privileges and row-level security
-- Plan: docs/plan/05-backend-security.md §2
--
-- Two separate gates, and both have to be passed:
--
--   1. GRANT decides whether the role may touch the table at all. This project
--      runs with auto_expose_new_tables off (see config.toml), so nothing is
--      reachable through the Data API until it is granted here by name.
--   2. RLS decides which rows. Enabled on every table; with no policy, a table
--      is readable by nobody.
--
-- RLS is deliberately NOT forced. The order logic lives in SECURITY DEFINER
-- functions owned by postgres, and forcing RLS would subject those functions to
-- the very policies they exist to enforce correctly.

grant usage on schema public to anon, authenticated;

-- ===========================================================================
-- Enable RLS everywhere
-- ===========================================================================

alter table public.shop_settings        enable row level security;
alter table public.admin_users          enable row level security;
alter table public.pickup_points        enable row level security;
alter table public.pickup_slots         enable row level security;
alter table public.delivery_zones       enable row level security;
alter table public.sets                 enable row level security;
alter table public.fillings             enable row level security;
alter table public.addons               enable row level security;
alter table public.filling_stock_daily  enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_item_fillings  enable row level security;
alter table public.order_item_addons    enable row level security;
alter table public.payments             enable row level security;
alter table public.order_events         enable row level security;

-- ===========================================================================
-- shop_settings
-- ===========================================================================

-- Column-level grant: the customer client learns whether the shop is open and
-- whether delivery is on, and nothing else. It must therefore name its columns
-- rather than select *.
grant select (id, is_open, closed_message, delivery_enabled)
  on public.shop_settings to anon;
grant select, update on public.shop_settings to authenticated;

create policy shop_settings_public_read on public.shop_settings
  for select to anon, authenticated
  using (true);

create policy shop_settings_super_update on public.shop_settings
  for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

-- ===========================================================================
-- admin_users
-- ===========================================================================

grant select, insert, update, delete on public.admin_users to authenticated;

create policy admin_users_read on public.admin_users
  for select to authenticated
  using ((select public.is_admin()));

-- The role <> 'superadmin' clause on both sides is what makes the superadmin
-- row untouchable through the API: it cannot be edited, deleted, or duplicated.
-- Combined with the partial unique index in 0002, changing who the superadmin
-- is requires a direct database statement. That is the intent.
create policy admin_users_super_write on public.admin_users
  for all to authenticated
  using ((select public.is_superadmin()) and role <> 'superadmin')
  with check ((select public.is_superadmin()) and role <> 'superadmin');

-- ===========================================================================
-- Menu and location tables — same shape for all six
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'pickup_points', 'pickup_slots', 'delivery_zones',
    'sets', 'fillings', 'addons'
  ]
  loop
    execute format('grant select on public.%I to anon', t);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', t);

    -- The public sees only what is currently on the menu.
    execute format(
      'create policy %1$I_public_read on public.%1$I
         for select to anon, authenticated
         using (is_active)', t);

    -- Staff also see deactivated rows, so a mistake is recoverable.
    execute format(
      'create policy %1$I_admin_read on public.%1$I
         for select to authenticated
         using ((select public.is_admin()))', t);

    -- Only the superadmin edits the menu.
    execute format(
      'create policy %1$I_super_write on public.%1$I
         for all to authenticated
         using ((select public.is_superadmin()))
         with check ((select public.is_superadmin()))', t);
  end loop;
end;
$$;

-- ===========================================================================
-- filling_stock_daily
-- ===========================================================================

grant select on public.filling_stock_daily to anon, authenticated;

-- The set builder needs to know what has run out — but only for today.
create policy filling_stock_public_read on public.filling_stock_daily
  for select to anon, authenticated
  using (service_date = public.shop_today());

create policy filling_stock_admin_read on public.filling_stock_daily
  for select to authenticated
  using ((select public.is_admin()));

-- No write policy, on purpose. Stock changes go through set_stock() so an
-- audit row is always written alongside them.

-- ===========================================================================
-- orders and children
-- ===========================================================================

-- No grant to anon anywhere below. Customer tracking goes through an RPC that
-- returns a narrowed projection; the table itself is never reachable.
grant select, delete on public.orders to authenticated;

-- Deliberately column-scoped. Doc 05 says status and claim changes happen only
-- through RPCs, but a policy alone cannot say that: `for update` covers every
-- column, so an RLS-only rule would still let any signed-in admin PATCH
-- `status`, `total` or `version` straight past place_order and advance_order.
-- The columns below are the ones a human corrects on a live ticket — a
-- misheard room number, a note. Everything that carries money, ownership or
-- state is reachable only through a SECURITY DEFINER function, which also
-- writes the matching order_events row.
grant update (
  note,
  cancelled_reason,
  customer_name,
  customer_room,
  customer_phone,
  delivery_location,
  delivery_zone_id,
  pickup_point_id,
  pickup_slot_id
) on public.orders to authenticated;

grant select on public.order_items         to authenticated;
grant select on public.order_item_fillings to authenticated;
grant select on public.order_item_addons   to authenticated;
-- payments carries the money. Read only; state moves through set_payment().
grant select on public.payments            to authenticated;
grant select on public.order_events        to authenticated;

create policy orders_admin_read on public.orders
  for select to authenticated
  using ((select public.is_admin()));

-- Status and claim changes go through RPCs; this policy exists so a superadmin
-- correcting a live order does not need one. Note the asymmetry: a normal admin
-- cannot touch an order once it is finished, because the sales report is built
-- on those rows.
create policy orders_admin_update on public.orders
  for update to authenticated
  using (
    (select public.is_admin())
    and status not in ('handed_over', 'cancelled', 'rejected')
  )
  with check ((select public.is_admin()));

create policy orders_super_update_final on public.orders
  for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

create policy orders_super_delete on public.orders
  for delete to authenticated
  using ((select public.is_superadmin()));

create policy order_items_admin_read on public.order_items
  for select to authenticated
  using ((select public.is_admin()));

create policy order_item_fillings_admin_read on public.order_item_fillings
  for select to authenticated
  using ((select public.is_admin()));

create policy order_item_addons_admin_read on public.order_item_addons
  for select to authenticated
  using ((select public.is_admin()));

create policy payments_admin_read on public.payments
  for select to authenticated
  using ((select public.is_admin()));

-- No update policy: payment state moves through set_payment() only, so every
-- change is paired with an audit row. "Payment amnesia" is one of the four
-- failures this system exists to remove; an untraceable UPDATE recreates it.

-- ===========================================================================
-- order_events — read for admins, insert for nobody
-- ===========================================================================

create policy order_events_admin_read on public.order_events
  for select to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- Nothing is granted by default to future objects either
-- ===========================================================================

alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on functions from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
