-- 0008 · The superadmin row
--
-- ===========================================================================
--  THIS ADDRESS IS THE ONLY WAY INTO THE SYSTEM.
--
--  The superadmin row cannot be created, edited or deleted through the API —
--  RLS blocks any write touching role = 'superadmin', and a partial unique
--  index allows only one such row to exist. Changing who the superadmin is
--  means a direct database statement, by design.
--
--  Changing it on an existing database is therefore:
--    update public.admin_users set email = 'new@address'
--     where role = 'superadmin';
-- ===========================================================================

insert into public.admin_users (email, display_name, role)
values ('midfieldkanis1@gmail.com', 'เจ้าของร้าน', 'superadmin');
