-- 0015 · Live tracking for the customer
-- Plan: docs/plan/05-backend-security.md §7
--
-- The customer does NOT subscribe to `orders`. Realtime respects RLS and orders
-- has no public select policy, so that would return nothing anyway — but the
-- deeper reason is that a table subscription needs a filter, and the only thing
-- a customer holds is the code. A code used as a subscription filter is a code
-- that can be brute-forced over a websocket, quietly, with no HTTP request to
-- rate-limit.
--
-- Instead the server broadcasts to a channel named after the order's **id**.
-- The id is a random uuid, it is never displayed, and the only way to learn it
-- is to have already resolved the code through lookup_order — which is the
-- surface the Phase 3 rate limit covers. Guessing a channel name is guessing a
-- uuid.
--
-- The payload carries the status and nothing else. Anything a customer needs
-- beyond that they fetch through lookup_order, which decides what they may see.

create or replace function private.broadcast_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'status', new.status,
      'version', new.version,
      'at', now()
    ),
    'status',
    'order:' || new.id::text,
    false  -- public channel: the uuid in the name is the secret, not a policy
  );
  return null;
end;
$$;

create trigger broadcast_order_status
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function private.broadcast_order_status();

comment on function private.broadcast_order_status() is
  'Pushes status changes to the ordering device. Fires only when the status '
  'actually changed, so a claim or a note edit does not wake every tracking '
  'page in the building.';
