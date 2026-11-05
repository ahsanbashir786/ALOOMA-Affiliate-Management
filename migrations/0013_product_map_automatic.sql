-- 0013: product names are now worked out automatically; the confirm screen, SKU overrides and change log are gone. Product_map keeps only the automatic answer.
drop table if exists product_map_log;
drop table if exists sku_map;
alter table product_map drop column if exists confirmed;
alter table product_map drop column if exists updated_by;
