-- ===========================================================================
--  DEVELOPMENT FIXTURE — NOT SHOP DATA.
--
--  Every name below is prefixed [DEV] on purpose. None of it came from the
--  shop: the real sets, fillings, sauces, utensils, pickup points, slots and
--  delivery fee are open questions Q4–Q7 and Q11–Q12 in doc 06, and inventing
--  plausible-looking values for them is worse than having none, because
--  plausible values stop looking like placeholders about a week later.
--
--  This file runs on `supabase db reset` against the LOCAL stack only. It is
--  never applied by `supabase db push`. When the real menu arrives it replaces
--  this wholesale — the [DEV] prefix is what makes that replacement obvious.
-- ===========================================================================

update public.shop_settings
   set is_open = true,
       closed_message = '[DEV] ปิดรับออเดอร์ชั่วคราว'
 where id = 1;

-- --- Staff ------------------------------------------------------------------
--
-- The real allow-list is Q13 and has not been supplied. Two [DEV] accounts
-- exist so the claim race and the "someone else has it" path can be exercised
-- locally at all; neither is a real Google account.

insert into public.admin_users (email, display_name, role) values
  ('dev-staff-a@example.com', '[DEV] พนักงาน A', 'admin'),
  ('dev-staff-b@example.com', '[DEV] พนักงาน B', 'admin');

-- --- Fulfillment ------------------------------------------------------------

insert into public.delivery_zones (id, name, fee, sort_order) values
  ('d0000000-0000-4000-8000-000000000001', '[DEV] ทั่วมหาลัย', 10, 1);

insert into public.pickup_points (id, name, detail, sort_order) values
  ('c0000000-0000-4000-8000-000000000001', '[DEV] จุดรับ A', 'หน้าตึกตัวอย่าง', 1),
  ('c0000000-0000-4000-8000-000000000002', '[DEV] จุดรับ B', 'ลานจอดรถตัวอย่าง', 2);

insert into public.pickup_slots (id, label, starts_at_local, capacity) values
  ('50000000-0000-4000-8000-000000000001', '[DEV] 11:30–11:45', '11:30', null),
  ('50000000-0000-4000-8000-000000000002', '[DEV] 12:00–12:15', '12:00', 2),
  -- Reserved for the concurrency test, which needs a slot nothing else has
  -- already eaten into.
  ('50000000-0000-4000-8000-000000000003', '[DEV] 12:30–12:45', '12:30', 2);

-- --- Menu -------------------------------------------------------------------

insert into public.sets
  (id, name, description, piece_quota, price, sort_order, daily_limit) values
  ('5e000000-0000-4000-8000-000000000001', '[DEV] เซตเล็ก 5 ชิ้น', 'ของทดสอบ', 5, 99, 1, null),
  ('5e000000-0000-4000-8000-000000000002', '[DEV] เซตใหญ่ 10 ชิ้น', 'ของทดสอบ', 10, 179, 2, null),
  -- daily_limit is set here so the cap and its lock get exercised locally.
  ('5e000000-0000-4000-8000-000000000003', '[DEV] เซตจำกัดวันละ 2', 'ของทดสอบ', 5, 50, 3, 2);

-- default_daily_qty is deliberately mixed: one filling has none at all, so the
-- "unlimited for today" branch in place_order gets exercised locally too.
insert into public.fillings
  (id, name, image_path, sort_order, default_daily_qty, max_per_set) values
  ('f1000000-0000-4000-8000-000000000001', '[DEV] ไส้ A', 'dev/placeholder.png', 1, 40, null),
  ('f1000000-0000-4000-8000-000000000002', '[DEV] ไส้ B', 'dev/placeholder.png', 2, 40, 6),
  ('f1000000-0000-4000-8000-000000000003', '[DEV] ไส้ C', 'dev/placeholder.png', 3, 5,  null),
  ('f1000000-0000-4000-8000-000000000004', '[DEV] ไส้ D', 'dev/placeholder.png', 4, null, null),
  ('f1000000-0000-4000-8000-000000000005', '[DEV] ไส้ E (ปิดอยู่)', 'dev/placeholder.png', 5, 10, null);

update public.fillings set is_active = false
 where id = 'f1000000-0000-4000-8000-000000000005';

insert into public.addons (id, kind, name, price, max_qty, sort_order) values
  ('ad000000-0000-4000-8000-000000000001', 'sauce',     '[DEV] น้ำจิ้ม A', 0,  5, 1),
  ('ad000000-0000-4000-8000-000000000002', 'sauce',     '[DEV] น้ำจิ้ม B', 10, 3, 2),
  ('ad000000-0000-4000-8000-000000000003', 'utensil',   '[DEV] ช้อนส้อม',  0,  5, 3),
  ('ad000000-0000-4000-8000-000000000004', 'packaging', '[DEV] ถุงหิ้ว',   5,  2, 4);

-- Today's stock, seeded from the defaults the way the daily rollover job will.
insert into public.filling_stock_daily (filling_id, service_date, qty_total, qty_remaining)
select f.id, public.shop_today(), f.default_daily_qty, f.default_daily_qty
  from public.fillings f
 where f.default_daily_qty is not null;
