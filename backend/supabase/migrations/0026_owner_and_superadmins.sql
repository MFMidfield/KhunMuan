-- 0026 · More than one superadmin, but still exactly one owner
-- Plan: docs/plan/05-backend-security.md §admin_users
--
-- Until now `superadmin` was both "the top tier" and "the one row nobody can
-- touch through the API". Those are two different jobs and 0002/0009 gave them
-- to the same flag, which is why the staff screen could only ever offer one
-- role: a second superadmin was refused by the partial unique index, and any
-- write mentioning the tier at all was refused by RLS.
--
-- This migration splits them. `is_owner` takes over the untouchable-row job —
-- one such row, never writable through PostgREST, still changeable only by a
-- direct database statement. `role = 'superadmin'` goes back to meaning just
-- the permission tier, and the owner can now grant it to someone else from the
-- back office.
--
-- The split is what keeps the recovery path from 0008 intact. If a superadmin
-- account is compromised it can remove other superadmins, but it cannot remove,
-- demote or deactivate the owner, so there is always a way back in. A flat
-- model where every superadmin can delete every other one would not have that.

alter table public.admin_users
  add column is_owner boolean not null default false;

comment on column public.admin_users.is_owner is
  'The one row that cannot be written through the API, in either direction. '
  'Distinct from role: the owner is a superadmin, but not every superadmin is '
  'the owner. Changing who it is requires a direct database statement.';

-- The row seeded by 0008 is the owner. Written as a general statement rather
-- than pinned to an address so it is correct on a database whose superadmin was
-- already moved by hand, as 0008 describes.
update public.admin_users
   set is_owner = true
 where role = 'superadmin';

-- The tier is no longer unique; the owner is.
drop index if exists public.admin_users_one_superadmin;

create unique index admin_users_one_owner
  on public.admin_users ((true))
  where is_owner;

-- The owner is always in the top tier. Without this, a database statement could
-- leave an owner sitting at `admin` and lock the shop out of its own back
-- office — the one case RLS cannot catch, because RLS never sees that write.
alter table public.admin_users
  add constraint admin_users_owner_is_superadmin
  check (not is_owner or role = 'superadmin');

-- ---------------------------------------------------------------------------
-- The write policy, restated against is_owner
-- ---------------------------------------------------------------------------

-- Same shape as 0009, with `role <> 'superadmin'` replaced by `not is_owner`.
-- The clause is on both sides for the same reason it was before: `using`
-- decides which rows may be touched, `with check` decides what they may become,
-- and only having both stops a row from being edited into — or out of — the
-- protected state. Here that means no session can promote itself to owner and
-- none can strip the owner of the flag.
drop policy admin_users_super_write on public.admin_users;

create policy admin_users_super_write on public.admin_users
  for all to authenticated
  using ((select public.is_superadmin()) and not is_owner)
  with check ((select public.is_superadmin()) and not is_owner);
