-- 0006: TikTok API sync (Data Sync module). Additive: new tables only. TikTok data lives in tt_* tables and is replaceable;
-- nothing here is written by staff. Customer personal data (names, phones, addresses, emails) is never stored.
create table if not exists tt_sync_runs (
  id bigserial primary key,
  dataset text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  trigger text not null default 'manual',
  user_id uuid constraint tt_sync_runs_user_id_users_id_fk references users(id) on delete set null,
  pages int not null default 0,
  rows_seen int not null default 0,
  rows_changed int not null default 0,
  error text
);
create index if not exists tt_sync_runs_dataset_started on tt_sync_runs (dataset, started_at desc);

create table if not exists tt_sync_state (
  dataset text primary key,
  watermark timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  records int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists tt_affiliate_order_lines (
  order_id text not null,
  sku_id text not null,
  created_at timestamptz,
  delivery_at timestamptz,
  creator text,
  content_id text,
  content_type text,
  product_id text,
  seller_sku text,
  sku_name text,
  quantity int,
  price numeric(14,2),
  currency text,
  commission_rate numeric(12,4),
  est_commission numeric(14,2),
  paid_commission numeric(14,2),
  settlement_status text,
  fully_return boolean,
  open_collab_id text,
  target_collab_id text,
  campaign_id text,
  h text,
  synced_at timestamptz not null default now(),
  primary key (order_id, sku_id)
);
create index if not exists tt_aol_creator on tt_affiliate_order_lines (creator);
create index if not exists tt_aol_created on tt_affiliate_order_lines (created_at);

create table if not exists tt_videos (
  video_id text primary key,
  creator text,
  title text,
  posted_at timestamptz,
  views bigint,
  gmv numeric(14,2),
  units_sold int,
  click_through_rate numeric(12,6),
  products jsonb,
  window_start date,
  window_end date,
  h text,
  first_seen_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index if not exists tt_videos_creator on tt_videos (creator);

create table if not exists tt_lives (
  live_id text primary key,
  creator text,
  title text,
  started_at timestamptz,
  ended_at timestamptz,
  gmv numeric(14,2),
  items_sold int,
  sku_orders int,
  customers int,
  viewers bigint,
  views bigint,
  avg_viewing_seconds numeric(12,2),
  new_followers int,
  likes int,
  comments int,
  shares int,
  product_clicks int,
  click_through_rate numeric(12,6),
  click_to_order_rate numeric(12,6),
  h text,
  first_seen_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index if not exists tt_lives_creator on tt_lives (creator);

create table if not exists tt_sample_requests (
  id text primary key,
  status text,
  creator_id text,
  creator text,
  nickname text,
  followers bigint,
  creator_gmv numeric(14,2),
  creator_videos int,
  creator_video_views bigint,
  fulfilment_pct numeric(8,2),
  product_id text,
  sku_id text,
  product_title text,
  sku_name text,
  commission_rate numeric(12,4),
  order_id text,
  is_approvable boolean,
  expires_at timestamptz,
  available_quantity int,
  h text,
  first_seen_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index if not exists tt_samples_creator on tt_sample_requests (creator);

create table if not exists tt_skus (
  sku_id text primary key,
  product_id text,
  product_title text,
  seller_sku text,
  price numeric(14,2),
  currency text,
  stock int,
  product_status text,
  updated_at timestamptz,
  h text,
  synced_at timestamptz not null default now()
);

create table if not exists tt_returns (
  return_id text primary key,
  order_id text,
  status text,
  return_type text,
  reason text,
  refund_amount numeric(14,2),
  currency text,
  skus jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  h text,
  synced_at timestamptz not null default now()
);

create table if not exists tt_cancellations (
  cancel_id text primary key,
  order_id text,
  status text,
  cancel_type text,
  reason text,
  skus jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  h text,
  synced_at timestamptz not null default now()
);

create table if not exists tt_shop_daily (
  day date primary key,
  gmv numeric(14,2),
  orders int,
  buyers int,
  units_sold int,
  refunds numeric(14,2),
  returns_cancellations int,
  page_views bigint,
  impressions bigint,
  avg_order_value numeric(14,2),
  h text,
  synced_at timestamptz not null default now()
);
