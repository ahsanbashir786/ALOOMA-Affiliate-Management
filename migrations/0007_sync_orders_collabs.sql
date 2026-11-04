-- 0007: Data Sync additions. Additive: two new tables. Sample orders hold shipping status and dates only (no customer data).
create table if not exists tt_orders (
  order_id text primary key,
  status text,
  is_sample boolean,
  created_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz,
  delivered_at timestamptz,
  total_amount numeric(14,2),
  currency text,
  tracking_number text,
  shipping_provider text,
  lines jsonb,
  is_final boolean not null default false,
  h text,
  synced_at timestamptz not null default now()
);

create table if not exists tt_open_collabs (
  id text primary key,
  product_id text,
  title text,
  status text,
  commission_rate numeric(12,4),
  commission_start timestamptz,
  commission_end timestamptz,
  creators int,
  showcasing int,
  needs_approval boolean,
  stock int,
  price_min numeric(14,2),
  price_max numeric(14,2),
  h text,
  synced_at timestamptz not null default now()
);
