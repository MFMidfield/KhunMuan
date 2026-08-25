-- 0006 · Indexes
-- Plan: docs/plan/01-data-model.md §6
--
-- Two groups: the query indexes the plan calls for, and an index on every
-- foreign key. Postgres does not index FK columns for you, and an unindexed FK
-- makes both joins and ON DELETE CASCADE scan the whole child table.

-- --- The board and the reports ---------------------------------------------

create index orders_service_date_status_idx
  on public.orders (service_date, status);

-- Partial, and it matters more than it looks: the back-office board subscribes
-- constantly and must never scan the full order history.
create index orders_active_idx
  on public.orders (status)
  where status in ('pending_confirmation', 'accepted', 'cooking', 'ready');

create index orders_created_at_idx on public.orders (created_at desc);

create index order_items_order_id_idx on public.order_items (order_id);

create index order_item_fillings_item_idx
  on public.order_item_fillings (order_item_id);

create index order_events_order_created_idx
  on public.order_events (order_id, created_at desc);

create index filling_stock_daily_service_date_idx
  on public.filling_stock_daily (service_date);

-- --- Foreign keys -----------------------------------------------------------

create index orders_pickup_point_id_idx on public.orders (pickup_point_id);
create index orders_pickup_slot_id_idx on public.orders (pickup_slot_id);
create index orders_delivery_zone_id_idx on public.orders (delivery_zone_id);
create index orders_claimed_by_idx on public.orders (claimed_by);
create index orders_created_by_admin_idx on public.orders (created_by_admin);

create index order_items_set_id_idx on public.order_items (set_id);
create index order_item_fillings_filling_id_idx
  on public.order_item_fillings (filling_id);
create index order_item_addons_addon_id_idx
  on public.order_item_addons (addon_id);

create index payments_confirmed_by_idx on public.payments (confirmed_by);
create index payments_state_idx on public.payments (state);

create index order_events_actor_admin_id_idx
  on public.order_events (actor_admin_id);

-- orders.code and orders.code_seq are already unique-indexed by their
-- constraints; order_item_addons(order_item_id) and payments(order_id) are
-- covered by their primary keys.
