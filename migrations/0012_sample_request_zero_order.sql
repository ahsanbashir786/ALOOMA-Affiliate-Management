-- 0012: TikTok writes "0" as the order number of a sample request that has not shipped. That is "no order": clear it. Idempotent; nothing else changes.
update tt_sample_requests set order_id = null where order_id is not null and order_id ~ '^0*$';
