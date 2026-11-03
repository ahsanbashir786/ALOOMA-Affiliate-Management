-- 0001: everything added by the "Today's Work" release. Additive and idempotent: safe on a database that already has it.
alter table order_lines add column if not exists asof timestamp;
alter table shop_order_lines add column if not exists asof timestamp;
alter table samples add column if not exists post_by date;
alter table samples add column if not exists post_by_source text;

create table if not exists staff_events (
  id serial primary key,
  username text not null,
  kind text not null,
  at timestamptz not null default now(),
  user_id uuid constraint staff_events_user_id_users_id_fk references users(id) on delete set null,
  details jsonb,
  batch_id text,
  synthetic boolean not null default false,
  reverted_at timestamptz,
  reverted_by uuid constraint staff_events_reverted_by_users_id_fk references users(id) on delete set null
);
create index if not exists staff_events_user_idx on staff_events (username, at);
create index if not exists staff_events_kind_idx on staff_events (kind, at);

create table if not exists commitments (
  id serial primary key,
  username text not null,
  event_id integer not null constraint commitments_event_id_staff_events_id_fk references staff_events(id) on delete cascade,
  promised_on date not null,
  details text,
  sample_ids integer[] not null default '{}',
  product_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists commitments_event_uq on commitments (event_id);
create index if not exists commitments_user_idx on commitments (username);

create table if not exists sample_content (
  sample_id integer not null constraint sample_content_sample_id_samples_id_fk references samples(id) on delete cascade,
  content_id text not null,
  kind text not null,
  link text,
  posted_at timestamp,
  views integer not null default 0,
  confidence text not null,
  reason text not null,
  constraint sample_content_sample_id_content_id_pk primary key (sample_id, content_id)
);

create table if not exists content_decisions (
  id serial primary key,
  username text not null,
  sample_id integer constraint content_decisions_sample_id_samples_id_fk references samples(id) on delete cascade,
  commitment_id integer constraint content_decisions_commitment_id_commitments_id_fk references commitments(id) on delete cascade,
  content_id text,
  link text,
  decision text not null,
  user_id uuid constraint content_decisions_user_id_users_id_fk references users(id) on delete set null,
  at timestamptz not null default now(),
  note text,
  synthetic boolean not null default false,
  reverted_at timestamptz,
  reverted_by uuid constraint content_decisions_reverted_by_users_id_fk references users(id) on delete set null
);
create index if not exists content_decisions_user_idx on content_decisions (username);

create table if not exists recommendations (
  id serial primary key,
  username text not null,
  type text not null,
  priority integer not null default 50,
  title text not null,
  reason text not null,
  instruction text not null,
  instruction_ms text,
  scenario_value double precision not null default 0,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists recommendations_uq on recommendations (username, type);
create index if not exists recommendations_active_idx on recommendations (active);
