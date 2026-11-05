-- 0015: Execution Plan v2. Every creator an action is about (not only a few), with their details and whether they were contacted.
create table if not exists ep_task_creators (
  task_id uuid not null constraint ep_task_creators_task_id_fk references ep_tasks(id) on delete cascade,
  username text not null,
  rank integer not null default 0,
  note text not null default '',
  value numeric not null default 0,
  data jsonb not null default '{}'::jsonb,
  contacted_at timestamptz,
  contacted_by uuid constraint ep_task_creators_contacted_by_users_id_fk references users(id) on delete set null,
  primary key (task_id, username)
);
create index if not exists ep_task_creators_rank on ep_task_creators (task_id, rank);
