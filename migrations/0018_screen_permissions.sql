-- Permissions are now only "can open this screen" for the six screens. Nothing is seeded except the Admin role.
-- Each old permission turns into the screen it belonged to; roles keep their screens.
insert into role_permissions (role_id, permission)
select distinct role_id, case split_part(permission, '.', 1)
  when 'execution' then 'execution'
  when 'affiliates' then 'creators'
  when 'contacts' then 'creators'
  when 'products' then 'products'
  when 'sync' then 'sync'
  when 'tiktok' then 'settings'
  when 'users' then 'users'
end
from role_permissions
where permission in ('execution.view','execution.work','execution.assign','affiliates.view','affiliates.work','affiliates.export','contacts.edit','products.view','sync.view','sync.run','tiktok.manage','users.manage')
on conflict do nothing;

-- Someone who could edit WhatsApp numbers on top of their role keeps that by getting Affiliate Data.
insert into role_permissions (role_id, permission)
select distinct u.role_id, 'creators' from users u where u.can_edit_contacts
on conflict do nothing;

delete from role_permissions where permission like '%.%';
alter table users drop column if exists can_edit_contacts;

-- The ready-made Manager and Viewer roles are not defaults any more: remove them when nobody uses them.
delete from roles r where not r.is_admin and r.key in ('manager', 'viewer') and not exists (select 1 from users u where u.role_id = r.id);

-- Admin has every screen (it also has them without these rows).
insert into role_permissions (role_id, permission)
select r.id, p from roles r, unnest(array['execution','creators','products','sync','users','settings']) p where r.is_admin
on conflict do nothing;
