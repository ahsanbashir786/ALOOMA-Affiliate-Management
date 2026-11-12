-- 0031: the Finance screen. The Admin role always has every screen, so it gets this one too.
insert into role_permissions (role_id, permission)
select r.id, 'finance' from roles r where r.is_admin
on conflict do nothing;
