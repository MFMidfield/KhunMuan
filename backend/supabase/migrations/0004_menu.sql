-- 0004 · Sets, fillings, add-ons, daily stock
-- Plan: docs/plan/01-data-model.md §3

create table public.sets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  piece_quota int not null check (piece_quota > 0),
  price       numeric(10, 2) not null check (price >= 0),
  image_path  text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  daily_limit int check (daily_limit > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.sets.piece_quota is
  'The number of roll pieces the customer distributes across fillings.';

-- No price column, deliberately: every filling costs the same and that cost is
-- inside sets.price. If that ever changes, add a nullable surcharge column —
-- the schema is not painted into a corner.
create table public.fillings (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  image_path        text not null,
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  default_daily_qty int check (default_daily_qty >= 0),
  max_per_set       int check (max_per_set > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.fillings.image_path is
  'Required. Every filling has a real photo — that was a shop requirement, not '
  'a nice-to-have.';

create table public.addons (
  id         uuid primary key default gen_random_uuid(),
  -- Named `kind`, not `group`: GROUP is a reserved word in SQL and would have
  -- to be double-quoted at every single use site, forever.
  kind       public.addon_group not null,
  name       text not null,
  price      numeric(10, 2) not null default 0 check (price >= 0),
  max_qty    int not null default 5 check (max_qty > 0),
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.addons.price is
  'Zero means free. Whether an add-on carries a charge is configured per '
  'add-on in the back office.';

create table public.filling_stock_daily (
  filling_id    uuid not null references public.fillings (id) on delete cascade,
  service_date  date not null default public.shop_today(),
  qty_total     int not null check (qty_total >= 0),
  qty_remaining int not null check (qty_remaining >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (filling_id, service_date),
  constraint filling_stock_remaining_lte_total check (qty_remaining <= qty_total)
);

comment on constraint filling_stock_remaining_lte_total
  on public.filling_stock_daily is
  'qty_remaining >= 0 is the last line of defence against overselling; the row '
  'lock in place_order is the first. Both are load-bearing.';
