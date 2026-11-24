-- 0044: affiliate order lines prepared once per sync, so every screen reads ready values instead of working them out on every view:
-- the Malaysian calendar day, the content type in plain words, the sale value, and whether the line counts (not returned, not cancelled).
-- Filled and kept fresh by the app (src/lib/creators/aff-lines.ts); the product (one of the 13) is still joined live, so a mapping change shows at once.
create table if not exists tt_aff_lines (
  order_id text not null,
  sku_id text not null,
  creator text,
  product_id text,
  seller_sku text,
  sku_name text,
  content_id text,
  created_at timestamptz,
  day date,
  content_type text not null,
  pay numeric not null,
  qty integer not null,
  comm numeric not null,
  valid boolean not null,
  primary key (order_id, sku_id)
);
create index if not exists tt_aff_lines_day on tt_aff_lines (day);
create index if not exists tt_aff_lines_creator_day on tt_aff_lines (creator, day);
create index if not exists tt_aff_lines_product_day on tt_aff_lines (product_id, day);
create index if not exists tt_aff_lines_content on tt_aff_lines (content_id);
