-- 0029: everything the app itself sent to TikTok about boosts (create / stop), kept forever: who, what, how much, and TikTok's answer.
create table if not exists ads_boost_actions (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  action text not null,                 -- 'create' | 'stop'
  user_name text,
  advertiser_id text not null,
  campaign_id text,
  item_id text,                         -- the video
  product_id text,                      -- the product (TikTok's spu_id / item_group_id)
  session_id text,                      -- TikTok's boost session
  budget numeric(14,2),                 -- daily budget
  days integer,                         -- null = until stopped
  ends_at timestamptz,
  ok boolean not null default false,
  message text,                         -- TikTok's own message (or ours when we refused before asking TikTok)
  stopped_at timestamptz,
  request jsonb,
  response jsonb
);
create index if not exists ads_boost_actions_created on ads_boost_actions (created_at desc);
create index if not exists ads_boost_actions_item on ads_boost_actions (item_id);
create index if not exists ads_boost_actions_session on ads_boost_actions (session_id);
