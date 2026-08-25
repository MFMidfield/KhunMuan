-- 0022 · New-order alerting through LINE
-- Plan: docs/plan/02-order-lifecycle.md §7, docs/plan/05-backend-security.md §6
--
-- An outbox, not a direct call. The LINE API being slow or down must never roll
-- back an order or show a customer an error, and a trigger that made an HTTP
-- request inline would do exactly that — the order would fail because a
-- notification failed, which is precisely backwards.
--
-- Q16 is still open: whether the shop has an Official Account, whether the
-- target is a group the bot was invited to or a multicast to each staff member.
-- None of that changes the shape of this. The outbox fills up regardless, and
-- the drain stays inert and says so until the two secrets are set.

create type public.outbox_state as enum ('pending', 'sent', 'failed');

create table public.notification_outbox (
  id         bigint generated always as identity primary key,
  kind       text not null,
  order_id   uuid references public.orders (id) on delete cascade,
  payload    jsonb not null,
  state      public.outbox_state not null default 'pending',
  attempts   int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

create index notification_outbox_pending_idx
  on public.notification_outbox (created_at)
  where state = 'pending';

create index notification_outbox_order_id_idx on public.notification_outbox (order_id);

alter table public.notification_outbox enable row level security;

-- Visible to the superadmin so a stuck queue can be seen, and writable by
-- nobody: rows are made by a trigger and moved by the drain.
grant select on public.notification_outbox to authenticated;

create policy notification_outbox_super_read on public.notification_outbox
  for select to authenticated
  using ((select public.is_superadmin()));

-- ---------------------------------------------------------------------------
-- Enqueue
-- ---------------------------------------------------------------------------

create or replace function private.enqueue_new_order_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  summary text;
begin
  if not (select line_notify_enabled from public.shop_settings where id = 1) then
    return null;
  end if;

  -- Built here rather than in the drain so the message reflects the order as it
  -- was when it arrived, even if someone edits it in the seconds before the
  -- queue is read.
  select string_agg(format('%s ×%s', oi.set_name, oi.quantity), ', ' order by oi.sort_order)
    into summary
    from public.order_items oi
   where oi.order_id = new.id;

  insert into public.notification_outbox (kind, order_id, payload)
  values (
    'new_order',
    new.id,
    -- Deliberately thin. This lands in a group chat, so it carries what the
    -- kitchen needs to act and nothing that identifies a customer: no name, no
    -- phone, no room number.
    jsonb_build_object(
      'code', new.code,
      'summary', coalesce(summary, ''),
      'fulfillment', new.fulfillment,
      'pickup_point', (select p.name from public.pickup_points p
                        where p.id = new.pickup_point_id),
      'pickup_slot', (select s.label from public.pickup_slots s
                       where s.id = new.pickup_slot_id),
      'total', new.total
    )
  );

  return null;
end;
$$;

-- Replaced in 0023 by a constraint trigger deferred to commit: at plain AFTER
-- INSERT time the order exists but its items do not, and the summary below
-- aggregated over an empty set.
create trigger enqueue_new_order_notification
  after insert on public.orders
  for each row
  execute function private.enqueue_new_order_notification();

-- ---------------------------------------------------------------------------
-- What the drain needs
-- ---------------------------------------------------------------------------

create or replace function public.outbox_take(p_limit int default 20)
returns setof public.notification_outbox
language sql
volatile
security definer
set search_path = ''
as $$
  -- skip locked so two drains running at once split the queue instead of
  -- fighting over the head of it.
  update public.notification_outbox o
     set attempts = o.attempts + 1
   where o.id in (
     select id from public.notification_outbox
      where state = 'pending'
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning o.*;
$$;

revoke all on function public.outbox_take(int) from public;
grant execute on function public.outbox_take(int) to service_role;

create or replace function public.outbox_settle(
  p_id    bigint,
  p_ok    boolean,
  p_error text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox
     set state = case
                   when p_ok then 'sent'
                   -- Five attempts, then it stops. A message nobody will ever
                   -- read is not worth retrying until the end of time, and a
                   -- dead-lettered row is something the superadmin can see.
                   when attempts >= 5 then 'failed'
                   else 'pending'
                 end::public.outbox_state,
         last_error = case when p_ok then null else p_error end,
         sent_at    = case when p_ok then now() else sent_at end
   where id = p_id;
end;
$$;

revoke all on function public.outbox_settle(bigint, boolean, text) from public;
grant execute on function public.outbox_settle(bigint, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Waking the drain
-- ---------------------------------------------------------------------------

create or replace function private.request_line_drain()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base text := current_setting('app.functions_url', true);
  key  text := current_setting('app.service_role_key', true);
begin
  if base is null or key is null then
    return;
  end if;

  -- Nothing waiting, nothing to wake. This runs every fifteen seconds all day.
  if not exists (select 1 from public.notification_outbox where state = 'pending') then
    return;
  end if;

  perform extensions.net.http_post(
    url     := base || '/line-notify',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || key),
    body    := '{}'::jsonb
  );
end;
$$;

revoke all on function private.request_line_drain() from public;

select cron.schedule(
  'drain-line-outbox',
  '15 seconds',
  $$select private.request_line_drain()$$
);
