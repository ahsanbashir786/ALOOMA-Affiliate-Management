-- 0016: Clean-up. The Excel-upload era is over: everything now comes from the TikTok sync.
-- BACK UP FIRST (scripts/backup.sh). This removes the tables that only held uploaded files and their analysis. It cannot be undone.
-- Kept: users, sessions, settings, creators (phone, do-not-contact), staff events, promises, creator owners, product map, all tt_* TikTok tables, the Execution Plan.

-- Promises and content decisions no longer point at uploaded samples.
alter table content_decisions drop column if exists sample_id;
alter table commitments drop column if exists sample_ids;

-- Content a creator posted is now read straight from the TikTok videos and LIVEs.
drop table if exists content_items cascade;
create or replace view content_items as
  select v.video_id as content_id, v.creator, 'video'::text as kind,
    coalesce((select array_agg(distinct pm.product_key) from jsonb_array_elements(coalesce(v.products, '[]'::jsonb)) p
              join product_map pm on pm.product_id = p->>'id' where pm.product_key <> 'excluded'), '{}'::text[]) as product_ids,
    (v.posted_at at time zone 'Asia/Kuala_Lumpur') as posted_at,
    (coalesce(v.posted_at, v.first_seen_at) at time zone 'Asia/Kuala_Lumpur')::date as first_observed_on,
    'https://www.tiktok.com/@' || v.creator || '/video/' || v.video_id as link,
    coalesce(v.views, 0) as views,
    'tiktok'::text as source
  from tt_videos v where v.creator is not null
  union all
  select 'live:' || l.live_id, l.creator, 'live'::text, '{}'::text[],
    (l.started_at at time zone 'Asia/Kuala_Lumpur'),
    (coalesce(l.started_at, l.first_seen_at) at time zone 'Asia/Kuala_Lumpur')::date,
    null::text, coalesce(l.views, 0), 'tiktok'::text
  from tt_lives l where l.creator is not null;

-- The upload-era tables.
drop table if exists sample_sales, sample_content, samples, import_conflicts, recommendations, actions, sku_bom, sku_items,
  product_snapshots, sample_snapshots, video_snapshots, creator_txn_snapshots, creator_list_snapshots,
  shop_order_lines, order_lines, videos, products, uploads cascade;
drop type if exists upload_kind;
drop type if exists action_status;

-- Product leads were never used.
drop table if exists ep_product_leads;

-- Faster screens: the filters the screens use most.
create index if not exists tt_aol_product on tt_affiliate_order_lines (product_id, created_at);
create index if not exists tt_aol_content on tt_affiliate_order_lines (content_id);
create index if not exists tt_videos_posted on tt_videos (posted_at);
create index if not exists tt_lives_started on tt_lives (started_at);
create index if not exists ep_tasks_status on ep_tasks (status, updated_at);
create index if not exists ep_task_creators_user on ep_task_creators (username);
