-- 0019 · Transfer slips
-- Plan: docs/plan/05-backend-security.md §5
--
-- Slips are the most sensitive thing in this system. They carry a name, part of
-- an account number, and an amount, and the person uploading one has no account
-- and no session. The design follows from that:
--
--   * the bucket is private, with no public read at any point
--   * the customer never gets write access to storage — an Edge Function issues
--     a signed upload URL scoped to one object path derived from their order id
--   * staff read through a short-lived signed URL generated per view, never a
--     link that keeps working after the tab is closed
--   * they are deleted on a schedule, because keeping payment screenshots
--     forever is a liability with no upside

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'slips', 'slips', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- Staff read. Nobody else gets a policy at all, so anon cannot select, cannot
-- list, and cannot guess their way to another customer's slip. Uploads happen
-- with the service key inside an Edge Function, which bypasses RLS by design.
create policy slips_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'slips' and (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Retention — Q18, proposed as 90 days and configurable rather than compiled in
-- ---------------------------------------------------------------------------

alter table public.shop_settings
  add column slip_retention_days int not null default 90
  check (slip_retention_days between 1 and 3650);

comment on column public.shop_settings.slip_retention_days is
  'How long a slip is kept after upload. Ninety days was proposed and is the '
  'default; the shop can shorten it without a migration. Keeping payment '
  'screenshots indefinitely is a liability with no upside.';

-- ---------------------------------------------------------------------------
-- attach_slip
-- ---------------------------------------------------------------------------

create or replace function public.attach_slip(
  p_code         text,
  p_client_token uuid,
  p_path         text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders
   where code = upper(btrim(p_code))
     and client_token = p_client_token;

  -- Same answer whether the code or the token was wrong, as everywhere else on
  -- the customer path.
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- The Edge Function issues paths under the order id; checking it again here
  -- means a customer who kept an old signed URL cannot point their payment at
  -- somebody else's order.
  if p_path is null or p_path not like (o.id::text || '/%') then
    raise exception 'SLIP_PATH_MISMATCH';
  end if;

  if o.status in ('handed_over', 'cancelled', 'rejected') then
    raise exception 'ORDER_CLOSED' using detail = o.status::text;
  end if;

  update public.payments
     set slip_path        = p_path,
         slip_uploaded_at = now(),
         -- Never straight to `paid`: a slip is a claim, and confirming it is a
         -- decision a human makes on the board.
         state            = case when state = 'paid' then state else 'slip_uploaded' end
   where order_id = o.id;

  insert into public.order_events (order_id, type, actor_label, payload)
  values (o.id, 'slip_uploaded', 'customer', jsonb_build_object('path', p_path));

  return jsonb_build_object('code', o.code, 'state', 'slip_uploaded');
end;
$$;

revoke all on function public.attach_slip(text, uuid, text) from public;
grant execute on function public.attach_slip(text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Expiry
-- ---------------------------------------------------------------------------
--
-- Deleting the storage.objects row removes the file's metadata but not
-- necessarily the bytes behind it, so the prune runs through the storage API in
-- an Edge Function and this job only wakes it. pg_net posts and forgets; a
-- failed run simply happens again in an hour.

create extension if not exists pg_net with schema extensions;

create or replace function private.request_slip_prune()
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
    -- Not configured in this environment. Say so in the log rather than
    -- pretending the retention promise is being kept.
    raise warning 'slip prune skipped: app.functions_url or app.service_role_key is not set';
    return;
  end if;

  perform extensions.net.http_post(
    url     := base || '/slip-prune',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || key),
    body    := '{}'::jsonb
  );
end;
$$;

revoke all on function private.request_slip_prune() from public;

select cron.schedule(
  'prune-slips',
  '41 3 * * *',
  $$select private.request_slip_prune()$$
);

-- ---------------------------------------------------------------------------
-- What the prune function needs to know
-- ---------------------------------------------------------------------------

create or replace function public.expired_slips()
returns table (order_id uuid, slip_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.order_id, p.slip_path
    from public.payments p
    cross join public.shop_settings s
   where s.id = 1
     and p.slip_path is not null
     and p.slip_uploaded_at < now() - make_interval(days => s.slip_retention_days);
$$;

revoke all on function public.expired_slips() from public;
grant execute on function public.expired_slips() to service_role;

create or replace function public.forget_slip(p_order_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.payments
     set slip_path = null
   where order_id = p_order_id;

  insert into public.order_events (order_id, type, actor_label)
  values (p_order_id, 'slip_expired', 'system');
end;
$$;

revoke all on function public.forget_slip(uuid) from public;
grant execute on function public.forget_slip(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- What the customer is allowed to read from shop_settings
-- ---------------------------------------------------------------------------
--
-- anon holds a column-level grant, so a new column is invisible until it is
-- named. The QR is meant to be scanned by strangers, and the two order limits
-- let the checkout say "ขั้นต่ำ ฿150" before someone fills a cart rather than
-- rejecting them after.

grant select (promptpay_qr_path, min_order_total, max_boxes_per_order)
  on public.shop_settings to anon;
