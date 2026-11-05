-- When each person last signed in. Filled from their newest session for existing users.
alter table users add column if not exists last_login_at timestamp;
update users u set last_login_at = (select max(s.created_at) from sessions s where s.user_id = u.id) where last_login_at is null;
