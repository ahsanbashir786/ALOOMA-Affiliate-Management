-- 0042: read-only roles and access that ends on a date (for example, a login given to an AI assistant to look at the system).
--  roles.read_only   a read-only role can open its screens but can change nothing (no saving, syncing, importing or exporting)
--  users.expires_at  the login stops working at this time (empty = never)
alter table roles add column if not exists read_only boolean not null default false;
alter table users add column if not exists expires_at timestamptz;
