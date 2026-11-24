-- 0045: when a sample request was decided (approved or rejected). TikTok does not send the time, so the database notes it the moment
-- our copy of the request changes to approved or rejected: by this app, or by a sync after someone decided in TikTok Seller Center.
alter table tt_sample_requests add column if not exists decided_at timestamptz;
create or replace function tt_sample_requests_decided() returns trigger language plpgsql as $$
begin
  if new.decided_at is null
     and upper(coalesce(new.status, '')) ~ '(APPROV|REJECT|DECLIN)'
     and upper(coalesce(old.status, '')) !~ '(APPROV|REJECT|DECLIN)' then
    new.decided_at := now();
  end if;
  return new;
end $$;
drop trigger if exists tt_sample_requests_decided on tt_sample_requests;
create trigger tt_sample_requests_decided before update on tt_sample_requests for each row execute function tt_sample_requests_decided();
