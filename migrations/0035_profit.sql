-- 0035: Order profit, monthly P&L and Claim Back.
--  profit_fulfilment_months  the real 3PL invoice of a month, when you have it (otherwise the per-piece rate in Settings is used)
--  claim_back_items          the status of every amount you may claim back (open, claimed, recovered, dismissed)
--  stock_orders.source       'file' for the first costing file, 'app' for orders added later in the app
create table if not exists profit_fulfilment_months (
  month date primary key, -- first day of the month
  amount numeric(14,2) not null,
  note text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists claim_back_items (
  key text primary key, -- order_id | kind | transaction id
  order_id text not null,
  kind text not null,
  amount numeric(14,2) not null,
  status text not null default 'open' check (status in ('open', 'claimed', 'recovered', 'dismissed')),
  note text,
  updated_by text,
  updated_at timestamptz not null default now()
);
create index if not exists claim_back_items_status on claim_back_items (status);

alter table stock_orders add column if not exists source text not null default 'file';

insert into role_permissions (role_id, permission)
select r.id, 'profit' from roles r where r.is_admin
on conflict do nothing;
