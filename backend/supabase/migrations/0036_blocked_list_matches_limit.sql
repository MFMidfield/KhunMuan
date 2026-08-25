-- 0036 · The blocked list asks the limit, instead of guessing at it
-- Plan: docs/plan/05-backend-security.md §4, docs/plan/03-order-code.md §9
--
-- `blocked_lookup_ips` was written alongside the limit in 0018 and restated its
-- rule in its own words: "three or more misses in the last fifteen minutes".
-- That is not the rule `private.check_lookup_limit` enforces, and 0035 turned
-- the difference into something staff see, because the list is now a screen
-- somebody opens with a customer on the phone.
--
-- It was wrong in both directions:
--
--   * A device refused with RATE_LIMITED — five attempts in a minute, hits
--     counted — has no misses at all and never appeared. That is the common
--     case behind a shared campus NAT, and it is exactly the person who calls
--     the shop. Staff opened the screen and read "ไม่มีเครื่องไหนถูกบล็อค".
--   * A device whose three misses fell at 12:00, 12:07 and 12:14 was listed as
--     blocked. The limit's burst window is one minute, anchored on the last
--     miss, so that device was never blocked at all.
--
-- The fix is to stop restating the rule. The list now calls the same function
-- the endpoint calls, once per address seen in the window, and reports what it
-- says — including *which* refusal, because "typed five times too fast" and
-- "got three codes wrong" are different conversations to have with a customer.
--
-- What this still cannot show: the global circuit breaker (50 misses across all
-- addresses in a minute) refuses everyone, and no per-address row can express
-- that. `unblock_ip` cannot lift it either — it clears one hash. The breaker
-- expires on its own within the minute, which is the only reason that is
-- tolerable.

drop function if exists public.blocked_lookup_ips();

create or replace function public.blocked_lookup_ips(p_limit int default 100)
returns table (
  ip_hash      text,
  reason       text,
  misses       bigint,
  attempts     bigint,
  first_seen   timestamptz,
  last_seen    timestamptz,
  codes_tried  text[]
)
language sql
-- volatile, because check_lookup_limit is: it is plpgsql and reads the ledger
-- as it stands right now, which is the whole point of asking it.
volatile
security definer
set search_path = ''
as $$
  with seen as (
    select a.ip_hash,
           count(*) filter (where not a.hit) as misses,
           count(*)                          as attempts,
           min(a.created_at)                 as first_seen,
           max(a.created_at)                 as last_seen
      from public.code_lookup_attempts a
     where (select public.is_admin())
       -- The block lasts fifteen minutes and the per-minute rule is shorter, so
       -- nothing older than that window can still be refused.
       and a.created_at > now() - interval '15 minutes'
     group by a.ip_hash
  ),
  judged as (
    select s.*, private.check_lookup_limit(s.ip_hash) as reason
      from seen s
  )
  select j.ip_hash,
         j.reason,
         j.misses,
         j.attempts,
         j.first_seen,
         j.last_seen,
         -- Capped. During a distributed enumeration attempt — the one event
         -- this screen exists to watch — the untrimmed version is every code
         -- every attacker tried, re-fetched on a staff phone every 15 seconds.
         (select array_agg(c.code)
            from (select distinct a.code
                    from public.code_lookup_attempts a
                   where a.ip_hash = j.ip_hash
                     and a.created_at > now() - interval '15 minutes'
                   order by a.code
                   limit 20) c) as codes_tried
    from judged j
   where j.reason is not null
   order by j.last_seen desc
   limit greatest(coalesce(p_limit, 100), 1);
$$;

comment on function public.blocked_lookup_ips(int) is
  'Addresses the lookup limit is refusing right now, judged by the limit itself '
  'rather than by a second copy of its rule. Blocking by IP hash catches honest '
  'typists too, and this is how staff see who is stuck and undo it — the hash is '
  'opaque and expires with the log, so it fixes a false positive rather than '
  'identifying a person.';

revoke all on function public.blocked_lookup_ips(int) from public;
grant execute on function public.blocked_lookup_ips(int) to authenticated;

-- check_lookup_limit is called from a SECURITY DEFINER function owned by the
-- same role, so no new grant is needed — and none is given: it stays out of
-- reach of anon and authenticated, exactly as 0018 left it.
