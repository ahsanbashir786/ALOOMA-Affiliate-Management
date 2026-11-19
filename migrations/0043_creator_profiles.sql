-- 0043: what TikTok's Creator Marketplace says about a creator (level, categories, scores), kept so Outreach can show who is eligible without asking TikTok every time.
create table if not exists tt_creator_profiles (
  open_id text primary key,
  username text,
  level int,
  category_ids text[] not null default '{}',
  followers bigint,
  pps numeric,
  rating numeric,
  post_rate numeric,
  sample_score numeric,
  fulfilment_score numeric,
  official_recommend boolean,
  rising_star boolean,
  fast_growing boolean,
  blocked boolean,
  has_collaborated boolean,
  invited_90d boolean,
  has_profile boolean not null default false,
  checked_at timestamptz not null default now()
);
