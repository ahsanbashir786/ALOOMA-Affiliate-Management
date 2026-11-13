-- 0036: System Alerts (Settings → System Alerts).
--  system_alerts   one row per problem that is open or was recently open (connections, data sync, server, app errors)
--  app_error_log   every error the app hit (server pages and actions, and the browser), kept for 7 days
create table if not exists system_alerts (
  key text primary key,
  area text not null check (area in ('connections', 'sync', 'server', 'errors')),
  severity text not null check (severity in ('critical', 'warning', 'info')),
  title text not null,
  detail text,
  advice text,
  href text,
  status text not null default 'open' check (status in ('open', 'seen', 'resolved')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  count int not null default 1,
  resolved_at timestamptz,
  handled_by text
);
create index if not exists system_alerts_status on system_alerts (status, area);

create table if not exists app_error_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  signature text not null,
  source text not null default 'server',
  route text,
  message text not null,
  stack text
);
create index if not exists app_error_log_at on app_error_log (at desc);
create index if not exists app_error_log_signature on app_error_log (signature, at desc);
