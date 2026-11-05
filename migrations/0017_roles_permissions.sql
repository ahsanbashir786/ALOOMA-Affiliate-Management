-- 0017: Roles and permissions you can change in the system. Admin (the owner) always has everything.
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  key text not null constraint roles_key_uq unique,
  name text not null,
  description text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists role_permissions (
  role_id uuid not null constraint role_permissions_role_id_fk references roles(id) on delete cascade,
  permission text not null,
  primary key (role_id, permission)
);

insert into roles (key, name, description, is_admin) values
  ('admin', 'Admin', 'The owner. Can do everything, always.', true),
  ('manager', 'Affiliate Manager', 'Runs the programme day to day: assigns work, syncs data.', false),
  ('viewer', 'Viewer', 'Looks, and works on the actions assigned to them.', false)
on conflict (key) do nothing;

insert into role_permissions (role_id, permission)
select r.id, p.permission from roles r join (values
  ('admin','execution.view'),('admin','execution.work'),('admin','execution.assign'),('admin','affiliates.view'),('admin','affiliates.work'),('admin','affiliates.export'),('admin','contacts.edit'),('admin','products.view'),('admin','sync.view'),('admin','sync.run'),('admin','tiktok.manage'),('admin','users.manage'),
  ('manager','execution.view'),('manager','execution.work'),('manager','execution.assign'),('manager','affiliates.view'),('manager','affiliates.work'),('manager','affiliates.export'),('manager','contacts.edit'),('manager','products.view'),('manager','sync.view'),('manager','sync.run'),
  ('viewer','execution.view'),('viewer','execution.work'),('viewer','affiliates.view'),('viewer','products.view')
) as p(role_key, permission) on p.role_key = r.key
on conflict do nothing;

-- Every user points at a role. The old fixed role column goes away.
alter table users add column if not exists role_id uuid constraint users_role_id_fk references roles(id);
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'role') then
    update users set role_id = (select id from roles where roles.key = users.role::text) where role_id is null;
  end if;
end $$;
alter table users alter column role_id set not null;
alter table users drop column if exists role;
drop type if exists role;
