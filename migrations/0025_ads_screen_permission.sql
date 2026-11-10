-- 0025: the new GMV Max screen. Admin always has every screen; its stored rows are kept complete too. Other roles get it only when someone ticks it.
insert into role_permissions (role_id, permission)
select r.id, 'ads' from roles r where r.is_admin
on conflict do nothing;
