-- 0028: the Boost Log. A batch you boosted in TikTok Ads Manager and marked here, with the videos and the budget each one was given.
-- Results before and after are read from ads_creative_daily, so nothing is copied here.
create table if not exists ads_boost_batches (
  id bigserial primary key,
  boosted_on date not null,
  days integer not null default 1,
  total_budget numeric(14,2) not null default 0,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists ads_boost_batches_day on ads_boost_batches (boosted_on);
create table if not exists ads_boost_batch_videos (
  batch_id bigint not null references ads_boost_batches(id) on delete cascade,
  creative_id text not null,
  product_id text not null default '-',
  budget numeric(14,2) not null default 0,
  primary key (batch_id, creative_id, product_id)
);
create index if not exists ads_boost_batch_videos_creative on ads_boost_batch_videos (creative_id);
