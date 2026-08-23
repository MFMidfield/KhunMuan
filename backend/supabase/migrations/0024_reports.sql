-- 0024 · Reports
-- Plan: docs/plan/02-order-lifecycle.md §8
--
-- Q19 asked which periods the shop wants: daily, weekly, monthly, and whether
-- to export. Every one of these takes a date range instead, which answers all
-- of them at once and does not need the question settled first — a week is a
-- range, a month is a range, and the export is the same rows as CSV.
--
-- Q20 asked for per-set cost so the report could show profit. It is still open,
-- so these show revenue and say revenue. A "profit" column computed from a cost
-- nobody has supplied would be worse than no column at all.
--
-- All three are superadmin-only. Sales figures are the owner's business and not
-- something a shift cook needs on the same screen as the kitchen board.

create or replace function public.report_sales(p_from date, p_to date)
returns table (
  service_date  date,
  completed     bigint,
  lost          bigint,
  revenue       numeric,
  cash          numeric,
  transfer      numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.service_date,
         count(*) filter (where o.status = 'handed_over')                  as completed,
         count(*) filter (where o.status in ('cancelled', 'rejected'))     as lost,
         -- Only handed_over counts as revenue. An order that was cooked and
         -- then cancelled cost the shop food and earned nothing, and folding it
         -- into the takings would quietly overstate every day it happened.
         coalesce(sum(o.total) filter (where o.status = 'handed_over'), 0)  as revenue,
         coalesce(sum(o.total) filter (where o.status = 'handed_over'
                                         and p.method = 'cash'), 0)        as cash,
         coalesce(sum(o.total) filter (where o.status = 'handed_over'
                                         and p.method = 'transfer'), 0)    as transfer
    from public.orders o
    left join public.payments p on p.order_id = o.id
   where (select public.is_superadmin())
     and o.service_date between p_from and p_to
   group by o.service_date
   order by o.service_date desc;
$$;

revoke all on function public.report_sales(date, date) from public;
grant execute on function public.report_sales(date, date) to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.report_fillings(p_from date, p_to date)
returns table (
  filling_name text,
  pieces       bigint,
  orders       bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Grouped by the snapshotted name, not by filling_id: a filling that was
  -- renamed mid-period genuinely sold under two names, and merging them would
  -- hide exactly the thing someone reading this report is looking for.
  select f.filling_name,
         sum(f.qty * oi.quantity)::bigint  as pieces,
         count(distinct oi.order_id)::bigint as orders
    from public.order_item_fillings f
    join public.order_items oi on oi.id = f.order_item_id
    join public.orders o on o.id = oi.order_id
   where (select public.is_superadmin())
     and o.service_date between p_from and p_to
     and o.status = 'handed_over'
   group by f.filling_name
   order by 2 desc;
$$;

revoke all on function public.report_fillings(date, date) from public;
grant execute on function public.report_fillings(date, date) to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.report_stage_timing(p_from date, p_to date)
returns table (
  to_status    public.order_status,
  avg_minutes  numeric,
  median_minutes numeric,
  samples      bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  -- This is what the append-only, timestamped audit log was for. Nothing else
  -- in the schema can answer "how long does an order sit waiting to be
  -- accepted", because the orders row only ever holds the current status.
  with steps as (
    select e.to_status,
           e.created_at - lag(e.created_at) over (
             partition by e.order_id order by e.created_at
           ) as took
      from public.order_events e
      join public.orders o on o.id = e.order_id
     where o.service_date between p_from and p_to
       and e.type in ('created', 'status_changed')
       and e.to_status is not null
  )
  select s.to_status,
         round(avg(extract(epoch from s.took) / 60)::numeric, 1),
         -- The median matters more than the mean here: one order forgotten
         -- over a lunch break drags an average into uselessness.
         round(
           (percentile_cont(0.5) within group (order by extract(epoch from s.took) / 60))::numeric,
           1),
         count(*)::bigint
    from steps s
   where (select public.is_superadmin())
     and s.took is not null
   group by s.to_status;
$$;

revoke all on function public.report_stage_timing(date, date) from public;
grant execute on function public.report_stage_timing(date, date) to authenticated;
