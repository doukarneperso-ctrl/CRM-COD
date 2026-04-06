-- ============================================================
-- 018: Fix system_settings missing columns
-- The system_settings table was created without description
-- and category columns which the settings route queries.
-- ============================================================

ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'general';

-- Backfill category for known settings
UPDATE system_settings SET category = 'general' WHERE category IS NULL;
