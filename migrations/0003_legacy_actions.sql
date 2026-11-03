-- 0003: carry the old Action centre history into the staff history WITHOUT inventing dates or contacts.
-- • The `actions` table is kept exactly as it is (notes, assignees, statuses stay readable on the creator timeline).
-- • Only actions staff marked "sent" AND that have a recorded completion time become a "contacted" event, at that recorded time,
--   by the recorded assignee, flagged legacy (they never create follow-up reminders and carry no invented follow-up dates).
-- • "done", "dismissed", "in progress" and "open" items are NOT turned into events: they do not prove a message was sent.
-- Old timestamps were written as UTC wall-clock into `timestamp` columns.
insert into staff_events (username, kind, at, user_id, details)
select a.username, 'contacted', a.completed_at at time zone 'UTC', a.assignee_id,
  jsonb_build_object('legacy', true, 'legacyActionId', a.id, 'type', a.type, 'note', a.note)
from actions a
where a.status = 'sent' and a.completed_at is not null
  and not exists (select 1 from staff_events e where e.details ->> 'legacyActionId' = a.id::text);
