-- 0022: GMV Max video list (who made each video, whether it may be boosted) and creative boost sessions (what is boosted now).
-- Read from TikTok's /gmv_max/video/get/ and /campaign/gmv_max/session/list/. Every row keeps TikTok's full answer ("raw").
create table if not exists ads_videos (
  advertiser_id text not null,
  store_id text not null,
  item_id text not null,
  spu_id text,
  title text,
  identity_id text,
  username text,
  posted_at timestamptz,
  authorization_status text,
  authorization_type text,
  eligible boolean,
  status text,
  raw jsonb,
  h text,
  synced_at timestamptz not null default now(),
  primary key (advertiser_id, store_id, item_id)
);
create index if not exists ads_videos_username on ads_videos (username);

create table if not exists ads_boosts (
  advertiser_id text not null,
  campaign_id text not null,
  session_id text not null,
  store_id text,
  item_id text,
  status text,
  budget numeric(14,2),
  bid_type text,
  schedule_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  raw jsonb,
  h text,
  synced_at timestamptz not null default now(),
  primary key (advertiser_id, session_id)
);
create index if not exists ads_boosts_campaign on ads_boosts (campaign_id);
create index if not exists ads_boosts_item on ads_boosts (item_id);
