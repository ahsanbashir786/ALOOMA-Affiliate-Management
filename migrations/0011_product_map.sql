-- 0011: which of the 13 ALOOMA products each TikTok listing (product ID) and each SKU ID is. Additive.
-- A listing has one product; a single SKU can be an add-on that is really another product (a pillow sold inside a mattress protector listing).
create table if not exists product_map (
  product_id text primary key,
  product_key text not null,
  confirmed boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid constraint product_map_updated_by_users_id_fk references users(id) on delete set null
);
create table if not exists sku_map (
  sku_id text primary key,
  product_id text,
  product_key text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid constraint sku_map_updated_by_users_id_fk references users(id) on delete set null
);
create table if not exists product_map_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid constraint product_map_log_user_id_users_id_fk references users(id) on delete set null,
  kind text not null,
  ref text not null,
  from_key text,
  from_confirmed boolean,
  to_key text,
  undone_at timestamptz
);
create index if not exists product_map_log_at on product_map_log (at desc);
