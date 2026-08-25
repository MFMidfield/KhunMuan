-- 0032 · The `out_for_delivery` status, on its own
--
-- Alone in its own migration on purpose. `alter type ... add value` cannot be
-- used by anything in the same transaction that added it, and the supabase CLI
-- runs each migration file in one. Splitting the value from the code that uses
-- it is the standard way around that, and 0033 is where it gets used.

alter type public.order_status add value if not exists 'out_for_delivery' after 'ready';
