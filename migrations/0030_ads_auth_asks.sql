-- 0030: Authorization Rescue: when a creator was asked to authorize their videos for ads again (so nobody is asked twice by mistake).
create table if not exists ads_auth_asks (
  id bigserial primary key,
  creator text not null,
  asked_at timestamptz not null default now(),
  asked_by text,
  video_count integer not null default 0,
  note text
);
create index if not exists ads_auth_asks_creator on ads_auth_asks (creator, asked_at desc);
