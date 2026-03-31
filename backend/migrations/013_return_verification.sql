-- Migration 013: Add return verification columns to orders
-- These columns support the return verification workflow

ALTER TABLE orders ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_verified_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_result VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_note TEXT;
