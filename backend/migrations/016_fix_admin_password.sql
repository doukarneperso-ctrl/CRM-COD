-- ============================================================
-- Migration 016: Fix admin password hash
-- The original seed had an incorrect bcrypt hash for 'admin123'
-- This updates it with the correct hash
-- ============================================================

UPDATE users
SET password_hash = '$2b$12$oqEykdlFVPmlPHlo0D.qOOufTeNfdmMjluv6YMnl9wAbr0RiMUIfW',
    updated_at = NOW()
WHERE username = 'admin';
