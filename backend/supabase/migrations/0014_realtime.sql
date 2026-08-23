-- 0014 · Realtime publication
-- Plan: docs/plan/05-backend-security.md §7
--
-- Scoped to what the back-office board actually needs. Realtime respects RLS,
-- so an anonymous socket receives nothing from these tables — a customer is
-- never able to subscribe to `orders` broadly and watch the shop's day go by.
--
-- The customer's own tracking channel is deliberately NOT this. It arrives in
-- Phase 3 as a broadcast channel named after the order id, so a code never
-- becomes a subscription filter that could be brute-forced over a websocket.

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.filling_stock_daily;
