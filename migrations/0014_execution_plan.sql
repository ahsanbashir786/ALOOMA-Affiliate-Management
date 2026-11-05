-- 0014: Execution Plan. Tasks the system writes from the product analysis, who handles them, and what happened.
create table if not exists ep_tasks (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  product_key text not null,
  category text not null,
  kind text not null,
  priority smallint not null default 2,
  title text not null,
  summary text not null,
  steps jsonb not null default '[]'::jsonb,
  steps_done jsonb not null default '[]'::jsonb,
  creators jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  impact_rm numeric not null default 0,
  status text not null default 'not_started',
  due_on date,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
-- One open task per problem: while it is open the system only refreshes its numbers, never makes a copy.
create unique index if not exists ep_tasks_open_fingerprint on ep_tasks (fingerprint) where status in ('not_started', 'pending');
create index if not exists ep_tasks_product on ep_tasks (product_key, status);
create table if not exists ep_task_assignees (
  task_id uuid not null constraint ep_task_assignees_task_id_fk references ep_tasks(id) on delete cascade,
  user_id uuid not null constraint ep_task_assignees_user_id_users_id_fk references users(id) on delete cascade,
  assigned_by uuid constraint ep_task_assignees_by_users_id_fk references users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create table if not exists ep_events (
  id bigserial primary key,
  task_id uuid not null constraint ep_events_task_id_fk references ep_tasks(id) on delete cascade,
  user_id uuid constraint ep_events_user_id_users_id_fk references users(id) on delete set null,
  kind text not null,
  text text,
  created_at timestamptz not null default now()
);
create index if not exists ep_events_task on ep_events (task_id, created_at);
create table if not exists ep_product_leads (
  product_key text not null,
  user_id uuid not null constraint ep_product_leads_user_id_users_id_fk references users(id) on delete cascade,
  primary key (product_key, user_id)
);
