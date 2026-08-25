# 03 · The order code

## 1. What the code has to do

One 4-character code carries three jobs at once:

1. **Human label.** Staff read it aloud, write it on a box, type it into a
   search field. Short, unambiguous, hard to mis-hear.
2. **Global uniqueness, forever.** Not per day. Two orders may never share a
   code across the entire life of the shop.
3. **Access key.** It is the only thing standing between a stranger and someone
   else's order, because there is no customer login and no token in the link.

Section 8 is honest about what job 3 costs.

## 2. Constraints (all decided)

| Rule | Value |
|------|-------|
| Length | 4 characters, superadmin-configurable to 5 or 6 |
| Alphabet | `A–Z` and `2–9` minus `I L O 0 1` → **31 characters** |
| Composition | **Every code must contain at least one letter and at least one digit** |
| Blocklist | English profanity, Thai karaoke profanity, unlucky number patterns; superadmin-editable |
| Uniqueness | Forever, never reused |
| Display | Run together, no separator: `K7P2` |
| Input | Four separate boxes, auto-uppercased |
| Expiry | Stops resolving 24 hours after `handed_over` |

### What the mixed letter+digit rule buys for free

It was asked for as a readability nicety. It turns out to do most of the
blocklist's work by itself:

- **All-letter profanity becomes impossible.** `FUCK`, `SHIT`, `CUNT` and every
  other pure-letter word cannot be generated, because a code with no digit is
  not in the output set at all. Same for Thai karaoke spellings that use only
  letters.
- **Repeated-character codes become impossible.** `AAAA`, `7777` — a code of one
  repeated character is either all letters or all digits, so both are excluded.
- **All-digit unlucky numbers become impossible.** `6666`, `4444`.

What still needs an explicit blocklist is the mixed leetspeak and the mixed
unlucky patterns — `5H1T` is already dead (`1` is not in the alphabet) but
`5HIT` is not, and `X666` is not. That list is short and superadmin-editable.

### Code space

```
31⁴  = 923,521   all 4-character codes
23⁴  = 279,841   pure-letter codes        (excluded)
 8⁴  =   4,096   pure-digit codes         (excluded)
─────────────────
       639,584   usable codes
```

At 100 orders a day that is 17 years of codes. Length 5 gives 22,160,040 if it
is ever needed.

## 3. Why the obvious approaches are wrong

**Random-and-retry.** Generate 4 random characters, insert, catch the unique
violation, try again. It works, and it degrades: as the used fraction of the
space grows, so does the retry count, and under concurrent inserts the retries
collide with each other. It gives a probability, not a guarantee, and the
failure mode is a mysterious insert timeout months from now.

**Counter, encoded.** `AAA2`, `AAA3`, `AAA4`. Unique, no retries, and completely
predictable: anyone who orders once knows every code before and after theirs.
Useless as an access key.

## 4. The approach: a keyed permutation, then an unranking

Take the counter's guarantee — uniqueness by construction — and destroy its
predictability with a **bijection**. A strictly increasing sequence number is
passed through a keyed permutation, then decoded into the constrained code set.
Because every stage is a bijection, distinct inputs give distinct outputs:
uniqueness is a property of the construction, not something the database checks.
Because the permutation is keyed, the output sequence is indistinguishable from
random without the key.

Three stages:

```
nextval  ──►  [1] keyed Feistel + cycle walk  ──►  [2] unrank into mixed set  ──►  K7P2
 n ∈ [0,M)         permutation on [0,M)              bijection [0,M) → codes
```

### Stage 1 — keyed Feistel network with cycle walking

Let `M` = 639,584, the number of usable codes. Pick `k`, the smallest even
number of bits with `2^k ≥ M`; here `k = 20`, so each Feistel half is 10 bits.

1. Round function `F(i, r) = HMAC-SHA256(key, i ‖ r)` truncated to 10 bits.
2. Feistel-encrypt:

   ```
   L₀ = n >> 10 ,  R₀ = n & 0x3FF
   for i in 1..4:
       Lᵢ = Rᵢ₋₁
       Rᵢ = Lᵢ₋₁ XOR F(i, Rᵢ₋₁)
   out = (L₄ << 10) | R₄
   ```

   Four Feistel rounds are a permutation on `[0, 2²⁰)` regardless of what `F`
   does — invertibility comes from the structure, not from `F`. No two inputs can
   collide.
3. **Cycle-walk** back into range: while `out ≥ M`, feed `out` through the same
   Feistel again. Restricting a permutation to a subset by re-encrypting
   out-of-range values is still a permutation on that subset. Measured expected
   iterations: **1.639**.

> **Why cycle walking must happen here and not after unranking.** It is tempting
> to unrank first and re-permute whenever the resulting code looks wrong. That
> breaks injectivity: if `n₁ ∉ S` and `E(n₁) = n₂ ∉ S` and `E(n₂) = s ∈ S`, then
> both `n₁` and `n₂` map to `s`. Cycle walking is only a permutation when the
> *input* is already in the target set. Hence the ordering above — walk into
> `[0, M)` first, and only then decode.

### Stage 2 — unranking into the mixed set

A 4-character code has a letter/digit pattern in `{L,D}⁴`. Excluding `LLLL` and
`DDDD` leaves **14 patterns**. Pattern `p` with `j` letters holds `23^j · 8^(4−j)`
codes. Enumerate the 14 patterns in a fixed order with cumulative counts; to
unrank `r`, find the pattern whose cumulative range contains `r`, then decompose
the remainder in mixed radix — base 23 at letter positions, base 8 at digit
positions.

This is an exact bijection from `[0, M)` onto the set of valid codes. Composed
with stage 1, the whole pipeline is a bijection.

### Stage 3 — the blocklist

After unranking, if the code is in the blocklist, discard it and draw the next
sequence value. Skipping sequence values keeps the mapping injective — it only
forfeits a handful of codes out of 639,584. The blocklist is small enough that
this costs at most a few extra draws across the shop's entire lifetime.

### Verified

The construction was simulated over the full domain before this document was
written:

- The 20-bit Feistel is a permutation on all 1,048,576 inputs.
- All 639,584 sequence values produced 639,584 **distinct** codes — zero
  collisions.
- Every generated code contained at least one letter and at least one digit.
- `FUCK`, `6666` and `AAAA` were confirmed unreachable.
- Average cycle-walk iterations: 1.639.
- First twelve codes: `KD4P 6TRD B855 B5UX YW3H 896X 33PD 9SSF DKB5 22M5 TN2G 8TVH`
  — sequential inputs, no visible relationship between outputs.

This test belongs in the repo as a property test so a future refactor cannot
silently break uniqueness.

## 5. Implementation sketch

```sql
create extension if not exists pgcrypto;
create sequence order_code_seq start 0 minvalue 0;

-- Round function: low HALF bits of HMAC-SHA256(key, round ‖ half)
create or replace function _fpe_round(p_round int, p_half int, p_key bytea, p_mask int)
returns int language sql immutable strict as $$
  select ( ('x' || encode(
             substring(hmac(p_round::text || ':' || p_half::text, p_key, 'sha256')
                       from 1 for 4),
             'hex'))::bit(32)::int ) & p_mask;
$$;

-- 4-round balanced Feistel on (2 * p_half_bits) bits
create or replace function _fpe_feistel(p_x int, p_key bytea, p_half_bits int)
returns int language plpgsql immutable strict as $$
declare mask int := (1 << p_half_bits) - 1;
        l int := p_x >> p_half_bits;
        r int := p_x & mask;
        t int;
begin
  for i in 1..4 loop
    t := r;
    r := l # _fpe_round(i, r, p_key, mask);   -- '#' is XOR in Postgres
    l := t;
  end loop;
  return (l << p_half_bits) | r;
end $$;

-- Unrank an index into the mixed letter+digit code set
create or replace function _unrank_mixed(p_r bigint, p_letters text, p_digits text, p_len int)
returns text language plpgsql immutable strict as $$
declare nl int := length(p_letters);
        nd int := length(p_digits);
        pat int; cnt bigint; r bigint := p_r;
        out text := ''; is_letter boolean;
begin
  -- walk patterns 1 .. 2^len-2 (skips all-digits = 0 and all-letters = 2^len-1)
  for pat in 1 .. (1 << p_len) - 2 loop
    cnt := 1;
    for i in 0 .. p_len - 1 loop
      cnt := cnt * case when (pat >> i) & 1 = 1 then nl else nd end;
    end loop;
    exit when r < cnt;
    r := r - cnt;
  end loop;

  for i in 0 .. p_len - 1 loop
    is_letter := ((pat >> i) & 1) = 1;
    if is_letter then
      out := substr(p_letters, (r % nl)::int + 1, 1) || out;
      r := r / nl;
    else
      out := substr(p_digits,  (r % nd)::int + 1, 1) || out;
      r := r / nd;
    end if;
  end loop;
  return out;
end $$;
```

`next_order_code()` wraps these: read `shop_settings`, split the alphabet into
letters and digits, compute `M`, `nextval`, Feistel + cycle-walk into `[0, M)`,
unrank, check the blocklist, return `(seq, code)`.

### Two corrections to the sketch above

The sketch is otherwise accurate, but it does not run as written. Both problems
are in migration `0010_order_code.sql`:

1. **`hmac(text, bytea, text)` does not exist.** pgcrypto offers
   `hmac(text,text,text)` and `hmac(bytea,bytea,text)`; the sketch mixes a text
   payload with a bytea key and matches neither overload. The payload goes
   through `convert_to(…, 'UTF8')`. The function is also called as
   `extensions.hmac`, because everything here runs with `search_path = ''` and
   would otherwise not find it — the same trap that made emails compare
   case-sensitively in doc 01 §2.
2. **`for pat in 1 .. n loop` declares its own loop variable**, shadowing the
   `pat` in the `declare` block. The pattern index is therefore out of scope —
   and NULL — by the time the mixed-radix decomposition needs it, so every code
   would have come out empty. The loop is hand-rolled with an explicit
   increment instead.

`place_order` calls it and inserts both `code` and `code_seq`. The unique index
on `orders.code` stays as a backstop for the settings-change case below.

### Key management

The key is 32 random bytes in `private.order_code_key`, generated by the
migration itself with `gen_random_bytes(32)`. It never reaches the client:
the table lives in the non-exposed `private` schema and is read only by
`SECURITY DEFINER` functions.

Generating it per database rather than injecting `app.order_code_key` from
Vault was chosen deliberately. A GUC read makes the function non-`IMMUTABLE`,
needs `ALTER DATABASE … SET` privileges that a hosted project does not hand
out freely, and adds a way for an environment to come up with **no** key — at
which point either codes become predictable or ordering stops working. A row
that the migration creates cannot be missing. Every environment still gets its
own key, so codes are not comparable across environments, which is the property
that mattered.

Rotating the key is an `UPDATE`. Already-issued codes are stored rather than
recomputed, so they keep resolving; a rotation could in principle re-issue an
existing code, and the unique index on `orders.code` is the backstop, exactly as
for an alphabet change.

### Sizing note

Derive `k` from the configured alphabet and length rather than hard-coding 20.
At length 5, `M = 22,160,040` and `k = 26` (13-bit halves, expected walk ≈ 1.51).
Build `_fpe_feistel` with the half-width as a parameter from the start;
hard-coding 10 is a trap.

## 6. What the superadmin controls

The "range" screen exposes four things:

| Control | Effect |
|---------|--------|
| Alphabet | Add or remove characters. Letters and digits are shown as two separate pickers, since the mixed rule needs both non-empty |
| Length | 4 → 5 → 6. Shows the resulting code-space size live |
| Blocklist | Free-form list of forbidden codes and suffix patterns, seeded with the profanity and unlucky-number lists |
| Consumption | Read-only: codes issued vs. total space, as a count and a percentage, with an estimated years-remaining figure at the current rate |

Changing the alphabet or length changes the domain, so:

- Old codes stay valid — they are stored, not recomputed.
- A newly generated code could in principle equal an old one. The unique index
  catches it and `place_order` retries with the next sequence value. This is the
  only path on which a retry loop can ever execute.
- `orders.code_epoch` increments on every settings change so history stays
  interpretable.
- Shrinking the space below what has already been consumed is blocked in the UI.

## 7. Lookup, input and expiry

- **Display** runs the characters together — `K7P2` — with tabular numerals so
  the width does not jump between codes.
- **Input** uses four separate boxes with `inputMode="text"`,
  `autoCapitalize="characters"`, auto-advance on entry and auto-back on
  backspace. Pasting a full code fills all four. Every keystroke is uppercased,
  and `I L O 0 1` are silently mapped to their likely intended neighbours
  (`I`→`J`? no — they are simply rejected with an inline hint, since guessing the
  user's intent on an access key is worse than asking).
- **Expiry**: `lookup_order` refuses codes whose order reached `handed_over`,
  `cancelled` or `rejected` more than 24 hours ago. This shrinks the live target
  set to what is actually in flight, which is the single biggest lever on
  section 8.

## 8. Security: the honest part

639,584 usable codes. That is a lot for a human guessing and not a lot for a
script.

Without rate limiting, an attacker at 20 requests per second enumerates
everything in about 9 hours. They do not need everything — only one *live*
order. With, say, 30 orders live at once, a random guess hits with probability
`30 / 639,584 ≈ 1 in 21,000`, so at 20 req/s the expected first hit is about
**18 minutes**.

A hit exposes the set contents, the fillings, the note, the pickup point and
slot, the status and the total. Names, phone numbers and room numbers are
**withheld** from code-only lookups (below), which is what caps the damage.

### Mitigations (all decided)

1. **Lookup is never a table read.** `orders` has no public `select` policy at
   all. Tracking goes through an Edge Function that hashes the client IP with a
   server-side salt and calls a single RPC. The IP itself is never stored.
2. **Strict rate limit.** 5 lookups per minute per IP hash. Three *misses* in a
   minute triggers a **15-minute** block. A global circuit breaker trips if the
   miss rate across all IPs spikes.
3. **Reduced view for code-only lookups.** The device that placed the order
   holds a `client_token` in `localStorage` and sees everything. A lookup with
   the code alone sees status, order contents, pickup point, slot and total — and
   **never** `customer_name`, `customer_room` or `customer_phone`. A scanner that
   gets lucky learns what someone ordered, not who they are.
4. **24-hour expiry** after handover, as above.
5. **Misses are logged** and surfaced to the superadmin (doc 05 §4).

### Residual risk, stated plainly

With 1–5 in place a determined attacker at the permitted 5 requests per minute
needs, on average, on the order of **70 hours of continuous requests from a
single IP** to hit one live order — and the 15-minute block after three misses
stretches that to months in practice. Distributing across many IPs defeats the
per-IP limit, which is what the global circuit breaker is for. For a campus food
shop this is a reasonable place to land.

The alternative that removes the problem entirely — an opaque high-entropy token
in the tracking link, with the 4-character code kept as the human label — was
considered and **declined**: the shop judged that a link is less convenient for
its customers than typing four characters, and the project is not large enough to
warrant it. That is a legitimate trade-off, recorded here so the reasoning is not
lost. If the shop ever starts taking sensitive delivery details at scale, this is
the first decision to revisit.

## 9. Blocked users and the superadmin

Blocking by IP hash punishes honest typists too. Two things soften it:

- The rate-limit screen shows the shop's phone number and LINE so a locked-out
  customer can just ask staff, who can look the order up with no limit at all.
- The superadmin gets a **blocked list** — IP hash, first and last attempt,
  attempt count, the codes tried — with a one-tap **unblock**. The IP hash is
  opaque and expires with the log, so this is not a way to identify people; it is
  a way to undo a false positive.

Attempt rows older than 24 hours are deleted by a `pg_cron` job.

Admins signed in with Google are **exempt** from rate limiting entirely. They
search from the orders table directly, where RLS already scopes what they can
see, so the enumeration threat does not apply to them.
