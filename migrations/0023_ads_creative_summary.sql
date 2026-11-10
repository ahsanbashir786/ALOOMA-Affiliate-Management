-- 0023: one row per video, product and campaign with its totals, and who made it. The creator comes from the TikTok Shop sync
-- (tt_videos, matched on the video id) or, when TikTok's GMV Max video list has it, from ads_videos.
create or replace view ads_creative_summary as
select
  d.advertiser_id, d.campaign_id, d.product_id, d.creative_id,
  min(d.day) as first_day, max(d.day) as last_day,
  sum(d.cost) as cost, sum(d.orders)::int as orders, sum(d.gross_revenue) as gross_revenue,
  case when sum(d.cost) > 0 then round(sum(d.gross_revenue) / sum(d.cost), 2) end as roi,
  sum(d.impressions)::bigint as impressions, sum(d.clicks)::bigint as clicks,
  coalesce(max(v.creator), max(av.username)) as creator,
  coalesce(max(v.title), max(av.title), max(d.title)) as title,
  coalesce(max(v.posted_at), max(av.posted_at)) as posted_at
from ads_creative_daily d
left join tt_videos v on v.video_id = d.creative_id
left join ads_videos av on av.item_id = d.creative_id and av.advertiser_id = d.advertiser_id
group by d.advertiser_id, d.campaign_id, d.product_id, d.creative_id;
