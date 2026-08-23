-- 0010 · The order code
-- Plan: docs/plan/03-order-code.md
--
-- A strictly increasing sequence value is passed through a keyed permutation
-- and then decoded into the constrained code set. Every stage is a bijection,
-- so uniqueness is a property of the construction rather than something the
-- database checks and retries. Because the permutation is keyed, the output
-- sequence is indistinguishable from random without the key.
--
--   nextval ─► [1] keyed Feistel + cycle walk ─► [2] unrank into mixed set ─► K7P2
--    n ∈ [0,M)      permutation on [0,M)            bijection [0,M) → codes

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Length bounds
-- ---------------------------------------------------------------------------

-- Doc 03 §6 offers 4 → 5 → 6. The bound written in 0002 was too generous in
-- both directions: length 3 leaves only 17,112 usable codes, and length 12
-- overflows the integer domain the Feistel network operates on.
alter table public.shop_settings
  drop constraint shop_settings_code_length;
alter table public.shop_settings
  add constraint shop_settings_code_length
  check (order_code_length between 4 and 6);

alter table public.orders
  drop constraint orders_code_check;
alter table public.orders
  add constraint orders_code_check check (code ~ '^[A-Z0-9]{4,6}$');

-- n is an index into [0, M), not a counting number, so it starts at zero.
alter sequence public.order_code_seq minvalue 0 restart with 0;

-- ---------------------------------------------------------------------------
-- Epochs
-- ---------------------------------------------------------------------------

-- Changing the alphabet or the length changes the domain, so a newly generated
-- code could in principle equal an old one. Recording which epoch produced a
-- code keeps history interpretable (doc 03 §6).
alter table public.shop_settings add column code_epoch int not null default 1;
alter table public.orders add column code_epoch int not null default 1;

-- ---------------------------------------------------------------------------
-- The key
-- ---------------------------------------------------------------------------

create table private.order_code_key (
  id         int primary key,
  key        bytea not null,
  created_at timestamptz not null default now(),
  constraint order_code_key_singleton check (id = 1),
  constraint order_code_key_length check (length(key) = 32)
);

comment on table private.order_code_key is
  'Generated per database, so codes are not comparable across environments — '
  'which is correct. Rotating the key is an UPDATE; already-issued codes are '
  'stored rather than recomputed, so they keep resolving. A rotation could in '
  'principle re-issue an existing code, and the unique index on orders.code is '
  'the backstop for exactly that.';

insert into private.order_code_key (id, key)
values (1, extensions.gen_random_bytes(32));

-- ---------------------------------------------------------------------------
-- Blocklist
-- ---------------------------------------------------------------------------

create table public.order_code_blocklist (
  id         uuid primary key default gen_random_uuid(),
  pattern    text not null check (pattern = upper(pattern) and pattern <> ''),
  match_type text not null check (match_type in ('exact', 'prefix', 'suffix', 'contains')),
  note       text,
  created_at timestamptz not null default now(),
  unique (pattern, match_type)
);

comment on table public.order_code_blocklist is
  'The mixed letter+digit rule already makes all-letter profanity, repeated '
  'characters and all-digit unlucky numbers impossible to generate (doc 03 §2). '
  'What is left is the short list of mixed patterns. Blocked codes are skipped '
  'by drawing the next sequence value, which stays injective and forfeits a '
  'handful of codes out of 639,584.';

-- The one pattern doc 06 Q9b treats as given. Everything else in that list is
-- still an open question and is deliberately NOT invented here.
insert into public.order_code_blocklist (pattern, match_type, note)
values ('666', 'suffix', 'doc 06 Q9b — the obvious suffix rule');

-- ---------------------------------------------------------------------------
-- Stage 1 — keyed Feistel network
-- ---------------------------------------------------------------------------

-- Round function: the low `mask` bits of HMAC-SHA256(key, round ‖ half).
create or replace function private.fpe_round(
  p_round int,
  p_half  bigint,
  p_key   bytea,
  p_mask  bigint
)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  -- convert_to, not a bare text argument: pgcrypto exposes hmac(text,text,text)
  -- and hmac(bytea,bytea,text), and the key here is bytea. Mixing the two picks
  -- neither overload.
  select (
    ('x' || encode(
       substring(
         extensions.hmac(
           convert_to(p_round::text || ':' || p_half::text, 'UTF8'),
           p_key,
           'sha256'::text)
         from 1 for 8),
       'hex')
    )::bit(64)::bigint
  ) & p_mask;
$$;

-- Four balanced Feistel rounds are a permutation on [0, 2^(2·half_bits))
-- regardless of what the round function does — invertibility comes from the
-- structure, not from F. No two inputs can collide.
create or replace function private.fpe_feistel(
  p_x         bigint,
  p_key       bytea,
  p_half_bits int
)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  mask bigint := (1::bigint << p_half_bits) - 1;
  l    bigint := p_x >> p_half_bits;
  r    bigint := p_x & mask;
  t    bigint;
begin
  for i in 1..4 loop
    t := r;
    r := l # private.fpe_round(i, r, p_key, mask);  -- '#' is XOR in Postgres
    l := t;
  end loop;
  return (l << p_half_bits) | r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stage 2 — unranking into the mixed set
-- ---------------------------------------------------------------------------

-- A code's letter/digit shape is a bit pattern in {L,D}^len. Dropping the
-- all-letter and all-digit patterns leaves 2^len − 2 of them. Pattern p with j
-- letters holds nl^j · nd^(len−j) codes; walk the patterns in a fixed order
-- with cumulative counts, then decompose the remainder in mixed radix.
--
-- Note the hand-rolled loop rather than `for pat in 1 .. n`: a plpgsql FOR
-- loop declares its own variable, so the pattern index would be out of scope —
-- and NULL — by the time the second half needs it.
create or replace function private.unrank_mixed(
  p_r       bigint,
  p_letters text,
  p_digits  text,
  p_len     int
)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  nl        int := length(p_letters);
  nd        int := length(p_digits);
  max_pat   int := (1 << p_len) - 2;
  pat       int := 1;
  cnt       bigint;
  r         bigint := p_r;
  result    text := '';
  is_letter boolean;
begin
  loop
    if pat > max_pat then
      raise exception 'ORDER_CODE_RANK_OUT_OF_RANGE: %', p_r;
    end if;

    cnt := 1;
    for i in 0 .. p_len - 1 loop
      cnt := cnt * case when (pat >> i) & 1 = 1 then nl else nd end;
    end loop;

    exit when r < cnt;
    r := r - cnt;
    pat := pat + 1;
  end loop;

  for i in 0 .. p_len - 1 loop
    is_letter := ((pat >> i) & 1) = 1;
    if is_letter then
      result := substr(p_letters, (r % nl)::int + 1, 1) || result;
      r := r / nl;
    else
      result := substr(p_digits, (r % nd)::int + 1, 1) || result;
      r := r / nd;
    end if;
  end loop;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Domain sizing
-- ---------------------------------------------------------------------------

-- M = (nl+nd)^len − nl^len − nd^len, and half_bits is the smallest h with
-- 2^(2h) ≥ M. Derived from the configured alphabet every time rather than
-- hard-coded: at length 5 the halves are 13 bits, not 10, and hard-coding is
-- the trap doc 03 §5 warns about.
create or replace function private.order_code_domain(
  p_letters   text,
  p_digits    text,
  p_len       int,
  out m       bigint,
  out half_bits int
)
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  nl int := length(p_letters);
  nd int := length(p_digits);
begin
  if nl = 0 or nd = 0 then
    raise exception 'ORDER_CODE_ALPHABET_NEEDS_BOTH: letters=% digits=%', nl, nd;
  end if;

  m := (nl + nd)::bigint ^ p_len
     - nl::bigint ^ p_len
     - nd::bigint ^ p_len;

  half_bits := 1;
  while (1::bigint << (2 * half_bits)) < m loop
    half_bits := half_bits + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Blocklist check
-- ---------------------------------------------------------------------------

create or replace function private.order_code_blocked(p_code text)
returns boolean
language sql
stable
strict
set search_path = ''
as $$
  select exists (
    select 1
      from public.order_code_blocklist b
     where case b.match_type
             when 'exact'    then p_code = b.pattern
             when 'prefix'   then p_code like b.pattern || '%'
             when 'suffix'   then p_code like '%' || b.pattern
             when 'contains' then p_code like '%' || b.pattern || '%'
           end
  );
$$;

-- ---------------------------------------------------------------------------
-- The generator
-- ---------------------------------------------------------------------------

create or replace function private.next_order_code(
  out out_seq   bigint,
  out out_code  text,
  out out_epoch int
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  s         public.shop_settings;
  letters   text;
  digits    text;
  m         bigint;
  half_bits int;
  key       bytea;
  x         bigint;
  walks     int;
begin
  select * into s from public.shop_settings where id = 1;

  -- The alphabet is one string in settings; the two halves are what the mixed
  -- rule and the unranking both need.
  letters := (select string_agg(c, '' order by ord)
                from unnest(string_to_array(s.order_code_alphabet, null))
                       with ordinality as t(c, ord)
               where c ~ '[A-Z]');
  digits  := (select string_agg(c, '' order by ord)
                from unnest(string_to_array(s.order_code_alphabet, null))
                       with ordinality as t(c, ord)
               where c ~ '[0-9]');

  select d.m, d.half_bits into m, half_bits
    from private.order_code_domain(letters, digits, s.order_code_length) d;

  select k.key into key from private.order_code_key k where k.id = 1;

  loop
    out_seq := nextval('public.order_code_seq');

    if out_seq >= m then
      raise exception 'ORDER_CODE_SPACE_EXHAUSTED: seq % of %', out_seq, m;
    end if;

    -- Cycle-walk into [0, M). Restricting a permutation to a subset by
    -- re-encrypting out-of-range values is still a permutation on that subset —
    -- but only because the input is already in the target set. This is why the
    -- walk happens here and not after unranking (doc 03 §4).
    x := private.fpe_feistel(out_seq, key, half_bits);
    walks := 0;
    while x >= m loop
      x := private.fpe_feistel(x, key, half_bits);
      walks := walks + 1;
      if walks > 1000 then
        raise exception 'ORDER_CODE_WALK_DID_NOT_TERMINATE: seq %', out_seq;
      end if;
    end loop;

    out_code := private.unrank_mixed(x, letters, digits, s.order_code_length);

    -- Skipping a blocked value forfeits one code and keeps the map injective.
    exit when not private.order_code_blocked(out_code);
  end loop;

  out_epoch := s.code_epoch;
end;
$$;

comment on function private.next_order_code() is
  'Returns the next (sequence value, code, epoch). Called only from '
  'place_order, which stores both the code and the sequence value it came from.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function private.fpe_round(int, bigint, bytea, bigint) from public;
revoke all on function private.fpe_feistel(bigint, bytea, int) from public;
revoke all on function private.unrank_mixed(bigint, text, text, int) from public;
revoke all on function private.order_code_domain(text, text, int) from public;
revoke all on function private.order_code_blocked(text) from public;
revoke all on function private.next_order_code() from public;

-- The blocklist is superadmin-only in both directions: it is menu-shaped
-- configuration, and publishing the list of forbidden codes tells an attacker
-- nothing useful but tells a curious customer more than they need.
alter table public.order_code_blocklist enable row level security;

grant select, insert, update, delete on public.order_code_blocklist to authenticated;

create policy order_code_blocklist_super_all on public.order_code_blocklist
  for all to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));
