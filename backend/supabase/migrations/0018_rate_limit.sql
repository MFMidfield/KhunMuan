-- 0018 · Rate limiting the code lookup
-- Plan: docs/plan/03-order-code.md §8, docs/plan/05-backend-security.md §4
--
-- 639,584 usable codes is a lot for a person guessing and not a lot for a
-- script. Without a limit, an attacker at 20 requests a second walks the whole
-- space in about nine hours — and they do not need the whole space, only one
-- order that is currently live.
--
-- The limit cannot live in a plain RPC, because PostgREST does not hand the
-- function the caller's IP. It lives in the `track` Edge Function, which hashes
-- the IP with a server-side salt and passes the hash down. The raw address is
-- never stored, and the hash expires with the log.
--
-- The important half of this migration is the last line: `lookup_order` stops
-- being callable by anon. A rate limit in front of a door that is still open is
-- decoration.

create table public.code_lookup_attempts (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  code       text not null,
  hit        boolean not null,
  created_at timestamptz not null default now()
);

comment on table public.code_lookup_attempts is
  'Opaque IP hashes only, deleted after 24 hours. This is a rate-limit ledger, '
  'not an access log, and it is deliberately unable to identify anyone.';

create index code_lookup_attempts_ip_time_idx
  on public.code_lookup_attempts (ip_hash, created_at desc);

create index code_lookup_attempts_time_idx
  on public.code_lookup_attempts (created_at desc);

alter table public.code_lookup_attempts enable row level security;

-- Superadmin-only, and read-only: the rows are written by a SECURITY DEFINER
-- function and cleared by unblock_ip, never edited.
grant select on public.code_lookup_attempts to authenticated;

create policy code_lookup_attempts_super_read on public.code_lookup_attempts
  for select to authenticated
  using ((select public.is_superadmin()));

-- ---------------------------------------------------------------------------
-- The limits — the strict tier from doc 05 §4
-- ---------------------------------------------------------------------------

create or replace function private.check_lookup_limit(p_ip_hash text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  last_miss     timestamptz;
  burst         int;
  attempts      int;
  global_misses int;
begin
  -- Three misses inside one minute buys a fifteen-minute block.
  --
  -- Misses, not attempts: someone reloading their own tracking page all
  -- afternoon is not the threat, and blocking them would be the limit doing the
  -- harm it exists to prevent.
  --
  -- The window is anchored on the most recent miss rather than on now(), so
  -- three misses at 12:00:00, 12:00:20 and 12:00:40 count as a burst even when
  -- the check runs at 12:05 — and the block then expires fifteen minutes after
  -- that last miss rather than fifteen minutes after whenever we happened to
  -- look.
  select max(created_at) into last_miss
    from public.code_lookup_attempts
   where ip_hash = p_ip_hash
     and not hit
     and created_at > now() - interval '15 minutes';

  if last_miss is not null then
    select count(*) into burst
      from public.code_lookup_attempts
     where ip_hash = p_ip_hash
       and not hit
       and created_at between last_miss - interval '1 minute' and last_miss;

    if burst >= 3 then
      return 'IP_BLOCKED';
    end if;
  end if;

  select count(*) into attempts
    from public.code_lookup_attempts
   where ip_hash = p_ip_hash
     and created_at > now() - interval '1 minute';

  if attempts >= 5 then
    return 'RATE_LIMITED';
  end if;

  -- The circuit breaker. A single IP hitting the per-IP limit is a typist; a
  -- hundred addresses each politely staying under it is a botnet, and the
  -- per-IP rule cannot see that at all.
  select count(*) into global_misses
    from public.code_lookup_attempts
   where not hit
     and created_at > now() - interval '1 minute';

  if global_misses >= 50 then
    return 'RATE_LIMITED';
  end if;

  return null;
end;
$$;

revoke all on function private.check_lookup_limit(text) from public;

-- ---------------------------------------------------------------------------
-- The wrapper the Edge Function calls
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
  refusal text;
  result  jsonb;
begin
  if p_ip_hash is null or length(p_ip_hash) < 16 then
    return jsonb_build_object('error', 'MISSING_CLIENT_FINGERPRINT');
  end if;

  refusal := private.check_lookup_limit(p_ip_hash);
  if refusal is not null then
    -- A refused request is not recorded. Counting it would let an attacker
    -- extend their own block by continuing to knock.
    return jsonb_build_object('error', refusal);
  end if;

  begin
    result := public.lookup_order(clean, p_client_token);
  exception
    when others then
      -- Recorded and *returned*, never re-raised. Raising out of this function
      -- aborts the transaction, and the abort takes this very insert with it —
      -- which is how the limit came to count zero misses no matter how many
      -- wrong codes arrived.
      insert into public.code_lookup_attempts (ip_hash, code, hit)
      values (p_ip_hash, clean, false);

      -- ORDER_EXPIRED collapses into ORDER_NOT_FOUND on the public path. The
      -- distinction tells a stranger that a code was once real, which is the
      -- one bit of information this whole endpoint exists to withhold. Staff
      -- calling lookup_order directly still see the difference.
      return jsonb_build_object('error', 'ORDER_NOT_FOUND');
  end;

  insert into public.code_lookup_attempts (ip_hash, code, hit)
  values (p_ip_hash, clean, true);

  return result;
end;
$$;

revoke all on function private.lookup_order_limited(text, uuid, text) from public;
grant execute on function private.lookup_order_limited(text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- The blocked list, and undoing a false positive
-- ---------------------------------------------------------------------------

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
   where (select public.is_superadmin())
     and a.created_at > now() - interval '15 minutes'
   group by a.ip_hash
  having count(*) filter (where not a.hit) >= 3
   order by max(a.created_at) desc;
$$;

comment on function public.blocked_lookup_ips() is
  'Blocking by IP hash catches honest typists too. This is how the superadmin '
  'sees who is stuck and undoes it — the hash is opaque and expires with the '
  'log, so it is a way to fix a false positive, not a way to identify a person.';

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
  if not public.is_superadmin() then
    raise exception 'NOT_SUPERADMIN';
  end if;

  delete from public.code_lookup_attempts where ip_hash = p_ip_hash;
  get diagnostics removed = row_count;

  return jsonb_build_object('ip_hash', p_ip_hash, 'cleared', removed);
end;
$$;

revoke all on function public.unblock_ip(text) from public;
grant execute on function public.unblock_ip(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Close the door the limit is standing in front of
-- ---------------------------------------------------------------------------

-- Anon now reaches lookup_order only through the `track` Edge Function, which
-- is the only caller that knows the client's IP. Staff keep direct access:
-- they read orders through RLS anyway, so enumeration is not their threat
-- model, and a locked-out customer can always phone the shop.
-- `revoke ... from anon` would do nothing here: `create function` grants
-- EXECUTE to PUBLIC, anon inherits it from PUBLIC, and revoking a grant the
-- role never held directly leaves the inherited one in place. The door has to
-- be shut on PUBLIC and reopened for the roles that should still have it.
revoke all on function public.lookup_order(text, uuid) from public;
revoke all on function public.lookup_order(text, uuid) from anon;
grant execute on function public.lookup_order(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

-- pg_cron insists on its own `cron` schema; it does not take a target.
create extension if not exists pg_cron;

create or replace function private.prune_lookup_attempts()
returns void
language sql
volatile
set search_path = ''
as $$
  delete from public.code_lookup_attempts
   where created_at < now() - interval '24 hours';
$$;

revoke all on function private.prune_lookup_attempts() from public;

select cron.schedule(
  'prune-lookup-attempts',
  '17 * * * *',
  $$select private.prune_lookup_attempts()$$
);

-- ---------------------------------------------------------------------------
-- The Data API entry point for the Edge Function
-- ---------------------------------------------------------------------------
--
-- PostgREST only exposes `public`, so the wrapper above needs a doorway. This
-- is that doorway and nothing more: it is granted to service_role alone, which
-- is a key that exists only inside Edge Functions and never reaches a browser.

create or replace function public.lookup_order_tracked(
  p_code         text,
  p_client_token uuid,
  p_ip_hash      text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.lookup_order_limited(p_code, p_client_token, p_ip_hash);
$$;

revoke all on function public.lookup_order_tracked(text, uuid, text) from public;
revoke all on function public.lookup_order_tracked(text, uuid, text) from anon, authenticated;
grant execute on function public.lookup_order_tracked(text, uuid, text) to service_role;
