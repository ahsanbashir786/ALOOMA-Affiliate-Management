-- 0040: more Shopee data: returns, ad spend, wallet, the day Shopee released the money, and stock at Shopee (FBS).
alter table shopee_escrow add column if not exists released_at timestamptz;   -- the day Shopee released the money to the seller wallet
alter table shopee_escrow add column if not exists payout_amount numeric(14,2);

create table if not exists shopee_returns (
  return_sn text primary key,
  order_sn text not null,
  status text,
  reason text,
  created_at timestamptz,
  remote_updated_at timestamptz,
  refund_amount numeric(14,2),
  currency text,
  items jsonb not null default '[]'::jsonb,       -- [{ sku, qty, name, refund }]
  pieces int not null default 0,
  synced_at timestamptz not null default now()
);
create index if not exists shopee_returns_order on shopee_returns (order_sn);

create table if not exists shopee_ads_daily (
  day date primary key,
  impressions bigint,
  clicks bigint,
  expense numeric(14,2) not null default 0,
  orders int,
  gmv numeric(14,2),
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists shopee_wallet_tx (
  tx_key text primary key,
  created_at timestamptz not null,
  transaction_type text,
  money_flow text,                                 -- MONEY_IN or MONEY_OUT
  amount numeric(14,2) not null default 0,         -- signed: money in is positive, money out is negative
  balance numeric(14,2),
  status text,
  order_sn text,
  withdrawal_id text,
  description text,
  synced_at timestamptz not null default now()
);
create index if not exists shopee_wallet_tx_created on shopee_wallet_tx (created_at);

create table if not exists shopee_stock (
  item_id bigint not null,
  model_id bigint not null default 0,
  sku text,
  name text,
  seller_stock int not null default 0,             -- in your own warehouse
  shopee_stock int not null default 0,             -- in Shopee's warehouse (FBS)
  reserved int not null default 0,
  synced_at timestamptz not null default now(),
  primary key (item_id, model_id)
);
create index if not exists shopee_stock_sku on shopee_stock (sku);
