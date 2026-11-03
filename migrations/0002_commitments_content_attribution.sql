-- 0002: independent structured commitments, rescheduling, general content layer, single sales attribution, import conflicts.
-- Additive only. No staff data, import data or decision is deleted or rewritten except the derived `asof` freshness stamp (see below).

-- structured deliverables (free text in `details` stays untouched and is never parsed)
alter table commitments add column if not exists content_type text;
alter table commitments add column if not exists quantity integer;
alter table content_decisions add column if not exists shared boolean not null default false;

-- older commitments recorded the product only through their sample: keep that link explicit when the samples agree on one product
update commitments c set product_id = x.pid
from (
  select c2.id, min(s.product_id) as pid
  from commitments c2 join samples s on s.id = any(c2.sample_ids)
  where c2.product_id is null and s.product_id is not null
  group by c2.id having count(distinct s.product_id) = 1
) x
where c.id = x.id;

create table if not exists commitment_changes (
  id serial primary key,
  commitment_id integer not null constraint commitment_changes_commitment_id_commitments_id_fk references commitments(id) on delete cascade,
  event_id integer not null constraint commitment_changes_event_id_staff_events_id_fk references staff_events(id) on delete cascade,
  from_on date not null,
  to_on date not null
);
create unique index if not exists commitment_changes_event_uq on commitment_changes (event_id);
create index if not exists commitment_changes_commitment_idx on commitment_changes (commitment_id);

create table if not exists commitment_status (
  commitment_id integer primary key constraint commitment_status_commitment_id_commitments_id_fk references commitments(id) on delete cascade,
  state text not null,
  needed integer not null default 1,
  done integer not null default 0,
  original_on date not null,
  due_on date not null,
  completed_on date,
  timing text,
  content_ids text[] not null default '{}',
  candidate_ids text[] not null default '{}',
  computed_at timestamptz not null default now()
);

create table if not exists content_items (
  content_id text primary key,
  creator text not null,
  kind text not null,
  product_ids text[] not null default '{}',
  posted_at timestamp,
  first_observed_on date,
  link text,
  views integer not null default 0,
  source text not null
);
create index if not exists content_items_creator_idx on content_items (creator);

alter table samples add column if not exists observed_gmv double precision not null default 0;
alter table samples add column if not exists observed_orders integer not null default 0;

create table if not exists sample_sales (
  order_id text not null,
  sku_id text not null,
  sample_id integer not null constraint sample_sales_sample_id_samples_id_fk references samples(id) on delete cascade,
  creator text not null,
  product_id text not null,
  content_id text,
  basis text not null,
  pay double precision not null,
  constraint sample_sales_order_id_sku_id_pk primary key (order_id, sku_id)
);
create index if not exists sample_sales_sample_idx on sample_sales (sample_id);

create table if not exists import_conflicts (
  id serial primary key,
  kind text not null,
  order_id text not null,
  sku_id text not null,
  upload_id integer constraint import_conflicts_upload_id_uploads_id_fk references uploads(id) on delete set null,
  reason text not null,
  stored jsonb not null,
  incoming jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid constraint import_conflicts_resolved_by_users_id_fk references users(id) on delete set null
);
create unique index if not exists import_conflicts_line_uq on import_conflicts (kind, order_id, sku_id, status);
create index if not exists import_conflicts_status_idx on import_conflicts (status);

-- Freshness stamp: previously every line carried its FILE's latest timestamp. A line's own lifecycle timestamps are the
-- strongest evidence of how recent its information is, so recompute `asof` per line. (Only this derived stamp changes.)
update order_lines set asof = greatest(created_at, paid_at, delivered_at, commission_paid_at);
update shop_order_lines set asof = greatest(created_at, paid_at, shipped_at, delivered_at, cancelled_at, rts_at);
