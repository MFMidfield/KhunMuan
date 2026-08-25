-- 0001 · Extensions, schemas, enums, shared triggers
-- Plan: docs/plan/01-data-model.md §5

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------
--
-- No citext here, deliberately, and it cost a debugging session to learn why:
-- citext's `=` operator lives in the `extensions` schema, and every function
-- that matters in this database runs with `search_path = ''` — the setting that
-- makes SECURITY DEFINER functions safe. With an empty search_path Postgres
-- cannot see that operator, silently falls back to `text = text`, and the
-- comparison becomes CASE-SENSITIVE without raising anything. A staff member
-- whose allow-list address was typed with one capital letter would simply never
-- be recognised. Emails are normalised to lower-case on write instead; see 0002.

-- Security-definer helpers live here, never in `public`. Nothing in this schema
-- is exposed through the Data API; execute rights are granted one function at a
-- time.
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Enums (doc 01 §5)
-- ---------------------------------------------------------------------------

create type public.admin_role as enum ('superadmin', 'admin');

create type public.order_status as enum (
  'pending_confirmation',
  'accepted',
  'cooking',
  'ready',
  'handed_over',
  'cancelled',
  'rejected'
);

create type public.fulfillment_type as enum ('pickup', 'delivery');

create type public.order_source as enum ('web', 'admin');

create type public.payment_method as enum ('cash', 'transfer');

create type public.payment_state as enum (
  'unpaid',
  'slip_uploaded',
  'paid',
  'refunded'
);

create type public.addon_group as enum ('sauce', 'utensil', 'packaging');

-- ---------------------------------------------------------------------------
-- Shared trigger function
-- ---------------------------------------------------------------------------

-- Attached to every mutable table in 0007. Kept here so the tables can be
-- created in any order relative to it.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'Maintains updated_at on every mutable table. Attached in migration 0007.';
