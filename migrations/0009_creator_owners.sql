-- 0009: which staff member looks after which creator (Creators module). Additive; one row per creator, latest assignment wins.
create table if not exists creator_owners (
  username text primary key,
  user_id uuid constraint creator_owners_user_id_users_id_fk references users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid constraint creator_owners_assigned_by_users_id_fk references users(id) on delete set null
);
create index if not exists creator_owners_user on creator_owners (user_id);
