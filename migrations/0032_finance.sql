-- 0032: Finance, from TikTok Shop (scope seller.finance.info).
--  tt_fin_statements   one per day: what TikTok settled and whether it has paid it (Get Statements, 202309)
--  tt_fin_transactions every order or adjustment inside a statement, with the fee breakdown (Get Transactions by Statement, 202501)
--  tt_fin_unsettled    orders not paid yet, with TikTok's estimate (Get Unsettled Transactions, 202507)
-- Amounts are kept exactly as TikTok sends them (a fee is a negative number). Malaysia is a SEA market, so Get Payments is not available; the statement carries the payment status and time.
create table if not exists tt_fin_statements (
  id text primary key,
  statement_time timestamptz,
  settlement_amount numeric(16,2),
  currency text,
  revenue_amount numeric(16,2),
  fee_amount numeric(16,2),
  adjustment_amount numeric(16,2),
  shipping_cost_amount numeric(16,2),
  net_sales_amount numeric(16,2),
  payment_status text,
  payment_id text,
  payment_time timestamptz,
  payable_amount numeric(16,2),
  reserve_amount numeric(16,2),
  tx_loaded boolean not null default false,
  tx_loaded_at timestamptz,
  raw jsonb,
  h text,
  synced_at timestamptz not null default now()
);
create index if not exists tt_fin_statements_time on tt_fin_statements (statement_time desc);
create index if not exists tt_fin_statements_paid on tt_fin_statements (payment_time);

create table if not exists tt_fin_transactions (
  statement_id text not null,
  id text not null,
  type text,
  order_id text,
  order_create_time timestamptz,
  adjustment_id text,
  adjustment_order_id text,
  settlement_amount numeric(16,2),
  revenue_amount numeric(16,2),
  shipping_cost_amount numeric(16,2),
  fee_tax_amount numeric(16,2),
  adjustment_amount numeric(16,2),
  subtotal_before_discount numeric(16,2),
  refund_subtotal numeric(16,2),
  seller_discount numeric(16,2),
  seller_discount_refund numeric(16,2),
  platform_commission numeric(16,2),
  affiliate_commission numeric(16,2),
  transaction_fee numeric(16,2),
  sfp_service_fee numeric(16,2),
  gmv_max_ad_fee numeric(16,2),
  gmv_max_coupon_fee numeric(16,2),
  other_fees numeric(16,2),
  tax_amount numeric(16,2),
  actual_shipping_fee numeric(16,2),
  customer_paid_shipping numeric(16,2),
  shipping_discount numeric(16,2),
  raw jsonb,
  h text,
  synced_at timestamptz not null default now(),
  primary key (statement_id, id)
);
create index if not exists tt_fin_transactions_order on tt_fin_transactions (order_id);
create index if not exists tt_fin_transactions_created on tt_fin_transactions (order_create_time);

create table if not exists tt_fin_unsettled (
  id text primary key,
  type text,
  order_id text,
  order_create_time timestamptz,
  order_delivery_time timestamptz,
  status text,
  unsettled_reason text,
  currency text,
  est_settlement_amount numeric(16,2),
  est_revenue_amount numeric(16,2),
  est_shipping_cost_amount numeric(16,2),
  est_fee_tax_amount numeric(16,2),
  est_adjustment_amount numeric(16,2),
  raw jsonb,
  h text,
  synced_at timestamptz not null default now()
);
create index if not exists tt_fin_unsettled_created on tt_fin_unsettled (order_create_time);
