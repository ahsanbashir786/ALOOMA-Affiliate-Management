-- 0005: where a creator record came from, and on which platform. Additive; existing creators become platform "tiktok", source "import".
alter table creators add column if not exists platform text not null default 'tiktok';
alter table creators add column if not exists source text not null default 'import';
alter table creators add column if not exists added_by uuid constraint creators_added_by_users_id_fk references users(id) on delete set null;
alter table creators add column if not exists added_at timestamp;
