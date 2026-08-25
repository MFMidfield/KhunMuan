-- 0017 · Deleting a staff member releases their claims first
--
-- Bug: deleting anyone who had ever claimed an order failed with
--
--   new row for relation "orders" violates check constraint "orders_claim_pair"
--
-- `orders.claimed_by` has ON DELETE SET NULL, so removing an admin nulls that
-- column — and leaves `claimed_at` sitting there. The pair constraint from 0005
-- then correctly rejects the half-cleared row.
--
-- The constraint is not the problem. A claim is a pair: who, and since when. A
-- row carrying a timestamp for an owner who does not exist is exactly what the
-- constraint exists to prevent, and loosening it to let the delete through
-- would trade a clear failure for a board that shows an order claimed by
-- nobody, for forty-five minutes, until the stale marker appears.
--
-- A referential action can only touch the column the foreign key names, so the
-- pair has to be cleared before the delete rather than by it.

create or replace function private.release_claims_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- One statement, so the audit rows are written for exactly the orders that
  -- were released. Matching them afterwards on a timestamp would also catch
  -- anything else updated in the same transaction.
  with released as (
    -- Both halves, and a version bump so any board holding one of these gets a
    -- STALE_ORDER rather than acting on what it last saw.
    update public.orders
       set claimed_by = null,
           claimed_at = null,
           version    = version + 1
     where claimed_by = old.id
    returning id
  )
  insert into public.order_events (order_id, type, actor_label, payload)
  -- actor_label is snapshotted text, which is the whole reason order_events
  -- outlives the person it refers to.
  select id, 'released', old.display_name,
         jsonb_build_object('reason', 'staff_removed')
    from released;

  return old;
end;
$$;

create trigger release_claims_before_delete
  before delete on public.admin_users
  for each row
  execute function private.release_claims_before_delete();
