-- 0021 · Daily stock rollover
-- Plan: docs/plan/05-backend-security.md §6
--
-- Every morning the kitchen starts from a fresh tray of each filling. Until now
-- that row appeared only when the first customer of the day happened to order
-- that filling, which works but means the stock screen shows nothing at 07:00
-- and staff cannot see or adjust the day's numbers before the queue starts.
--
-- The job does NOT close the shop. Doc 00 makes open/closed a manual switch,
-- and a job that silently shuts the shop every night is the kind of automation
-- that gets discovered at 11:30 on a busy Tuesday.

create or replace function private.daily_rollover()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created int;
begin
  insert into public.filling_stock_daily
    (filling_id, service_date, qty_total, qty_remaining)
  select f.id, public.shop_today(), f.default_daily_qty, f.default_daily_qty
    from public.fillings f
   where f.is_active
     and f.default_daily_qty is not null
  -- Never overwrite. If staff have already set today's numbers by hand, or the
  -- job has run twice, their figures win over the defaults.
  on conflict (filling_id, service_date) do nothing;

  get diagnostics created = row_count;
  return created;
end;
$$;

revoke all on function private.daily_rollover() from public;

comment on function private.daily_rollover() is
  'Seeds today''s filling_stock_daily from default_daily_qty. Idempotent, and '
  'it never overwrites a number a human has already set.';

-- 04:00 Asia/Bangkok. pg_cron runs on the server clock, which is UTC, so this
-- is 21:00 the previous day — and shop_today() has already rolled over by then,
-- which is exactly why the offset works rather than being off by one.
select cron.schedule(
  'daily-stock-rollover',
  '0 21 * * *',
  $$select private.daily_rollover()$$
);

-- Staff can also trigger it, for the morning somebody adds a filling after the
-- job has already run.
create or replace function public.run_daily_rollover()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created int;
begin
  if not public.is_admin() then
    raise exception 'NOT_STAFF';
  end if;

  created := private.daily_rollover();
  return jsonb_build_object('created', created, 'service_date', public.shop_today());
end;
$$;

revoke all on function public.run_daily_rollover() from public;
grant execute on function public.run_daily_rollover() to authenticated;
