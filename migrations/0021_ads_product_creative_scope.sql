-- 0021: TikTok only returns product and creative results when the request names the campaign (and, for videos, the product).
-- Creative rows are therefore per campaign, product and video; both tables also keep the ad funnel numbers (impressions, clicks, rates).
-- Both tables were empty (their first sync was refused), and ads data is replaceable, so they are simply recreated.
drop table if exists ads_creative_daily;
drop table if exists ads_product_daily;

create table ads_product_daily (
  advertiser_id text not null,
  campaign_id text not null,
  product_id text not null,
  day date not null,
  title text,
  cost numeric(14,2),
  orders int,
  gross_revenue numeric(14,2),
  roi numeric(14,4),
  cost_per_order numeric(14,2),
  impressions bigint,
  clicks bigint,
  click_rate numeric(12,6),
  conversion_rate numeric(12,6),
  raw jsonb,
  h text,
  synced_at timestamptz not null default now(),
  primary key (advertiser_id, campaign_id, product_id, day)
);
create index ads_product_daily_day on ads_product_daily (day);

create table ads_creative_daily (
  advertiser_id text not null,
  campaign_id text not null,
  product_id text not null,
  creative_id text not null,
  day date not null,
  title text,
  account_name text,
  content_type text,
  cost numeric(14,2),
  orders int,
  gross_revenue numeric(14,2),
  roi numeric(14,4),
  cost_per_order numeric(14,2),
  impressions bigint,
  clicks bigint,
  click_rate numeric(12,6),
  conversion_rate numeric(12,6),
  view_rate_2s numeric(12,6),
  view_rate_6s numeric(12,6),
  raw jsonb,
  h text,
  synced_at timestamptz not null default now(),
  primary key (advertiser_id, campaign_id, product_id, creative_id, day)
);
create index ads_creative_daily_day on ads_creative_daily (day);
create index ads_creative_daily_creative on ads_creative_daily (creative_id);
