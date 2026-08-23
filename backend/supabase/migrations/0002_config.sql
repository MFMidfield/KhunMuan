-- 0002 · Shop settings, staff allow-list, identity helpers
-- Plan: docs/plan/01-data-model.md §2, docs/plan/05-backend-security.md §1

-- ---------------------------------------------------------------------------
-- shop_today() — "today" is a shop concept, not a UTC one (doc 01 §7)
-- ---------------------------------------------------------------------------

create or replace function public.shop_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;

comment on function public.shop_today() is
  'The shop-local business date. Every default, report grouping and stock '
  'lookup goes through this. Change here if the shop ever sells past midnight.';

-- ---------------------------------------------------------------------------
-- shop_settings — exactly one row, id = 1
-- ---------------------------------------------------------------------------

create table public.shop_settings (
  id                       int primary key,
  is_open                  boolean not null default false,
  closed_message           text,
  delivery_enabled         boolean not null default true,
  -- doc 06 Q14: when true, advance_order refuses ready -> handed_over unless
  -- the caller supplies the order's own code. Default on, because wrong
  -- handover is one of the four failures this system exists to remove.
  require_code_on_handover boolean not null default true,
  -- The order-code "range" the superadmin controls (doc 03 §6). I, L, O, 0 and
  -- 1 are deliberately absent: they are misread across a noisy counter.
  order_code_alphabet      text not null
                             default 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  order_code_length        int not null default 4,
  line_notify_enabled      boolean not null default false,
  updated_by               uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint shop_settings_singleton check (id = 1),
  constraint shop_settings_code_length check (order_code_length between 3 and 12),
  -- Every alphabet must be able to produce a mixed letter+digit code, or code
  -- generation has no valid output at all (doc 03 §2).
  constraint shop_settings_alphabet_mixed check (
    order_code_alphabet ~ '[A-Z]' and order_code_alphabet ~ '[0-9]'
  )
);

comment on table public.shop_settings is
  'Singleton configuration row. There is no delivery_fee here — the fee lives '
  'on delivery_zones (doc 06 Q7).';

insert into public.shop_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- admin_users — the staff allow-list
-- ---------------------------------------------------------------------------

create table public.admin_users (
  id           uuid primary key default gen_random_uuid(),
  -- Always lower-case: normalised by a trigger on write, never by the caller.
  -- GoTrue already stores auth.users.email lower-cased, so the two sides match
  -- exactly with plain text equality and no extension in the picture.
  email        text not null unique check (email = lower(email)),
  display_name text not null,
  role         public.admin_role not null default 'admin',
  is_active    boolean not null default true,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  invited_by   uuid references public.admin_users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.admin_users is
  'Authorisation source of truth. Roles are resolved here at query time rather '
  'than stamped on the JWT, so removing someone takes effect immediately '
  'instead of when their hour-long token expires (doc 05 §1).';

-- Exactly one superadmin, enforced by the database rather than by convention.
create unique index admin_users_one_superadmin
  on public.admin_users ((true))
  where role = 'superadmin';

create index admin_users_invited_by_idx on public.admin_users (invited_by);

alter table public.shop_settings
  add constraint shop_settings_updated_by_fkey
  foreign key (updated_by) references public.admin_users (id) on delete set null;

create index shop_settings_updated_by_idx on public.shop_settings (updated_by);

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the lookup itself is not subject to admin_users' own RLS
-- policies, which would otherwise be circular. The function can only ever
-- return the caller's own row: the where clause is pinned to the JWT email.
create or replace function private.current_admin()
returns public.admin_users
language sql
stable
security definer
set search_path = ''
as $$
  select a.*
    from public.admin_users a
   where a.email = lower((select auth.jwt()) ->> 'email')
     and a.is_active
   limit 1;
$$;

-- is_admin() and is_superadmin() are plain STABLE functions, so they execute as
-- the caller and the caller therefore needs to reach into `private`. Usage on
-- the schema alone exposes nothing: every function in it is revoked from public
-- and granted back one at a time, and current_admin() can only ever return the
-- caller's own row.
grant usage on schema private to authenticated;

revoke all on function private.current_admin() from public;
grant execute on function private.current_admin() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (private.current_admin()).id is not null;
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (private.current_admin()).role = 'superadmin';
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_superadmin() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_superadmin() to authenticated;

-- ---------------------------------------------------------------------------
-- First sign-in: link the auth user to their allow-list row
-- ---------------------------------------------------------------------------

-- Google OAuth succeeds for any Google account; Supabase has no idea who is
-- staff. These triggers link matching rows and ignore everyone else, so access
-- is granted by adding an email to the allow-list first — the correct order.
--
-- auth_user_id is informational: authorisation resolves by email in
-- current_admin(). Keeping the link accurate anyway is what makes the staff
-- screen able to say who has actually signed in at least once.
create or replace function private.link_admin_on_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.admin_users
     set auth_user_id = new.id,
         updated_at   = now()
   where email = lower(new.email)
     and auth_user_id is distinct from new.id;
  return new;
end;
$$;

-- INSERT *or* UPDATE OF email, and the update half is not defensive padding:
-- GoTrue creates the auth.users row first and fills the email in a second
-- statement, so an insert-only trigger sees a null email and links nothing.
create trigger link_admin_on_auth_user_created
  after insert or update of email on auth.users
  for each row
  execute function private.link_admin_on_auth_user();

-- Two jobs, one BEFORE trigger.
--
-- 1. Normalise the address. The back office is a text box typed by a human;
--    "Somchai@Gmail.com" and "somchai@gmail.com" are the same account and must
--    not become two allow-list rows, one of which never matches a JWT.
-- 2. The mirror of the trigger above: someone signs in, is refused, and is
--    added to the allow-list afterwards. Their auth.users row already exists
--    and never changes again, so nothing on that side would ever fire.
create or replace function private.normalize_and_link_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));

  if new.auth_user_id is null then
    select u.id into new.auth_user_id
      from auth.users u
     where lower(u.email) = new.email
     limit 1;
  end if;

  return new;
end;
$$;

create trigger normalize_and_link_admin_write
  before insert or update of email on public.admin_users
  for each row
  execute function private.normalize_and_link_admin();
