-- 0020: TikTok Ads (Business API) sync for GMV Max. Additive: new tables only. Ads data lives in ads_* tables and is replaceable;
-- nothing here is typed by staff. Every row keeps the answer TikTok gave ("raw"), so a field we did not map yet is never lost.
create table if not exists ads_sync_runs (
  id bigserial primary key,
  dataset text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  trigger text not null default 'manual',
  user_id uuid constraint ads_sync_runs_user_id_users_id_fk references users(id) on delete set null,
  pages int not null default 0,
  rows_seen int not null default 0,
  rows_changed int not null default 0,
  error text
);
create index if not exists ads_sync_runs_dataset_started on ads_sync_runs (dataset, started_at desc);

create table if not exists ads_sync_state (
  dataset text primary key,
  watermark timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  records int not null default 0,
  -- The first row TikTok sent in the last good run, so we can see exactly what it looks like.
  sample jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists ads_advertisers (
  advertiser_id text primary key,
  name text,
  currency text,
  timezone text,
  status text,
  raw jsonb,
  h text,
  synced_at timestamptz not null default now()
);

create table if not exists ads_stores (
  advertiser_id text not null,
  store_id text not null,
  store_name text,
  store_code text,
  bc_id text,
  available boolean,
  raw jsonb,
  h text,
  synced_at timestamptz not null default now(),
  primary key (advertiser_id, store_id)
);

create table if not exists ads_campaigns (
  advertiser_id text not null,
  campaign_id text not null,
  store_id text,
  name text,
  status text,
  promotion_type text,
  budget numeric(14,2),
  roas_target numeric(12,4),
  created_at timestamptz,
  modified_at timestamptz,
  raw jsonb,
  h text,
  synced_at timestamptz not null default now(),
  primary key (advertiser_id, campaign_id)
);
create index if not exists ads_campaigns_status on ads_campaigns (status);

create table if not exists ads_campaign_daily (
  advertiser_id text not null,
  campaign_id text not null,
  day date not null,
  cost numeric(14,2),
  net_cost numeric(14,2),
  orders int,
  gross_revenue numeric(14,2),
  roi numeric(14,4),
  cost_per_order numeric(14,2),
  raw jsonb,
  h text,
  synced_at timestamptz not null default now(),
  primary key (advertiser_id, campaign_id, day)
);
create index if not exists ads_campaign_daily_day on ads_campaign_daily (day);

create table if not exists ads_creative_daily (
  advertiser_id text not null,
  campaign_id text not null,
  creative_id text not null,
  day date not null,
  title text,
  account_name text,
  content_type text,
  cost numeric(14,2),
  orders int,
  gross_revenue numeric(14,2),
  roi numeric(14,4),
  views bigint,
  raw jsonb,
  h text,
  synced_at timestamptz not null default now(),
  primary key (advertiser_id, campaign_id, creative_id, day)
);
create index if not exists ads_creative_daily_day on ads_creative_daily (day);
create index if not exists ads_creative_daily_creative on ads_creative_daily (creative_id);

create table if not exists ads_product_daily (
  advertiser_id text not null,
  campaign_id text not null,
  product_id text not null,
  day date not null,
  title text,
  cost numeric(14,2),
  orders int,
  gross_revenue numeric(14,2),
  roi numeric(14,4),
  raw jsonb,
  h text,
  synced_at timestamptz not null default now(),
  primary key (advertiser_id, campaign_id, product_id, day)
);
create index if not exists ads_product_daily_day on ads_product_daily (day);
