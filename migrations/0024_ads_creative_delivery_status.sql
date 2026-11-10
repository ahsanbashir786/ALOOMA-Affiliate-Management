-- 0024: the delivery (exploration) status of a creative, when TikTok's report gives it (e.g. Performing / Underperforming / Ineligible).
alter table ads_creative_daily add column if not exists delivery_status text;
