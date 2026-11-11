-- 0026: the exploration status (Outstanding / Performing / Underperforming / Calculating / Exploring) and the boost status of a video,
-- when TikTok's creative-level report gives them. The names are found from TikTok's own list of allowed metrics.
alter table ads_creative_daily add column if not exists exploration_status text;
alter table ads_creative_daily add column if not exists boost_status text;
