-- 0027: how each video is authorized for ads (TikTok's tt_account_authorization_type: TTS_TT shop account, AFFILIATE mass authorization,
-- TT_USER business account, BC_AUTH_TT Business Center, AUTH_CODE video code).
alter table ads_creative_daily add column if not exists authorization_type text;
