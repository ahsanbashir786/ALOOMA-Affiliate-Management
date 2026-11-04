-- 0008: per-window video figures, so a video's lifetime numbers can be added up across every window that was synced. Additive.
create table if not exists tt_video_windows (
  video_id text not null,
  window_start date not null,
  window_end date not null,
  views bigint,
  gmv numeric(14,2),
  units_sold int,
  click_through_rate numeric(12,6),
  h text,
  synced_at timestamptz not null default now(),
  primary key (video_id, window_start)
);
create index if not exists tt_video_windows_video on tt_video_windows (video_id);
