-- 0038: One inventory file replaces the order costing, order dates and opening stock files.
-- A stock layer can now have its own arrival date: one SKU of one order can arrive in several deliveries (one layer per delivery).
alter table stock_layers add column if not exists arrival_date date;          -- the delivery day; empty = use the order's arrival date
alter table stock_layers add column if not exists receipt text;               -- the delivery's label in the file (for example "PDF #5b")
alter table stock_layers add column if not exists chunk int not null default 0; -- which delivery column of the file (0 = the whole order)
alter table stock_layers drop constraint if exists stock_layers_order_no_sku_key;
alter table stock_layers add constraint stock_layers_order_sku_chunk_key unique (order_no, sku, chunk);
-- The opening stock is no longer needed: the file has every delivery from the very first order.
delete from stock_orders where kind = 'opening';
