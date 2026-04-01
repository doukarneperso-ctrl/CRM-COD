-- ============================================================
-- 017: Missing Schema
-- Adds label_printed_at to orders which was referenced in
-- code but never created in the database schema.
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMP;
