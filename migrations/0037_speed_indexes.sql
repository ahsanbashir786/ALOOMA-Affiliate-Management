-- 0037: speed. GMV Max looked up each campaign's last 14 days one by one without an index on the campaign.
create index if not exists ads_campaign_daily_campaign_day on ads_campaign_daily (campaign_id, day);
