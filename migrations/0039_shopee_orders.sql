-- 0039: Shopee orders and payments (the money Shopee holds for each order), so Profit And Loss can show Shopee next to TikTok.
--  shopee_orders  one row per Shopee order with its items (SKU and quantity)
--  shopee_escrow  what Shopee pays out for the order and every fee it takes (commission, service fee, shipping, vouchers ...)
create table if not exists shopee_orders (
  order_sn text primary key,
  shop_id text,
  status text,
  created_at timestamptz not null,
  paid_at timestamptz,
  remote_updated_at timestamptz,
  total_amount numeric(14,2),
  currency text,
  is_fbs boolean not null default false,          -- fulfilled by Shopee (Shopee packs and ships it)
  items jsonb not null default '[]'::jsonb,       -- [{ sku, qty, name, price }]
  pieces int not null default 0,
  first_seen_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  escrow_checked_at timestamptz                   -- when we last asked Shopee for this order's payment figures (none yet = not asked)
);
create index if not exists shopee_orders_created on shopee_orders (created_at);
create index if not exists shopee_orders_status on shopee_orders (status);

create table if not exists shopee_escrow (
  order_sn text primary key,
  escrow_amount numeric(14,2),
  original_price numeric(14,2),
  seller_discount numeric(14,2),
  voucher_seller numeric(14,2),
  commission_fee numeric(14,2),
  service_fee numeric(14,2),
  transaction_fee numeric(14,2),
  ams_fee numeric(14,2),
  actual_shipping_fee numeric(14,2),
  buyer_shipping_fee numeric(14,2),
  shipping_rebate numeric(14,2),
  reverse_shipping_fee numeric(14,2),
  refund_amount numeric(14,2),
  compensation numeric(14,2),
  raw jsonb,
  synced_at timestamptz not null default now()
);
