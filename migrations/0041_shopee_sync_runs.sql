-- 0041: the Shopee sync keeps a history of its runs (one line per part), like the TikTok and Ads syncs.
create table if not exists shopee_sync_runs (
  id bigserial primary key,
  dataset text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',     -- running, ok, failed
  trigger text not null default 'manual',     -- manual or schedule
  user_id uuid references users(id) on delete set null,
  rows_seen int not null default 0,           -- records read so far (live while it runs)
  rows_changed int not null default 0,
  error text
);
create index if not exists shopee_sync_runs_started on shopee_sync_runs (started_at desc);
