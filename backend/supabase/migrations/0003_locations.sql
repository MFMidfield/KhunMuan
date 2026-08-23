-- 0003 · Pickup points, pickup slots, delivery zones
-- Plan: docs/plan/01-data-model.md §2

create table public.pickup_points (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  detail     text,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Slots are templates, not dated rows. How many orders a slot already holds on
-- a given service_date is computed from `orders`, which avoids generating and
-- pruning thousands of dated rows.
create table public.pickup_slots (
  id              uuid primary key default gen_random_uuid(),
  label           text not null,
  starts_at_local time not null,
  capacity        int check (capacity > 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.pickup_slots.capacity is
  'Null means unlimited. Otherwise the maximum orders for this slot per day.';

-- Seeded with a single row. The checkout hides the zone selector while exactly
-- one zone is active, so today the customer sees what a flat fee would have
-- produced. Adding a second zone in the back office makes the selector appear
-- on its own — no migration, no code change (doc 06 Q7).
create table public.delivery_zones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  fee        numeric(10, 2) not null check (fee >= 0),
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.delivery_zones is
  'The delivery fee source. Read at placement time and snapshotted onto '
  'orders.delivery_fee, so raising a fee never rewrites yesterday''s totals.';
