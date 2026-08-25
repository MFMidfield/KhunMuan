-- 0005 · Orders and their children
-- Plan: docs/plan/01-data-model.md §4

-- The counter every order code is derived from. The code itself is a keyed
-- permutation of this value, so the sequence being visible and monotonic tells
-- an outsider nothing about the code (doc 03 §4).
create sequence public.order_code_seq as bigint start with 1 increment by 1;

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  -- Stored as text, not char(4): shop_settings.order_code_length is
  -- superadmin-configurable, and a fixed-width type would contradict that the
  -- moment the length changed. char(n) also pads with trailing spaces, which
  -- makes every comparison a small trap.
  code              text not null unique
                      check (code ~ '^[A-Z0-9]{3,12}$'),
  code_seq          bigint not null unique,
  service_date      date not null default public.shop_today(),
  status            public.order_status not null default 'pending_confirmation',
  fulfillment       public.fulfillment_type not null,

  pickup_point_id   uuid references public.pickup_points (id) on delete restrict,
  pickup_slot_id    uuid references public.pickup_slots (id) on delete restrict,

  delivery_zone_id  uuid references public.delivery_zones (id) on delete restrict,
  delivery_location text,

  customer_name     text,
  customer_room     text,
  customer_phone    text,
  note              text,

  subtotal          numeric(10, 2) not null check (subtotal >= 0),
  delivery_fee      numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  total             numeric(10, 2) not null check (total >= 0),

  claimed_by        uuid references public.admin_users (id) on delete set null,
  claimed_at        timestamptz,
  created_by_admin  uuid references public.admin_users (id) on delete set null,
  source            public.order_source not null default 'web',
  cancelled_reason  text,
  version           int not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint orders_fulfillment_fields check (
    (fulfillment = 'pickup'
       and pickup_point_id is not null
       and pickup_slot_id is not null)
    or
    (fulfillment = 'delivery'
       and delivery_zone_id is not null
       and delivery_location is not null
       and customer_name is not null
       and customer_phone is not null)
  ),
  constraint orders_total_matches check (total = subtotal + delivery_fee),
  constraint orders_claim_pair check (
    (claimed_by is null and claimed_at is null)
    or (claimed_by is not null and claimed_at is not null)
  )
);

comment on table public.orders is
  'Prices are snapshotted here, never joined live from sets. When the '
  'superadmin raises a price next month, last week''s revenue must not change.';

comment on column public.orders.version is
  'Optimistic concurrency token. advance_order takes an expected_version and '
  'fails with STALE_ORDER when it does not match — on a six-person realtime '
  'board, two people tapping the same button a second apart is normal.';

-- ---------------------------------------------------------------------------
-- order_items — one row per configured set in the cart
-- ---------------------------------------------------------------------------

create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  set_id      uuid references public.sets (id) on delete set null,
  set_name    text not null,
  piece_quota int not null check (piece_quota > 0),
  unit_price  numeric(10, 2) not null check (unit_price >= 0),
  quantity    int not null default 1 check (quantity > 0),
  line_total  numeric(10, 2) not null check (line_total >= 0),
  note        text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.order_items.set_id is
  'Reference only. Display uses the snapshot columns, so the kitchen ticket '
  'survives a rename or a deletion.';

create table public.order_item_fillings (
  order_item_id uuid not null
                  references public.order_items (id) on delete cascade,
  filling_id    uuid not null references public.fillings (id) on delete restrict,
  filling_name  text not null,
  qty           int not null check (qty > 0),
  primary key (order_item_id, filling_id)
);

comment on table public.order_item_fillings is
  'Invariant, validated inside place_order and re-checked by a deferred '
  'trigger: sum(qty) = order_items.piece_quota, per item.';

create table public.order_item_addons (
  order_item_id uuid not null
                  references public.order_items (id) on delete cascade,
  addon_id      uuid not null references public.addons (id) on delete restrict,
  addon_name    text not null,
  unit_price    numeric(10, 2) not null check (unit_price >= 0),
  qty           int not null check (qty > 0),
  primary key (order_item_id, addon_id)
);

-- ---------------------------------------------------------------------------
-- payments — one row per order
-- ---------------------------------------------------------------------------

create table public.payments (
  order_id         uuid primary key references public.orders (id) on delete cascade,
  method           public.payment_method not null,
  state            public.payment_state not null default 'unpaid',
  slip_path        text,
  slip_uploaded_at timestamptz,
  confirmed_by     uuid references public.admin_users (id) on delete set null,
  confirmed_at     timestamptz,
  amount           numeric(10, 2) not null check (amount >= 0),
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.payments is
  'Payment state is a column, not a memory. cash goes unpaid -> paid at '
  'handover; transfer goes unpaid -> slip_uploaded -> paid.';

-- ---------------------------------------------------------------------------
-- order_events — append-only audit log
-- ---------------------------------------------------------------------------

create table public.order_events (
  id             bigint generated always as identity primary key,
  order_id       uuid not null references public.orders (id) on delete cascade,
  type           text not null,
  from_status    public.order_status,
  to_status      public.order_status,
  actor_admin_id uuid references public.admin_users (id) on delete set null,
  actor_label    text not null,
  payload        jsonb,
  created_at     timestamptz not null default now()
);

comment on table public.order_events is
  'Written only by SECURITY DEFINER functions. An audit log the application '
  'can write to arbitrarily is not an audit log.';

comment on column public.order_events.actor_label is
  'Snapshot: ''customer'', or the admin display name at the time of the event.';
