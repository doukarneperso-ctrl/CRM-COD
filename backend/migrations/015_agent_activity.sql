-- Migration 015: Agent activity tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;
