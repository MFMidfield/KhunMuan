-- 0007 · updated_at triggers
-- Plan: docs/plan/01-data-model.md preamble
--
-- Every mutable table carries updated_at maintained by a trigger. The
-- append-only tables (order_events) and the pure join tables whose rows are
-- replaced wholesale (order_item_fillings, order_item_addons) do not.

do $$
declare
  t text;
begin
  foreach t in array array[
    'shop_settings',
    'admin_users',
    'pickup_points',
    'pickup_slots',
    'delivery_zones',
    'sets',
    'fillings',
    'addons',
    'filling_stock_daily',
    'orders',
    'order_items',
    'payments'
  ]
  loop
    execute format(
      'create trigger set_updated_at
         before update on public.%I
         for each row execute function private.set_updated_at()',
      t
    );
  end loop;
end;
$$;
