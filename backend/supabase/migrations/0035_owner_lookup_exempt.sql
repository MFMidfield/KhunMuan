-- 0035 · The owner of an order is not a stranger guessing at codes
-- Plan: docs/plan/05-backend-security.md §4
--
-- Two changes to the lookup rate limit, both from watching it in use.
--
-- 1. A device that holds an order's `client_token` is not enumerating anything:
--    it has the code *and* the secret that came back with it. Until now it was
--    counted like anyone else, and the 5-attempts-a-minute rule counts hits as
--    well as misses — so a customer with the tracking page open (it polls every
--    30 seconds and refetches on every realtime nudge), or with the same order
--    open in two tabs, could be told to slow down on their own order. Tapping
--    their own card in "ออเดอร์ของฉัน" spent the same budget. That is the limit
--    doing exactly the harm it exists to prevent.
--
--    A proven owner now skips the check and writes no attempt row at all.
--    Someone who does not hold the token — anyone typing a code into the lookup
--    box — takes the old path unchanged, so the wall in front of the 639,584
--    codes is exactly as high as it was.
--
-- 2. The blocked list and the unblock button move from superadmin to any admin.
--    The people who answer the phone when a customer says "it says I tried too
--    many times" are the six on shift, not the owner, and a fix that needs the
--    owner's account is a fix that waits.

-- ---------------------------------------------------------------------------
-- 1 · The owner exemption
-- ---------------------------------------------------------------------------

create or replace function private.lookup_order_limited(
  p_code         text,
  p_client_token uuid,
  p_ip_hash      text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean   text := upper(btrim(coalesce(p_code, '')));
  is_owner boolean := false;
  refusal text;
  result  jsonb;
begin
  if p_ip_hash is null or length(p_ip_hash) < 16 then
    return jsonb_build_object('error', 'MISSING_CLIENT_FINGERPRINT');
  end if;

  -- One indexed read on the code, and it only ever says yes to a caller that
  -- already holds both halves. A wrong or absent token leaves `is_owner` false
  -- and the request goes through the limit exactly as before — this cannot be
  -- used to probe whether a code exists.
  if p_client_token is not null then
    select exists (
      select 1 from public.orders o
       where o.code = clean
         and o.client_token = p_client_token
    ) into is_owner;
  end if;

  if not is_owner then
    refusal := private.check_lookup_limit(p_ip_hash);
    if refusal is not null then
      -- A refused request is not recorded. Counting it would let an attacker
      -- extend their own block by continuing to knock.
      return jsonb_build_object('error', refusal);
    end if;
  end if;

  begin
    result := public.lookup_order(clean, p_client_token);
  exception
    when others then
      -- Recorded and *returned*, never re-raised. Raising out of this function
      -- aborts the transaction, and the abort takes this very insert with it —
      -- which is how the limit came to count zero misses no matter how many
      -- wrong codes arrived.
      if not is_owner then
        insert into public.code_lookup_attempts (ip_hash, code, hit)
        values (p_ip_hash, clean, false);
      end if;

      -- ORDER_EXPIRED collapses into ORDER_NOT_FOUND on the public path. The
      -- distinction tells a stranger that a code was once real, which is the
      -- one bit of information this whole endpoint exists to withhold. Staff
      -- calling lookup_order directly still see the difference.
      return jsonb_build_object('error', 'ORDER_NOT_FOUND');
  end;

  -- The owner's reads are not logged either. The ledger exists to catch someone
  -- working through the code space; a device re-reading the one order it placed
  -- is noise in it, and noise in a ledger is what makes a real burst invisible.
  if not is_owner then
    insert into public.code_lookup_attempts (ip_hash, code, hit)
    values (p_ip_hash, clean, true);
  end if;

  return result;
end;
$$;

revoke all on function private.lookup_order_limited(text, uuid, text) from public;
grant execute on function private.lookup_order_limited(text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2 · The blocked list belongs to whoever is on shift
-- ---------------------------------------------------------------------------

drop policy if exists code_lookup_attempts_super_read on public.code_lookup_attempts;

create policy code_lookup_attempts_admin_read on public.code_lookup_attempts
  for select to authenticated
  using ((select public.is_admin()));

create or replace function public.blocked_lookup_ips()
returns table (
  ip_hash      text,
  misses       bigint,
  attempts     bigint,
  first_seen   timestamptz,
  last_seen    timestamptz,
  codes_tried  text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.ip_hash,
         count(*) filter (where not a.hit) as misses,
         count(*)                          as attempts,
         min(a.created_at)                 as first_seen,
         max(a.created_at)                 as last_seen,
         array_agg(distinct a.code)        as codes_tried
    from public.code_lookup_attempts a
   where (select public.is_admin())
     and a.created_at > now() - interval '15 minutes'
   group by a.ip_hash
  having count(*) filter (where not a.hit) >= 3
   order by max(a.created_at) desc;
$$;

comment on function public.blocked_lookup_ips() is
  'Blocking by IP hash catches honest typists too. This is how staff see who is '
  'stuck and undo it — the hash is opaque and expires with the log, so it is a '
  'way to fix a false positive, not a way to identify a person.';

revoke all on function public.blocked_lookup_ips() from public;
grant execute on function public.blocked_lookup_ips() to authenticated;

create or replace function public.unblock_ip(p_ip_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed int;
begin
  if not public.is_admin() then
    raise exception 'NOT_STAFF';
  end if;

  delete from public.code_lookup_attempts where ip_hash = p_ip_hash;
  get diagnostics removed = row_count;

  return jsonb_build_object('ip_hash', p_ip_hash, 'cleared', removed);
end;
$$;

revoke all on function public.unblock_ip(text) from public;
grant execute on function public.unblock_ip(text) to authenticated;
