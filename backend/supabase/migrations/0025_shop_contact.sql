-- 0025 · How a customer reaches the shop
-- Plan: docs/plan/04-frontend.md §1 (the landing page at `/`)
--
-- The landing page leads with a phone number, an email address and an Instagram
-- handle. None of the three belongs in a migration as a value: a phone changes
-- when the owner changes SIM, and an Instagram handle changes on a whim. This
-- follows 0016 — the thing that changes becomes a back-office field, and the
-- migration only makes the field exist.
--
-- All three are nullable, and null means "the shop has not filled this in".
-- The landing page renders only what is set rather than showing an empty row,
-- so a shop that has no Instagram simply has no Instagram line.

alter table public.shop_settings
  add column contact_phone     text,
  add column contact_email     text,
  add column contact_instagram text;

-- Format checks, not validation theatre. Each one exists because the landing
-- page turns the value into a link, and a value that cannot become a working
-- link is worse than a missing one: a customer taps it, nothing happens, and
-- they conclude the shop is closed.
alter table public.shop_settings
  -- Digits, spaces, dashes and a leading +. Enough for 08x-xxx-xxxx and for an
  -- international form, and nothing that would break `tel:`.
  add constraint shop_settings_phone_format check (
    contact_phone is null or contact_phone ~ '^\+?[0-9][0-9 ()+-]{5,24}$'
  ),
  add constraint shop_settings_email_format check (
    contact_email is null or contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  -- Stored bare, without the leading @: the interface adds the @ when it
  -- displays it and the URL cannot contain one. Storing it either way and
  -- stripping at read is how half the profiles end up as `@@khunmuan`.
  add constraint shop_settings_instagram_format check (
    contact_instagram is null or contact_instagram ~ '^[A-Za-z0-9._]{1,30}$'
  );

comment on column public.shop_settings.contact_phone is
  'Shown on the landing page as a tel: link. Null hides the line entirely.';

comment on column public.shop_settings.contact_email is
  'Shown on the landing page as a mailto: link. Null hides the line entirely.';

comment on column public.shop_settings.contact_instagram is
  'Handle only, no leading @ — the interface adds it. Null hides the line.';

-- ---------------------------------------------------------------------------
-- What the customer is allowed to read
-- ---------------------------------------------------------------------------
--
-- anon holds a column-level grant on this table, so a new column is invisible
-- to the customer client until it is named here. These three are published on
-- purpose: a shop contact is the opposite of a secret.

grant select (contact_phone, contact_email, contact_instagram)
  on public.shop_settings to anon;
