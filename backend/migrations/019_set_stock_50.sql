-- ============================================================
-- 019: Set all product variant stock to 50 for testing
-- TEMPORARY: This sets every variant to 50 units
-- ============================================================

UPDATE product_variants SET stock = 50, updated_at = NOW();
