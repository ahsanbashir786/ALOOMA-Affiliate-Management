-- 0034: Stock and FIFO costing. The SKU list, bundle parts, and every stock-in order with its landed cost per piece.
create table if not exists stock_skus (
  sku text primary key,
  name text,
  family text,
  created_at timestamptz not null default now()
);

-- A bundle (set) sold as one listing. Stock is taken from each part separately.
create table if not exists stock_bundles (
  set_sku text primary key,
  name text,
  fbs_sku text, -- the Fulfilled-by-Shopee version of the same bundle
  created_at timestamptz not null default now()
);
create table if not exists stock_bundle_parts (
  set_sku text not null references stock_bundles(set_sku) on delete cascade,
  part_sku text not null,
  qty int not null check (qty > 0),
  primary key (set_sku, part_sku)
);

-- One row per stock-in order (1A, 1B, ..., 30, and OPENING for the stock on hand at the start).
create table if not exists stock_orders (
  order_no text primary key,
  sort_no int not null,           -- oldest first; breaks ties inside the same arrival date
  kind text not null default 'order' check (kind in ('opening', 'order')),
  supplier_file text,
  purchase_date date,
  invoice_refs text,
  arrival_date date,              -- the day the pieces are counted as in stock (FIFO uses this)
  arrival_exact boolean not null default false, -- false = only the month is known, the date is an estimate
  arrival_note text,
  product_rmb numeric(16,2),
  product_rm numeric(16,2),
  freight_rm numeric(16,2),
  note text,
  created_at timestamptz not null default now()
);

-- One row per SKU in a stock-in order. total_cost_rm is the landed cost (product + freight on paid pieces) of the whole line.
create table if not exists stock_layers (
  id bigserial primary key,
  order_no text not null references stock_orders(order_no) on delete cascade,
  sku text not null,
  paid_qty int not null default 0,
  free_qty int not null default 0,
  unit_rmb numeric(14,4),
  rmb_per_rm numeric(10,5),
  unit_rm numeric(14,4),
  freight_per_paid numeric(14,6),
  total_cost_rm numeric(16,4) not null,
  unique (order_no, sku)
);
create index if not exists stock_layers_sku on stock_layers (sku);

-- The new Stock screen. Admin always has every screen.
insert into role_permissions (role_id, permission)
select r.id, 'stock' from roles r where r.is_admin
on conflict do nothing;
