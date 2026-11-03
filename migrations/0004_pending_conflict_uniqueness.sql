-- 0004: the same order line can be in conflict, resolved, and in conflict again – any number of times.
-- The old unique index included `status`, so a second ACCEPTED (or DISMISSED) row for one line violated it.
-- Only PENDING conflicts need to be unique (one open question per line). All resolved history stays exactly as it is.
drop index if exists import_conflicts_line_uq;
create unique index if not exists import_conflicts_pending_uq on import_conflicts (kind, order_id, sku_id) where status = 'pending';
