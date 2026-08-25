-- 0020 · What the Edge Functions are allowed to read, and what anon is not
--
-- Bug: `slip-upload-url` answered ORDER_NOT_FOUND for an order that plainly
-- existed. service_role had no SELECT on `orders` at all, so the query returned
-- nothing, and the function reported the empty result as a missing order.
--
-- That is the failure mode worth naming: a permissions problem wearing the
-- costume of a data problem. It fails closed, which is why it looked harmless,
-- and it would have stayed invisible until someone tried to pay by transfer.
--
-- `auto_expose_new_tables` is off, so Supabase strips DML from anon,
-- authenticated *and* service_role on every new table. Every one of the three
-- has to be granted deliberately, and service_role was simply forgotten.

-- The one table an Edge Function reads directly. `track` and `slip-prune` go
-- through SECURITY DEFINER functions and need nothing more than EXECUTE, which
-- they already have.
grant select on public.orders to service_role;

-- ---------------------------------------------------------------------------
-- Tidying what was left behind
-- ---------------------------------------------------------------------------
--
-- The same stripping leaves REFERENCES, TRIGGER and TRUNCATE in place, so anon
-- currently holds TRUNCATE on every table in the schema. PostgREST cannot issue
-- a TRUNCATE, so nothing can reach it today — but "unreachable through the
-- interface we happen to use" is not the same as "not granted", and this is a
-- privilege nobody has a reason to hold.

do $$
declare
  t text;
begin
  foreach t in array array[
    'shop_settings', 'admin_users', 'pickup_points', 'pickup_slots',
    'delivery_zones', 'sets', 'fillings', 'addons', 'filling_stock_daily',
    'orders', 'order_items', 'order_item_fillings', 'order_item_addons',
    'payments', 'order_events', 'order_code_blocklist',
    'order_reject_reasons', 'code_lookup_attempts'
  ]
  loop
    execute format(
      'revoke truncate, references, trigger on public.%I from anon, authenticated', t);
  end loop;
end;
$$;
