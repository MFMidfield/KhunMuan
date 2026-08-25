-- Property test for the order code · docs/plan/03-order-code.md §4
--
-- Walks the ENTIRE domain and asserts the properties the construction claims.
-- These are not "probably true" properties — the pipeline is a composition of
-- bijections, so a single duplicate anywhere means the construction is broken,
-- not that we got unlucky. Run it after any change to migration 0010.
--
--   cd backend && npm run test:order-code
--
-- Failures raise; success prints one line per property.

\set ON_ERROR_STOP on
\timing on

do $$
declare
  s          public.shop_settings;
  letters    text;
  digits     text;
  m          bigint;
  half_bits  int;
  key        bytea;
  n          bigint;
  x          bigint;
  walks      bigint := 0;
  total_walk bigint := 0;
  distinct_codes bigint;
  bad_shape  bigint;
  wrong_len  bigint;
begin
  select * into s from public.shop_settings where id = 1;

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

  raise notice 'domain: alphabet=% letters=% digits=% length=% M=% half_bits=%',
    s.order_code_alphabet, length(letters), length(digits),
    s.order_code_length, m, half_bits;

  create temp table code_walk (code text not null) on commit drop;

  n := 0;
  while n < m loop
    x := private.fpe_feistel(n, key, half_bits);
    walks := 1;
    while x >= m loop
      x := private.fpe_feistel(x, key, half_bits);
      walks := walks + 1;
    end loop;
    total_walk := total_walk + walks;

    insert into code_walk (code)
    values (private.unrank_mixed(x, letters, digits, s.order_code_length));

    n := n + 1;
  end loop;

  -- 1 · Every sequence value produced a code, and no two are the same.
  select count(distinct cw.code) into distinct_codes from code_walk cw;
  if distinct_codes <> m then
    raise exception 'COLLISION: % distinct codes from % inputs (% duplicates)',
      distinct_codes, m, m - distinct_codes;
  end if;
  raise notice 'ok · % inputs produced % distinct codes, zero collisions', m, distinct_codes;

  -- 2 · Every code mixes letters and digits. This is what makes all-letter
  --     profanity, repeated characters and all-digit unlucky numbers
  --     structurally impossible rather than merely blocklisted.
  select count(*) into bad_shape
    from code_walk cw
   where cw.code !~ '[A-Z]' or cw.code !~ '[0-9]';
  if bad_shape <> 0 then
    raise exception 'SHAPE: % codes are all-letter or all-digit', bad_shape;
  end if;
  raise notice 'ok · every code contains at least one letter and one digit';

  -- 3 · Length is exactly as configured.
  select count(*) into wrong_len
    from code_walk cw
   where length(cw.code) <> s.order_code_length;
  if wrong_len <> 0 then
    raise exception 'LENGTH: % codes are not % characters', wrong_len, s.order_code_length;
  end if;
  raise notice 'ok · every code is % characters', s.order_code_length;

  -- 4 · No code uses a character outside the configured alphabet — in
  --     particular none of the misread-prone I L O 0 1.
  if exists (select 1 from code_walk cw
              where cw.code ~ ('[^' || s.order_code_alphabet || ']')) then
    raise exception 'ALPHABET: a code used a character outside the alphabet';
  end if;
  raise notice 'ok · no code uses I, L, O, 0, 1 or anything else off-alphabet';

  -- 5 · The specific unreachables named in doc 03 §4.
  if exists (select 1 from code_walk cw where cw.code in ('FUCK', '6666', 'AAAA')) then
    raise exception 'UNREACHABLE: FUCK, 6666 or AAAA was generated';
  end if;
  raise notice 'ok · FUCK, 6666 and AAAA are unreachable';

  -- 6 · Cycle-walk cost. Doc 03 §4 measured 1.639; a large drift means the
  --     domain sizing changed and the walk is doing more work than documented.
  raise notice 'ok · average cycle-walk iterations: %',
    round(total_walk::numeric / m, 3);

  raise notice 'ALL ORDER CODE PROPERTIES HOLD';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sizing is derived, not hard-coded
-- ---------------------------------------------------------------------------
--
-- Doc 03 §5 calls hard-coding the 10-bit half a trap: at length 5 the halves
-- are 13 bits, not 10. Walking 22 million codes would take twenty minutes, so
-- this asserts the sizing and samples the pipeline instead of exhausting it.

do $$
declare
  letters   text := 'ABCDEFGHJKMNPQRSTUVWXYZ';
  digits    text := '23456789';
  key       bytea;
  d         record;
  expected  record;
  n         bigint;
  x         bigint;
  sampled   int := 0;
  distinct_sampled int;
begin
  select k.key into key from private.order_code_key k where k.id = 1;

  for expected in
    select * from (values (4, 639584::bigint, 10),
                          (5, 22160040::bigint, 13),
                          (6, 739205648::bigint, 15)) v(len, m, half)
  loop
    select * into d from private.order_code_domain(letters, digits, expected.len) d;

    if d.m <> expected.m or d.half_bits <> expected.half then
      raise exception 'SIZING len=%: got M=% half=%, expected M=% half=%',
        expected.len, d.m, d.half_bits, expected.m, expected.half;
    end if;
    raise notice 'ok · length % → M=% half_bits=%', expected.len, d.m, d.half_bits;
  end loop;

  -- Sample 20,000 codes at length 5 and confirm they are distinct and correctly
  -- shaped. Not a proof — the full walk at length 4 is the proof — but it would
  -- catch a half-width that was quietly wrong for the larger domain.
  select * into d from private.order_code_domain(letters, digits, 5) d;

  create temp table code_sample (code text not null) on commit drop;

  n := 0;
  while n < 20000 loop
    x := private.fpe_feistel(n, key, d.half_bits);
    while x >= d.m loop
      x := private.fpe_feistel(x, key, d.half_bits);
    end loop;
    insert into code_sample (code) values (private.unrank_mixed(x, letters, digits, 5));
    sampled := sampled + 1;
    n := n + 1;
  end loop;

  select count(distinct cs.code) into distinct_sampled from code_sample cs;
  if distinct_sampled <> sampled then
    raise exception 'SAMPLE len=5: % distinct of % sampled', distinct_sampled, sampled;
  end if;

  if exists (select 1 from code_sample cs
              where cs.code !~ '[A-Z]' or cs.code !~ '[0-9]' or length(cs.code) <> 5) then
    raise exception 'SAMPLE len=5: a code was mis-shaped';
  end if;

  raise notice 'ok · % length-5 codes sampled, all distinct and correctly shaped', sampled;
  raise notice 'SIZING IS DERIVED FROM THE ALPHABET, NOT HARD-CODED';
end;
$$;

-- ---------------------------------------------------------------------------
-- A blocked code is skipped, not retried into
-- ---------------------------------------------------------------------------
--
-- Skipping burns the sequence value rather than reusing it. That is what keeps
-- the map injective; a "draw again with the same n" would not be a bijection.

do $$
declare
  seq_before bigint;
  doomed     text;
  got        record;
begin
  -- Peek at the code the next sequence value would produce, then forbid it.
  select * into got from private.next_order_code();
  doomed := got.out_code;

  insert into public.order_code_blocklist (pattern, match_type, note)
  values (doomed, 'exact', 'property test');

  -- Rewind so the very next draw hits the now-blocked value.
  perform setval('public.order_code_seq', got.out_seq, false);
  seq_before := got.out_seq;

  select * into got from private.next_order_code();

  if got.out_code = doomed then
    raise exception 'BLOCKLIST: blocked code % was issued anyway', doomed;
  end if;
  if got.out_seq <= seq_before then
    raise exception 'BLOCKLIST: sequence went backwards (% -> %)', seq_before, got.out_seq;
  end if;

  raise notice 'ok · blocked code % skipped; sequence advanced % → %',
    doomed, seq_before, got.out_seq;

  if private.order_code_blocked('AB66' || '6') is not true then
    raise exception 'BLOCKLIST: the seeded *666 suffix rule did not match';
  end if;
  if private.order_code_blocked('6662') is not false then
    raise exception 'BLOCKLIST: the suffix rule matched a non-suffix';
  end if;
  raise notice 'ok · the seeded *666 suffix rule matches suffixes and nothing else';

  delete from public.order_code_blocklist where note = 'property test';
  raise notice 'BLOCKLIST BEHAVES';
end;
$$;
