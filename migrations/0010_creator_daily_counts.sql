-- 0010: one row per day with the headline Creators counts, so the top boxes can show change over time. Additive.
create table if not exists creator_daily_counts (
  day date primary key,
  creators int not null,
  sellers int not null,
  todo int not null,
  unowned int not null,
  recorded_at timestamptz not null default now()
);
