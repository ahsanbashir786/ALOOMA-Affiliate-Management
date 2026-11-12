-- 0033: the Finance screen was removed (the TikTok settlement data it was built on is still synced: tt_fin_statements, tt_fin_transactions, tt_fin_unsettled).
delete from role_permissions where permission = 'finance';
